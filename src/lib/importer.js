// Bring your own data: MySQL dumps (mysqldump / phpMyAdmin / Workbench exports), CSV files or pasted SQL
// are converted and loaded into a separate in-browser database. Nothing is uploaded anywhere.
import { openDb, exec, toSqlite, splitStatements, mysqlError } from './sql';
import { meta } from './admin';

// ---------------- MySQL dump → statements SQLite (via our shims) can run ----------------

// MySQL escapes quotes with backslashes ('O\'Brien'); SQLite doubles them ('O''Brien').
// Runs over the whole file before splitting, so a \' never confuses the statement splitter.
function convertStrings(s) {
  let out = '', i = 0;
  const ESC = { "'": "''", '"': '"', '\\': '\\', n: '\n', r: '\r', t: '\t', 0: '', Z: '\x1a', b: '\b', '%': '\\%', _: '\\_' };
  while (i < s.length) {
    const ch = s[i];
    if ((ch === '-' && s[i + 1] === '-' && /\s/.test(s[i + 2] || ' ')) || ch === '#') { // comment: copy to end of line
      const j = s.indexOf('\n', i);
      const end = j < 0 ? s.length : j;
      out += s.slice(i, end); i = end; continue;
    }
    if (ch === '`') { const j = s.indexOf('`', i + 1); out += s.slice(i, j < 0 ? s.length : j + 1); i = j < 0 ? s.length : j + 1; continue; }
    if (ch !== "'") { out += ch; i++; continue; }
    out += "'"; i++;
    while (i < s.length) {
      const c = s[i];
      if (c === '\\') { out += ESC[s[i + 1]] ?? s[i + 1] ?? ''; i += 2; continue; }
      if (c === "'" && s[i + 1] === "'") { out += "''"; i += 2; continue; }
      if (c === "'") { out += "'"; i++; break; }
      out += c; i++;
    }
  }
  return out;
}

const SKIP = /^(SET|LOCK\s+TABLES|UNLOCK\s+TABLES|USE|CREATE\s+(DATABASE|SCHEMA)|DROP\s+(DATABASE|SCHEMA)|START\s+TRANSACTION|BEGIN|COMMIT)\b/i;

export function convertDump(text) {
  const warnings = [];
  let s = text.replace(/\r\n?/g, '\n')
    .replace(/\/\*!\d*\s*([\s\S]*?)\*\//g, '$1') // version comments /*!40101 … */ are meant to run
    .replace(/\/\*[\s\S]*?\*\//g, '') // ordinary block comments
    .replace(/\bb'([01]+)'/g, (m, bits) => String(parseInt(bits, 2))); // BIT literals
  s = convertStrings(s);
  const statements = [];
  const indexNames = new Set();
  let dbName = (text.match(/^\s*(?:USE|CREATE\s+DATABASE(?:\s+IF\s+NOT\s+EXISTS)?)\s+`?(\w+)`?/im) || [])[1] || null;
  for (let st of splitStatements(s)) {
    st = st.replace(/^(--|#)[^\n]*\n?/gm, '').trim();
    if (!st || SKIP.test(st) || /^ALTER\s+TABLE\s+\S+\s+(DISABLE|ENABLE)\s+KEYS$/i.test(st)) continue;
    if (/^CREATE\s+(?:DEFINER\s*=\s*\S+\s+)?(TRIGGER|FUNCTION|EVENT)\b/i.test(st)) { warnings.push(`Skipped a ${RegExp.$1.toLowerCase()} (not supported here)`); continue; }
    st = st.replace(/^CREATE\s+(?:OR\s+REPLACE\s+)?(?:ALGORITHM\s*=\s*\w+\s+)?(?:DEFINER\s*=\s*\S+\s+)?(?:SQL\s+SECURITY\s+\w+\s+)?VIEW/i, 'CREATE VIEW')
      .replace(/\b_(?:binary|utf8mb4|utf8mb3|utf8|latin1)\s*'/gi, "'");
    // MySQL index names are per table, SQLite's are global: rename a repeat (KEY `customer_id` in two tables)
    const table = (st.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/i) || [])[1];
    if (table) st = st.replace(/\b(KEY|INDEX)\s+`?(\w+)`?\s*\(/gi, (m, kw, n) => {
      const name = indexNames.has(n) ? `${table}_${n}` : n;
      indexNames.add(name);
      return `${kw} \`${name}\` (`;
    });
    statements.push(st);
  }
  return { statements, warnings, dbName };
}

// ---------------- CSV → CREATE TABLE + INSERTs ----------------

function parseCsv(text) {
  const first = text.split('\n')[0] || '';
  const delim = [',', ';', '\t', '|'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}
const ident = (s, fallback) => {
  const n = String(s).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return !n ? fallback : /^\d/.test(n) ? `c_${n}` : n;
};
function inferType(values) {
  const v = values.filter((x) => x !== '');
  if (!v.length) return 'VARCHAR(255)';
  if (v.every((x) => /^-?\d+$/.test(x))) return v.some((x) => Math.abs(+x) > 2147483647) ? 'BIGINT' : 'INT';
  if (v.every((x) => /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(x))) {
    const scale = Math.max(...v.map((x) => (x.split('.')[1] || '').length));
    return scale <= 4 && !v.some((x) => /e/i.test(x)) ? `DECIMAL(${Math.min(30, Math.max(...v.map((x) => x.replace(/[-.]/g, '').length)) + 2)},${scale})` : 'DOUBLE';
  }
  if (v.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) return 'DATE';
  if (v.every((x) => /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(x))) return 'DATETIME';
  const len = Math.max(...v.map((x) => x.length));
  return len > 255 ? 'TEXT' : `VARCHAR(${len <= 50 ? 50 : len <= 100 ? 100 : 255})`;
}
export function csvToStatements(fileName, text) {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length < 1) throw new Error(`${fileName}: the file is empty`);
  const table = ident(fileName.replace(/\.[^.]+$/, ''), 'imported');
  const seen = new Set();
  const cols = rows[0].map((h, i) => { let n = ident(h, `col_${i + 1}`); while (seen.has(n)) n += '_'; seen.add(n); return n; });
  const data = rows.slice(1).map((r) => cols.map((_, i) => (r[i] ?? '').trim()));
  const types = cols.map((_, i) => inferType(data.map((r) => r[i])));
  const lit = (v, t) => (v === '' ? 'NULL' : /^(INT|BIGINT|DECIMAL|DOUBLE)/.test(t) ? v : `'${v.replace(/'/g, "''")}'`);
  const statements = [`CREATE TABLE \`${table}\` (\n${cols.map((c, i) => `  \`${c}\` ${types[i]}`).join(',\n')}\n)`];
  for (let i = 0; i < data.length; i += 500)
    statements.push(`INSERT INTO \`${table}\` VALUES\n${data.slice(i, i + 500).map((r) => `(${r.map((v, j) => lit(v, types[j])).join(', ')})`).join(',\n')}`);
  return { statements, table, columns: cols.length, rows: data.length, types: Object.fromEntries(cols.map((c, i) => [c, types[i]])) };
}

// ---------------- building, inspecting and keeping the dataset ----------------

let current = null; // { name, bytes, meta, tables: [{name, type, rows, columns}], warnings, loadedAt }
const listeners = new Set();
export const getDataset = () => current;
export const onDataset = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn(current));

export function openDataset() {
  if (!current) throw new Error('No data imported yet');
  const d = openDb(current.bytes);
  d.__meta = structuredClone(current.meta);
  return d;
}

export function describeDb(d) {
  return (d.exec(`SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name`)[0]?.values || [])
    .map(([name, type]) => ({
      name, type,
      rows: (() => { try { return d.exec(`SELECT COUNT(*) FROM "${name}"`)[0].values[0][0]; } catch { return 0; } })(), // a view over a table that failed to load
      columns: d.exec(`SELECT name, type FROM pragma_table_info('${name}')`)[0]?.values.map(([n, t]) => ({ name: n, type: t === 'INTEGER' ? 'INT' : t })) || [],
    }));
}

// Run statements into a fresh database. Bulk statements go straight to SQLite inside one transaction (fast);
// the rest go through the MySQL layer. Failures are collected rather than aborting the import.
export function buildDataset(name, statements, warnings = []) {
  const d = openDb();
  const failed = [];
  d.run('PRAGMA foreign_keys = OFF'); // dumps don't order tables by dependency
  d.exec('BEGIN');
  const t0 = performance.now();
  for (const st of statements) {
    const bulk = /^(INSERT|REPLACE|CREATE\s+TABLE|DROP\s+TABLE|CREATE\s+(UNIQUE\s+)?INDEX)\b/i.test(st);
    try {
      if (bulk) d.exec(toSqlite(st));
      else { d.exec('COMMIT'); exec(st, d); d.exec('BEGIN'); }
    } catch (e) {
      failed.push(`${st.replace(/\s+/g, ' ').slice(0, 70)}… → ${mysqlError(e.message, st)}`);
      try { if (!bulk) d.exec('BEGIN'); } catch { /* already open */ }
    }
  }
  try { d.exec('COMMIT'); } catch { /* nothing open */ }
  d.run('PRAGMA foreign_keys = ON');
  const tables = describeDb(d);
  if (!tables.length) { d.close(); throw new Error(failed[0] || 'Nothing to import: no CREATE TABLE statements were found'); }
  current = {
    name, bytes: d.export(), meta: structuredClone(meta(d)), tables,
    warnings: [...warnings, ...failed.slice(0, 20), ...(failed.length > 20 ? [`…and ${failed.length - 20} more failed statements`] : [])],
    failed: failed.length, statements: statements.length, ms: performance.now() - t0, loadedAt: new Date().toISOString(),
  };
  d.close();
  save();
  emit();
  return current;
}

// One import (all files together, or pasted SQL) may be at most 50 MB: it's all held in browser memory.
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
function checkSize(bytes, what) {
  if (bytes > MAX_IMPORT_BYTES) throw new Error(`${what}: ${mb(bytes)}. The limit is 50 MB per import: export fewer tables (mysqldump DB table1 table2 > part.sql) or fewer rows (--where="id <= 10000").`);
}

export async function importFiles(files) {
  // checked from file sizes, before anything is read
  checkSize(files.reduce((n, f) => n + f.size, 0), files.length > 1 ? `These ${files.length} files together` : files[0].name);
  const statements = [], warnings = [];
  let name = null;
  for (const f of files) {
    const text = await f.text();
    if (/\.(csv|tsv|txt)$/i.test(f.name) && !/^\s*(--|\/\*|CREATE|INSERT|DROP|SET)/i.test(text)) {
      const c = csvToStatements(f.name, text);
      statements.push(...c.statements);
      name ??= c.table;
    } else {
      const c = convertDump(text);
      statements.push(...c.statements); warnings.push(...c.warnings);
      name ??= c.dbName || f.name.replace(/\.[^.]+$/, '');
    }
  }
  return buildDataset(files.length > 1 && !name ? 'my_data' : name || 'my_data', statements, warnings);
}
export function importSql(text, name = 'my_data') {
  checkSize(new Blob([text]).size, 'The pasted SQL');
  const c = convertDump(text);
  return buildDataset(c.dbName || name, c.statements, c.warnings);
}

// IndexedDB keeps the dataset across reloads (localStorage is too small for real dumps).
function store(mode, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('learn-sql', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('dataset');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('dataset', mode);
      const r = fn(tx.objectStore('dataset'));
      tx.oncomplete = () => resolve(r?.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}
function save() { store('readwrite', (s) => s.put(current, 'current')).catch(() => { /* private mode: keep it for this session only */ }); }
export async function loadSaved() {
  try { current = (await store('readonly', (s) => s.get('current'))) || null; } catch { current = null; }
  emit();
  return current;
}
export async function clearDataset() {
  current = null;
  try { await store('readwrite', (s) => s.delete('current')); } catch { /* nothing saved */ }
  emit();
}
