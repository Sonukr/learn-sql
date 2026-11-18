// MySQL server features that SQLite doesn't have, emulated on top of it:
// ALTER TABLE (by rebuilding the table), SHOW CREATE TABLE, TRUNCATE, databases (ATTACH),
// users & privileges, @user variables and stored procedures (a small interpreter).
// Per-connection state lives on the sql.js Database object as d.__meta.
import { exec, splitTop, shimColumn, txOpen, mask, splitStatements } from './sql';

export const fail = (msg) => { throw new Error(msg); };
export const syntax = (near) =>
  `ERROR 1064 (42000): You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '${String(near).slice(0, 40)}'`;
export function meta(d) {
  return (d.__meta ||= { use: 'shop', as: null, users: new Map(), procs: new Map(), vars: new Map(), preDone: [] });
}
export const lit = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const q1 = (d, sql) => d.exec(sql)[0]?.values[0]?.[0];
const isConstraintItem = (it) => /^(PRIMARY|UNIQUE|FOREIGN|CONSTRAINT|CHECK|KEY|INDEX)\b/i.test(it.trim());
const colOf = (it) => (isConstraintItem(it) ? null : (it.trim().match(/^[`"]?(\w+)/) || [])[1]);
const splitQ = (q) => (q.includes('.') ? q.split('.') : ['main', q]);
const shown = (sch) => (sch === 'main' ? 'shop' : sch);

// ================= databases =================
const SYSTEM_DBS = ['information_schema', 'mysql', 'performance_schema', 'sys'];
export const dbNames = (d) => d.exec('PRAGMA database_list')[0].values.map((v) => v[1]).filter((n) => n !== 'temp').map(shown);
export const schemaOf = (d) => (meta(d).use === 'shop' ? 'main' : meta(d).use);

// Point unqualified table names at the current database (USE) and map shop.x → main.x.
export function qualify(st, d) {
  const s = st.replace(/\bshop\.(?=`?\w)/gi, 'main.');
  const db = meta(d).use;
  if (db === 'shop') return s;
  return s
    .replace(/^(\s*(?:DESCRIBE|DESC)\s+)`?(\w+)`?(?=\s*$)/i, `$1${db}.$2`)
    .replace(/\b(FROM|JOIN|INTO|UPDATE|TABLE(?:\s+IF\s+(?:NOT\s+)?EXISTS)?)\s+(?![\w]+\s*\.)`?(\w+)`?(?!\s*=)(?=[\s(;,]|$)/gi,
      (m, kw, n) => (/^(SELECT|IF|SET|VALUES|WHERE|AS|DUAL)$/i.test(n) ? m : `${kw} ${db}.${n}`));
}

function showTables(d, full) {
  const rows = d.exec(`SELECT name, type FROM ${schemaOf(d)}.sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' AND name <> '__rebuild' ORDER BY name`)[0]?.values || [];
  return { columns: [`Tables_in_${meta(d).use}`, ...(full ? ['Table_type'] : [])], values: rows.map(([n, t]) => (full ? [n, t === 'view' ? 'VIEW' : 'BASE TABLE'] : [n])) };
}

// ================= ALTER TABLE via rebuild =================
function tableSql(d, qname) {
  const [sch, t] = splitQ(qname);
  const sql = q1(d, `SELECT sql FROM ${sch}.sqlite_master WHERE type='table' AND name='${t}'`);
  if (!sql) fail(`ERROR 1146 (42S02): Table '${shown(sch)}.${t}' doesn't exist`);
  return sql;
}
const bodyItems = (sql) => splitTop(sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')')));

// SQLite's documented 12-step table rebuild: new table, copy rows, swap, recreate indexes, check FKs.
function rebuild(d, qname, edit, rename = {}, fill = {}) {
  const [sch, t] = splitQ(qname);
  const items = bodyItems(tableSql(d, qname));
  const next = edit(items);
  const oldCols = items.map(colOf).filter(Boolean);
  const newCols = next.map(colOf).filter(Boolean);
  const src = (c) => Object.keys(rename).find((o) => rename[o] === c) || c;
  const copy = newCols.filter((c) => oldCols.includes(src(c)));
  const filled = newCols.filter((c) => !copy.includes(c) && c in fill);
  const renameCols = (s) => s.replace(/\(([^)]*)\)\s*$/, (m, cols) => `(${cols.split(',').map((c) => rename[c.trim()] || c.trim()).join(', ')})`);
  const idx = (d.exec(`SELECT sql FROM ${sch}.sqlite_master WHERE type='index' AND tbl_name='${t}' AND sql IS NOT NULL`)[0]?.values || [])
    .map((v) => renameCols(v[0]))
    .filter((s) => s.slice(s.lastIndexOf('(') + 1, s.lastIndexOf(')')).split(',').every((c) => newCols.includes(c.trim()))) // MySQL drops a dropped column from its indexes
    .map((s) => (sch === 'main' ? s : s.replace(/^CREATE (UNIQUE )?INDEX (\w+)/i, `CREATE $1INDEX ${sch}.$2`)));
  if (txOpen(d)) d.exec('COMMIT'); // DDL commits implicitly in MySQL
  d.exec('PRAGMA foreign_keys = OFF');
  try {
    d.exec(`BEGIN; CREATE TABLE ${sch}.__rebuild (${next.join(', ')});
      INSERT INTO ${sch}.__rebuild (${[...copy, ...filled].join(', ')}) SELECT ${[...copy.map(src), ...filled.map((c) => fill[c])].join(', ')} FROM ${sch}.${t};
      DROP TABLE ${sch}.${t}; ALTER TABLE ${sch}.__rebuild RENAME TO ${t};`);
    for (const s of idx) d.exec(s);
    if (q1(d, `SELECT COUNT(*) FROM pragma_foreign_key_check('${t}', '${sch}')`)) fail('FOREIGN KEY constraint failed');
    d.exec('COMMIT');
  } catch (e) {
    try { d.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw e;
  } finally { d.exec('PRAGMA foreign_keys = ON'); }
}

const FK_INLINE = /\s+REFERENCES\s+`?\w+`?\s*\([^)]*\)(?:\s+ON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION))*/i;
const USER_CHECK = /(?<!CONSTRAINT\s+\w+)\s+CHECK\s*\((?:[^()]|\([^()]*\))*\)/i;
const SHIM_CHECKS = /\s+CONSTRAINT\s+(?:len|type|enum)_\w+\s+CHECK\s*\((?:[^()]|\([^()]*\))*\)/gi;

function replaceColumn(d, qname, c, newDef, rename = {}) {
  const items = bodyItems(tableSql(d, qname));
  const old = items.find((i) => colOf(i) === c);
  if (!old) fail(`ERROR 1054 (42S22): Unknown column '${c}' in '${splitQ(qname)[1]}'`);
  let def = shimColumn(newDef.trim());
  // keys belong to the table, not the column definition: MySQL keeps them through MODIFY
  if (/PRIMARY\s+KEY/i.test(old) && !/PRIMARY\s+KEY/i.test(def)) {
    if (/^\s*\w+\s+INTEGER\b/i.test(old)) def = def.replace(/^(\s*\w+\s+)(?:TINY|SMALL|MEDIUM|BIG)?INT(?:EGER)?\b/i, '$1INTEGER').replace(/\s+CONSTRAINT\s+type_\w+\s+CHECK\s*\((?:[^()]|\([^()]*\))*\)/i, '');
    def += ' PRIMARY KEY';
  }
  if (/\bUNIQUE\b/i.test(old) && !/\bUNIQUE\b/i.test(def)) def += ' UNIQUE';
  const fk = old.match(FK_INLINE);
  if (fk && !FK_INLINE.test(def)) def += fk[0];
  const ren = (s) => Object.entries(rename).reduce((acc, [o, n]) => acc.replace(new RegExp(`\\b${o}\\b`, 'g'), n), s);
  rebuild(d, qname, (its) => its.map((i) => (colOf(i) === c ? def : isConstraintItem(i) ? ren(i) : i)), rename);
}

function dropIndex(d, qname, name) {
  const [sch, t] = splitQ(qname);
  if (q1(d, `SELECT 1 FROM ${sch}.sqlite_master WHERE type='index' AND name='${name}' AND tbl_name='${t}'`))
    return void d.exec(`DROP INDEX ${sch === 'main' ? '' : sch + '.'}${name}`);
  const items = bodyItems(tableSql(d, qname));
  if (items.some((i) => colOf(i) === name && /\bUNIQUE\b/i.test(i)))
    return rebuild(d, qname, (its) => its.map((i) => (colOf(i) === name ? i.replace(/\s+UNIQUE\b/i, '') : i)));
  const uq = items.find((i) => new RegExp(`^CONSTRAINT\\s+${name}\\s+UNIQUE|^UNIQUE\\s*\\(\\s*${name}\\b`, 'i').test(i.trim()));
  if (uq) return rebuild(d, qname, (its) => its.filter((i) => i !== uq));
  fail(`ERROR 1091 (42000): Can't DROP '${name}'; check that column/key exists`);
}

function dropConstraint(d, qname, name) {
  const items = bodyItems(tableSql(d, qname));
  const named = items.find((i) => new RegExp(`^CONSTRAINT\\s+[\`"]?${name}[\`"]?\\s`, 'i').test(i.trim()));
  if (named) return rebuild(d, qname, (its) => its.filter((i) => i !== named));
  const m = name.match(/_(ibfk|chk)_(\d+)$/i);
  if (m) { // MySQL's generated names: t_ibfk_N / t_chk_N = the Nth unnamed foreign key / check
    const isFk = m[1].toLowerCase() === 'ibfk';
    let k = 0, target = -1;
    items.forEach((i, idx) => {
      const hit = isFk ? /REFERENCES/i.test(i) : USER_CHECK.test(i.replace(SHIM_CHECKS, '')) || /^CHECK\s*\(/i.test(i.trim());
      if (hit && ++k === +m[2]) target = idx;
    });
    if (target >= 0)
      return rebuild(d, qname, (its) => its.flatMap((i, idx) => (idx !== target ? [i] : isConstraintItem(i) ? [] : [isFk ? i.replace(FK_INLINE, '') : i.replace(USER_CHECK, '')])));
  }
  fail(`ERROR 3940 (HY000): Constraint '${name}' does not exist.`);
}

const implicitDefault = (def) => (/^\s*\w+\s+(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL)\b/i.test(def) ? '0' : "''");

export function alterTable(d, st) {
  const m = st.match(/^ALTER\s+TABLE\s+`?([\w.]+)`?\s+([\s\S]+)$/i);
  if (!m) fail(syntax(st));
  const [, qname, rest] = m;
  const [sch, t] = splitQ(qname);
  const pre = sch === 'main' ? '' : sch + '.';
  tableSql(d, qname);
  if (txOpen(d)) d.exec('COMMIT');
  for (const a of splitTop(rest)) {
    let x;
    if ((x = a.match(/^RENAME\s+COLUMN\s+`?(\w+)`?\s+TO\s+`?(\w+)`?$/i))) d.exec(`ALTER TABLE ${qname} RENAME COLUMN ${x[1]} TO ${x[2]}`);
    else if ((x = a.match(/^RENAME\s+(?:TO\s+|AS\s+)?`?(\w+)`?$/i))) d.exec(`ALTER TABLE ${qname} RENAME TO ${x[1]}`);
    else if ((x = a.match(/^ADD\s+(?:CONSTRAINT\s+`?(\w+)`?\s+)?UNIQUE\s*(?:(?:INDEX|KEY)\s*)?(?:`?(\w+)`?\s*)?\(([^)]*)\)$/i)))
      d.exec(`CREATE UNIQUE INDEX ${pre}${x[2] || x[1] || x[3].split(',')[0].trim()} ON ${t} (${x[3]})`);
    else if ((x = a.match(/^ADD\s+(?:INDEX|KEY)\s+`?(\w+)`?\s*\(([^)]*)\)$/i))) d.exec(`CREATE INDEX ${pre}${x[1]} ON ${t} (${x[2]})`);
    else if ((x = a.match(/^ADD\s+(?:CONSTRAINT\s+`?(\w+)`?\s+)?(PRIMARY\s+KEY|FOREIGN\s+KEY|CHECK)\s*([\s\S]*)$/i))) {
      const items = bodyItems(tableSql(d, qname));
      const kind = x[2].toUpperCase().replace(/\s+/, ' ');
      if (kind === 'PRIMARY KEY' && items.some((i) => /PRIMARY\s+KEY/i.test(i))) fail('ERROR 1068 (42000): Multiple primary key defined');
      const n = items.filter((i) => (kind === 'CHECK' ? USER_CHECK.test(i.replace(SHIM_CHECKS, '')) || /^(CONSTRAINT\s+\w+\s+)?CHECK/i.test(i.trim()) : /REFERENCES/i.test(i))).length + 1;
      const name = x[1] || (kind === 'FOREIGN KEY' ? `${t}_ibfk_${n}` : `${t}_chk_${n}`);
      rebuild(d, qname, (its) => [...its, `${kind === 'PRIMARY KEY' ? '' : `CONSTRAINT ${name} `}${kind} ${x[3]}`]);
    } else if ((x = a.match(/^DROP\s+(?:INDEX|KEY)\s+`?(\w+)`?$/i))) dropIndex(d, qname, x[1]);
    else if ((x = a.match(/^DROP\s+(?:FOREIGN\s+KEY|CHECK|CONSTRAINT)\s+`?(\w+)`?$/i))) dropConstraint(d, qname, x[1]);
    else if (/^DROP\s+PRIMARY\s+KEY$/i.test(a)) fail("ERROR: dropping a primary key isn't supported in this sandbox");
    else if ((x = a.match(/^DROP\s+(?:COLUMN\s+)?`?(\w+)`?$/i))) {
      const c = x[1];
      if (!bodyItems(tableSql(d, qname)).some((i) => colOf(i) === c)) fail(`ERROR 1091 (42000): Can't DROP '${c}'; check that column/key exists`);
      rebuild(d, qname, (its) => its.filter((i) => colOf(i) !== c && !(isConstraintItem(i) && new RegExp(`\\b${c}\\b`).test(i))));
    } else if ((x = a.match(/^MODIFY\s+(?:COLUMN\s+)?([\s\S]+)$/i))) replaceColumn(d, qname, x[1].trim().match(/^`?(\w+)/)[1], x[1]);
    else if ((x = a.match(/^CHANGE\s+(?:COLUMN\s+)?`?(\w+)`?\s+([\s\S]+)$/i))) {
      const nu = x[2].trim().match(/^`?(\w+)/)[1];
      replaceColumn(d, qname, x[1], x[2], nu !== x[1] ? { [x[1]]: nu } : {});
    } else if ((x = a.match(/^ALTER\s+(?:COLUMN\s+)?`?(\w+)`?\s+(?:SET\s+DEFAULT\s+([\s\S]+)|DROP\s+DEFAULT)$/i))) {
      const [, c, v] = x;
      rebuild(d, qname, (its) => its.map((i) => {
        if (colOf(i) !== c) return i;
        const noDef = i.replace(/\s+DEFAULT\s+('(?:[^']|'')*'|\([^)]*\)|[^\s,]+)/i, '');
        return v === undefined ? noDef : noDef.replace(/^(\s*[`"]?\w+[`"]?\s+\w+(?:\s*\([^)]*\))?(?:\s+UNSIGNED)?)/i, `$1 DEFAULT ${v.trim()}`);
      }));
    } else if ((x = a.match(/^ADD\s+(?:COLUMN\s+)?([\s\S]+)$/i))) {
      const def = shimColumn(x[1].trim());
      try { d.exec(`ALTER TABLE ${qname} ADD COLUMN ${def}`); } catch (e) {
        // SQLite can't add some columns in place (NOT NULL without default, UNIQUE…); MySQL can, so rebuild
        if (!/NOT NULL|UNIQUE|CHECK|non-constant|default/i.test(e.message)) throw e;
        const col = colOf(def);
        rebuild(d, qname, (its) => [...its.filter((i) => !isConstraintItem(i)), def, ...its.filter(isConstraintItem)], {},
          /NOT\s+NULL/i.test(def) && !/DEFAULT/i.test(def) ? { [col]: implicitDefault(def) } : {});
      }
    } else fail(syntax(a));
  }
}

export function truncate(d, qname) {
  const [sch, t] = splitQ(qname);
  tableSql(d, qname);
  for (const [o] of d.exec(`SELECT name FROM ${sch}.sqlite_master WHERE type='table' AND name <> '${t}'`)[0]?.values || [])
    if (q1(d, `SELECT COUNT(*) FROM pragma_foreign_key_list('${o}', '${sch}') WHERE "table" = '${t}'`))
      fail(`ERROR 1701 (42000): Cannot truncate a table referenced in a foreign key constraint (\`${shown(sch)}\`.\`${o}\`)`);
  if (txOpen(d)) d.exec('COMMIT'); // TRUNCATE commits implicitly and can't be rolled back
  d.exec(`DELETE FROM ${sch}.${t}`);
}

export function analyze(d, list) {
  const values = [];
  for (const raw of list.split(',')) {
    const q = raw.trim().replace(/`/g, '');
    const [sch, t] = splitQ(q);
    tableSql(d, q);
    d.exec(`ANALYZE ${sch}.${t}`);
    values.push([`${shown(sch)}.${t}`, 'analyze', 'status', 'OK']);
  }
  return { columns: ['Table', 'Op', 'Msg_type', 'Msg_text'], values };
}

// MySQL-flavoured DDL rebuilt from what SQLite stores (shim CHECKs removed, keys named as MySQL would).
const bt = (cols) => cols.split(',').map((c) => `\`${c.trim().replace(/[`"]/g, '')}\``).join(',');
export function showCreate(d, qname) {
  const [sch, t] = splitQ(qname);
  const lines = [], keys = [], cons = [];
  let fk = 0, chk = 0;
  for (let it of bodyItems(tableSql(d, qname))) {
    it = it.replace(/\s+/g, ' ').trim().replace(/"/g, '');
    let m;
    if (isConstraintItem(it)) {
      if ((m = it.match(/^PRIMARY KEY\s*\((.*)\)/i))) keys.unshift(`PRIMARY KEY (${bt(m[1])})`);
      else if ((m = it.match(/^(?:CONSTRAINT (\w+) )?UNIQUE\s*\((.*)\)/i))) keys.push(`UNIQUE KEY \`${m[1] || m[2].split(',')[0].trim()}\` (${bt(m[2])})`);
      else if ((m = it.match(/^(?:CONSTRAINT (\w+) )?FOREIGN KEY\s*\((\w+)\)\s*REFERENCES\s+(\w+)\s*\((\w+)\)(.*)$/i))) { fk++; cons.push(`CONSTRAINT \`${m[1] || `${t}_ibfk_${fk}`}\` FOREIGN KEY (\`${m[2]}\`) REFERENCES \`${m[3]}\` (\`${m[4]}\`)${m[5].trim() ? ' ' + m[5].trim() : ''}`); }
      else if ((m = it.match(/^(?:CONSTRAINT (\w+) )?CHECK\s*(\(.*\))$/i))) { chk++; cons.push(`CONSTRAINT \`${m[1] || `${t}_chk_${chk}`}\` CHECK ${m[2]}`); }
      continue;
    }
    let s = it;
    const col = colOf(s);
    if ((m = s.match(/^\w+\s+ENUM\b(.*?)\s+CONSTRAINT\s+enum_\w+\s+CHECK\s*\(\s*\w+\s+IN\s*(\(.*\))\s*\)\s*$/i))) s = `${col} enum${m[2]}${m[1]}`;
    s = s.replace(SHIM_CHECKS, '');
    if ((m = s.match(FK_INLINE))) {
      fk++;
      const r = m[0].match(/REFERENCES\s+`?(\w+)`?\s*\((\w+)\)(.*)/i);
      cons.push(`CONSTRAINT \`${t}_ibfk_${fk}\` FOREIGN KEY (\`${col}\`) REFERENCES \`${r[1]}\` (\`${r[2]}\`)${r[3].trim() ? ' ' + r[3].trim() : ''}`);
      s = s.replace(m[0], '');
    }
    if (/\bUNIQUE\b/i.test(s)) { s = s.replace(/\s+UNIQUE\b/i, ''); keys.push(`UNIQUE KEY \`${col}\` (\`${col}\`)`); }
    if ((m = s.match(USER_CHECK))) { chk++; cons.push(`CONSTRAINT \`${t}_chk_${chk}\` CHECK ${m[0].trim().replace(/^CHECK\s*/i, '')}`); s = s.replace(m[0], ''); }
    if (/PRIMARY KEY/i.test(s)) {
      const ai = /^\w+\s+INTEGER\b/i.test(s);
      s = s.replace(/\s+PRIMARY KEY/i, '');
      if (ai) s = s.replace(/^(\w+)\s+INTEGER\b/i, '$1 int').replace(/\s+NOT NULL/i, '') + ' NOT NULL AUTO_INCREMENT';
      keys.unshift(`PRIMARY KEY (\`${col}\`)`);
    }
    s = s.replace(/^(\w+)\s+(\w+)/, (_, c, ty) => `\`${c}\` ${ty.toLowerCase()}`);
    if (!/NOT NULL/i.test(s) && !/DEFAULT/i.test(s)) s += ' DEFAULT NULL';
    lines.push(s);
  }
  for (const [name, uniq, origin] of d.exec(`SELECT name, "unique", origin FROM pragma_index_list('${t}', '${sch}')`)[0]?.values || []) {
    if (origin !== 'c') continue;
    const cols = d.exec(`SELECT name FROM pragma_index_info('${name}', '${sch}') ORDER BY seqno`)[0].values.map((v) => `\`${v[0]}\``).join(',');
    keys.push(`${uniq ? 'UNIQUE ' : ''}KEY \`${name}\` (${cols})`);
  }
  const text = `CREATE TABLE \`${t}\` (\n  ${[...lines, ...keys, ...cons].join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
  return { columns: ['Table', 'Create Table'], values: [[t, text]] };
}

// ================= users & privileges =================
export const PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'INDEX', 'EXECUTE'];
export function userKey(spec) {
  const m = spec.trim().match(/^[`'"]?([\w.-]+)[`'"]?(?:\s*@\s*[`'"]?([\w.%-]+)[`'"]?)?$/);
  if (!m) fail(syntax(spec));
  return `${m[1]}@${m[2] || '%'}`;
}
const quoteUser = (k) => { const [u, h] = k.split('@'); return `'${u}'@'${h}'`; };
const btUser = (k) => { const [u, h] = k.split('@'); return `\`${u}\`@\`${h}\``; };
function objKey(d, obj) {
  const o = obj.replace(/[`\s]/g, '');
  if (o === '*.*' || o === '*') return o === '*' ? `${meta(d).use}.*` : '*.*';
  const [a, b] = o.includes('.') ? o.split('.') : [meta(d).use, o];
  return `${a}.${b}`;
}
function privList(s) {
  const p = s.trim().toUpperCase().replace(/\s+/g, ' ');
  if (/^ALL( PRIVILEGES)?$/.test(p)) return ['ALL'];
  return p.split(',').map((x) => x.trim()).map((x) => (PRIVS.includes(x) || x === 'USAGE' ? x : fail(syntax(x))));
}
export function has(d, user, priv, db, table) {
  const u = meta(d).users.get(user);
  if (!u) return false;
  for (const o of ['*.*', `${db}.*`, `${db}.${table}`]) {
    const s = u.get(o);
    if (s && (s.has('ALL') || s.has(priv))) return true;
  }
  return false;
}
function needUser(d, spec) {
  const k = userKey(spec);
  if (!meta(d).users.has(k)) fail(`ERROR 1410 (42000): You are not allowed to create a user with GRANT`);
  return k;
}
function grant(d, st) {
  const m = st.match(/^GRANT\s+([\s\S]+?)\s+ON\s+(?:TABLE\s+|PROCEDURE\s+)?(\S+)\s+TO\s+([\s\S]+?)(?:\s+WITH\s+GRANT\s+OPTION)?$/i);
  if (!m) fail(syntax(st));
  const privs = privList(m[1]), obj = objKey(d, m[2]), k = needUser(d, m[3]);
  const u = meta(d).users.get(k);
  if (!u.has(obj)) u.set(obj, new Set());
  privs.forEach((p) => u.get(obj).add(p));
  return null;
}
function revoke(d, st) {
  const m = st.match(/^REVOKE\s+([\s\S]+?)\s+ON\s+(?:TABLE\s+)?(\S+)\s+FROM\s+([\s\S]+)$/i);
  if (!m) fail(syntax(st));
  const privs = privList(m[1]), obj = objKey(d, m[2]), k = needUser(d, m[3]);
  const u = meta(d).users.get(k), set = u.get(obj);
  const [user, host] = k.split('@');
  if (!set) fail(`ERROR 1141 (42000): There is no such grant defined for user '${user}' on host '${host}'`);
  if (privs.includes('ALL')) set.clear(); else privs.forEach((p) => set.delete(p));
  if (!set.size) u.delete(obj);
  return null;
}
export function grantLines(d, k) {
  if (!k) return [['GRANT ALL PRIVILEGES ON *.* TO `root`@`localhost` WITH GRANT OPTION']];
  const u = meta(d).users.get(k);
  if (!u) { const [user, host] = k.split('@'); fail(`ERROR 1141 (42000): There is no such grant defined for user '${user}' on host '${host}'`); }
  const fmtObj = (o) => (o === '*.*' ? '*.*' : o.split('.').map((x) => (x === '*' ? '*' : `\`${x}\``)).join('.'));
  return [[`GRANT USAGE ON *.* TO ${btUser(k)}`],
    ...[...u].map(([o, s]) => [`GRANT ${s.has('ALL') ? 'ALL PRIVILEGES' : PRIVS.filter((p) => s.has(p)).join(', ')} ON ${fmtObj(o)} TO ${btUser(k)}`])];
}

// Called before every statement: enforce privileges when connected as a non-root user.
export function checkPrivileges(d, st) {
  const who = meta(d).as;
  if (!who) return;
  const [user, host] = who.split('@');
  if (/^(GRANT|REVOKE)\b|^(CREATE|DROP)\s+USER\b/i.test(st))
    fail('ERROR 1227 (42000): Access denied; you need (at least one of) the CREATE USER privilege(s) for this operation');
  const db = meta(d).use;
  const ref = (n) => { const [a, b] = n.includes('.') ? n.split('.') : [db, n]; return [a === 'main' ? 'shop' : a, b]; };
  const need = [];
  const del = st.match(/^\s*DELETE\s+FROM\s+`?([\w.]+)/i);
  let skipFrom = !!del;
  for (const m of st.matchAll(/\b(?:FROM|JOIN)\s+`?([\w.]+)`?/gi)) {
    if (/^(SELECT|DUAL)$/i.test(m[1])) continue;
    if (skipFrom) { skipFrom = false; continue; }
    need.push(['SELECT', ...ref(m[1])]);
  }
  let m;
  if (del) need.push(['DELETE', ...ref(del[1])]);
  if ((m = st.match(/^\s*INSERT\s+(?:IGNORE\s+)?INTO\s+`?([\w.]+)/i))) need.push(['INSERT', ...ref(m[1])]);
  if ((m = st.match(/^\s*UPDATE\s+`?([\w.]+)/i))) need.push(['UPDATE', ...ref(m[1])]);
  if ((m = st.match(/^\s*(CREATE|DROP|ALTER|TRUNCATE)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?`?([\w.]+)/i))) need.push([m[1].toUpperCase() === 'TRUNCATE' ? 'DROP' : m[1].toUpperCase(), ...ref(m[2])]);
  if ((m = st.match(/^\s*CALL\s+`?(\w+)/i))) need.push(['EXECUTE', db, m[1]]);
  for (const [p, a, b] of need)
    if (!has(d, who, p, a, b)) fail(`ERROR 1142 (42000): ${p} command denied to user '${user}'@'${host}' for table '${b}'`);
}

// ================= @variables =================
// Replace @vars (and, inside procedures, local variables/parameters) with literal values, outside quotes.
export function substitute(st, scope, vars) {
  return st.split(/('(?:[^']|'')*'|"[^"]*")/).map((part, i) => {
    if (i % 2) return part;
    let s = part.replace(/@(\w+)/g, (m, n) => lit(vars.has(n.toLowerCase()) ? vars.get(n.toLowerCase()) : null));
    if (scope?.size) s = s.replace(/(?<![.@`\w])([A-Za-z_]\w*)(?![\w`])/g, (m, n) => (scope.has(n.toLowerCase()) ? lit(scope.get(n.toLowerCase())) : m));
    return s;
  }).join('');
}
// SELECT @x → keep "@x" as the column name, like the MySQL client shows it.
export function withVars(st, vars) {
  let s = st;
  if (/^SELECT\b/i.test(s)) {
    const at = mask(s).search(/\sFROM\s/i);
    const head = at < 0 ? s.slice(6) : s.slice(6, at);
    s = 'SELECT ' + splitTop(head).map((it) => (/^@\w+$/.test(it.trim()) ? `${it.trim()} AS "${it.trim()}"` : it)).join(', ') + (at < 0 ? '' : s.slice(at));
  }
  return substitute(s, null, vars);
}
const hasVar = (st) => /@\w/.test(st.replace(/'(?:[^']|'')*'/g, ''));
function selectInto(st) {
  const m = st.match(/\bINTO\s+(@?\w+(?:\s*,\s*@?\w+)*)\s*(?=FROM\b|WHERE\b|LIMIT\b|$)/i);
  if (!m) return null;
  return { sql: st.slice(0, m.index) + st.slice(m.index + m[0].length), targets: m[1].split(',').map((x) => x.trim()) };
}

// ================= stored procedures =================
function balanced(s, open) {
  let dep = 0;
  for (let i = open; i < s.length; i++) { if (s[i] === '(') dep++; if (s[i] === ')' && --dep === 0) return i; }
  return -1;
}
function parseBlock(body) {
  let id = 0;
  const root = [], stack = [{ list: root }];
  const cur = () => stack[stack.length - 1].list;
  for (let c of splitStatements(body)) {
    c = c.replace(/--[^\n]*/g, '').trim();
    while (c) {
      let m;
      if ((m = c.match(/^IF\s+([\s\S]+?)\s+THEN\b\s*([\s\S]*)$/i))) {
        const node = { type: 'if', id: id++, text: `IF ${m[1]} THEN`, branches: [{ cond: m[1], list: [] }], else: null };
        cur().push(node); stack.push({ node, list: node.branches[0].list }); c = m[2]; continue;
      }
      if ((m = c.match(/^ELSEIF\s+([\s\S]+?)\s+THEN\b\s*([\s\S]*)$/i))) {
        const top = stack.pop();
        const b = { cond: m[1], list: [], id: id++, text: `ELSEIF ${m[1]} THEN` };
        top.node.branches.push(b); stack.push({ node: top.node, list: b.list }); c = m[2]; continue;
      }
      if ((m = c.match(/^ELSE\b\s*([\s\S]*)$/i))) {
        const top = stack.pop();
        top.node.else = []; top.node.elseId = id++;
        stack.push({ node: top.node, list: top.node.else }); c = m[1]; continue;
      }
      if (/^END\s+IF$/i.test(c)) { stack.pop(); break; }
      if ((m = c.match(/^WHILE\s+([\s\S]+?)\s+DO\b\s*([\s\S]*)$/i))) {
        const node = { type: 'while', id: id++, text: `WHILE ${m[1]} DO`, cond: m[1], list: [] };
        cur().push(node); stack.push({ node, list: node.list }); c = m[2]; continue;
      }
      if (/^END\s+WHILE$/i.test(c)) { stack.pop(); break; }
      cur().push({ type: 'stmt', id: id++, text: c });
      break;
    }
  }
  return root;
}
function createProc(d, st) {
  const m = st.match(/^CREATE\s+(?:DEFINER\s*=\s*\S+\s+)?PROCEDURE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(/i);
  if (!m) fail(syntax(st));
  const open = m.index + m[0].length - 1, close = balanced(st, open);
  if (close < 0) fail(syntax(st.slice(open)));
  const params = st.slice(open + 1, close).trim() ? splitTop(st.slice(open + 1, close)).map((p) => {
    const x = p.trim().match(/^(?:(IN|OUT|INOUT)\s+)?`?(\w+)`?\s+([\s\S]+)$/i);
    if (!x) fail(syntax(p));
    return { mode: (x[1] || 'IN').toUpperCase(), name: x[2], type: x[3].trim() };
  }) : [];
  const rest = st.slice(close + 1).replace(/^\s*(?:(?:COMMENT\s+'[^']*'|LANGUAGE\s+SQL|(?:NOT\s+)?DETERMINISTIC|CONTAINS\s+SQL|NO\s+SQL|READS\s+SQL\s+DATA|MODIFIES\s+SQL\s+DATA|SQL\s+SECURITY\s+\w+)\s*)*/i, '').trim();
  const body = /^BEGIN\b[\s\S]*\bEND$/i.test(rest) ? rest.replace(/^BEGIN\b/i, '').replace(/\bEND$/i, '') : rest;
  const key = m[1].toLowerCase();
  if (meta(d).procs.has(key)) fail(`ERROR 1304 (42000): PROCEDURE ${m[1]} already exists`);
  meta(d).procs.set(key, { name: m[1], params, tree: parseBlock(body), text: st });
}
const truthy = (v) => v !== null && v !== 0 && v !== '0' && v !== '';
function evalExpr(d, expr, scope, ctx) {
  const r = exec('SELECT ' + substitute(expr, scope, ctx.vars), d);
  return r?.values[0]?.[0] ?? null;
}
function assign(name, v, scope, ctx) {
  const n = name.toLowerCase();
  if (n.startsWith('@')) ctx.vars.set(n.slice(1), v);
  else if (scope.has(n)) scope.set(n, v);
  else fail(`ERROR 1193 (HY000): Unknown system variable '${name}'`);
}
const snapScope = (scope, ctx) => ({ ...Object.fromEntries(scope), ...Object.fromEntries([...ctx.vars].map(([k, v]) => ['@' + k, v])) });
function runList(d, list, scope, ctx) {
  for (const n of list) {
    if (n.type === 'if') {
      ctx.trace.push({ id: n.id, scope: snapScope(scope, ctx) });
      let done = false;
      for (const [bi, b] of n.branches.entries()) {
        if (truthy(evalExpr(d, b.cond, scope, ctx))) {
          if (bi) ctx.trace.push({ id: b.id, scope: snapScope(scope, ctx) });
          runList(d, b.list, scope, ctx); done = true; break;
        }
      }
      if (!done && n.else) { ctx.trace.push({ id: n.elseId, scope: snapScope(scope, ctx) }); runList(d, n.else, scope, ctx); }
    } else if (n.type === 'while') {
      let guard = 0;
      while (truthy(evalExpr(d, n.cond, scope, ctx))) {
        if (++guard > 10000) fail('ERROR: the loop ran more than 10,000 times and was stopped');
        ctx.trace.push({ id: n.id, scope: snapScope(scope, ctx) });
        runList(d, n.list, scope, ctx);
      }
      ctx.trace.push({ id: n.id, scope: snapScope(scope, ctx), exit: true });
    } else runStmt(d, n, scope, ctx);
  }
}
function runStmt(d, n, scope, ctx) {
  const s = n.text;
  const entry = { id: n.id };
  ctx.trace.push(entry);
  let m;
  if ((m = s.match(/^DECLARE\s+([\w\s,]+?)\s+([A-Za-z]+(?:\s*\([^)]*\))?(?:\s+UNSIGNED)?)(?:\s+DEFAULT\s+([\s\S]+))?$/i))) {
    const v = m[3] ? evalExpr(d, m[3], scope, ctx) : null;
    m[1].split(',').forEach((x) => scope.set(x.trim().toLowerCase(), v));
  } else if ((m = s.match(/^SET\s+([\s\S]+)$/i))) {
    for (const a of splitTop(m[1])) {
      const x = a.match(/^(@?\w+)\s*:?=\s*([\s\S]+)$/);
      if (!x) fail(syntax(a));
      assign(x[1], evalExpr(d, x[2], scope, ctx), scope, ctx);
    }
  } else if ((m = s.match(/^SIGNAL\s+SQLSTATE\s+(?:VALUE\s+)?'(\w+)'(?:\s+SET\s+MESSAGE_TEXT\s*=\s*([\s\S]+))?$/i))) {
    fail(`ERROR 1644 (${m[1]}): ${m[2] ? evalExpr(d, m[2], scope, ctx) : 'Unhandled user-defined exception condition'}`);
  } else if (/^SELECT\b/i.test(s) && (m = selectInto(s))) {
    const r = exec(substitute(m.sql, scope, ctx.vars), d);
    const row = r?.values[0];
    if (row) m.targets.forEach((t, i) => assign(t, row[i] ?? null, scope, ctx));
  } else {
    const r = exec(substitute(s, scope, ctx.vars), d);
    entry.changed = /^\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(s) ? d.getRowsModified() : 0;
    if (r) { ctx.results.push(r); entry.result = r; }
  }
  entry.scope = snapScope(scope, ctx);
}
function callProc(d, st) {
  const m = st.match(/^CALL\s+`?(\w+)`?\s*(?:\(([\s\S]*)\))?\s*$/i);
  if (!m) fail(syntax(st));
  const M = meta(d), p = M.procs.get(m[1].toLowerCase());
  if (!p) fail(`ERROR 1305 (42000): PROCEDURE ${M.use}.${m[1]} does not exist`);
  const args = m[2]?.trim() ? splitTop(m[2]) : [];
  if (args.length !== p.params.length)
    fail(`ERROR 1318 (42000): Incorrect number of arguments for PROCEDURE ${M.use}.${p.name}; expected ${p.params.length}, got ${args.length}`);
  const ctx = { vars: M.vars, trace: [], results: [] };
  const scope = new Map();
  p.params.forEach((pr, i) => {
    if (pr.mode === 'IN') scope.set(pr.name.toLowerCase(), evalExpr(d, args[i], null, ctx));
    else {
      const a = args[i].trim();
      if (!a.startsWith('@')) fail(`ERROR 1414 (42000): OUT or INOUT argument ${i + 1} for routine ${M.use}.${p.name} is not a variable or NEW pseudo-variable in BEFORE trigger`);
      scope.set(pr.name.toLowerCase(), pr.mode === 'INOUT' ? M.vars.get(a.slice(1).toLowerCase()) ?? null : null);
    }
  });
  M.lastCall = { name: p.name, ctx, args: snapScope(scope, ctx) };
  try { runList(d, p.tree, scope, ctx); } catch (e) { M.lastCall.error = e.message; throw e; }
  p.params.forEach((pr, i) => { if (pr.mode !== 'IN') M.vars.set(args[i].trim().slice(1).toLowerCase(), scope.get(pr.name.toLowerCase())); });
  return ctx.results[ctx.results.length - 1] || null;
}

// ================= dispatcher =================
// Statements handled here instead of by SQLite. Returns a result (or null) when handled, undefined otherwise.
export function admin(d, b) {
  const M = meta(d);
  let m;
  if ((m = b.match(/^USE\s+`?(\w+)`?$/i))) {
    if (!dbNames(d).includes(m[1])) fail(`ERROR 1049 (42000): Unknown database '${m[1]}'`);
    M.use = m[1]; return null;
  }
  if ((m = b.match(/^CREATE\s+(?:DATABASE|SCHEMA)\s+(IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/i))) {
    if (dbNames(d).includes(m[2]) || SYSTEM_DBS.includes(m[2])) { if (m[1]) return null; fail(`ERROR 1007 (HY000): Can't create database '${m[2]}'; database exists`); }
    if (txOpen(d)) d.exec('COMMIT');
    d.exec(`ATTACH DATABASE ':memory:' AS ${m[2]}`); return null;
  }
  if ((m = b.match(/^DROP\s+(?:DATABASE|SCHEMA)\s+(IF\s+EXISTS\s+)?`?(\w+)`?$/i))) {
    if (m[2] === 'shop') fail("ERROR: the shop database can't be dropped in this sandbox (every lesson needs it)");
    if (!dbNames(d).includes(m[2])) { if (m[1]) return null; fail(`ERROR 1008 (HY000): Can't drop database '${m[2]}'; database doesn't exist`); }
    if (txOpen(d)) d.exec('COMMIT');
    d.exec(`DETACH DATABASE ${m[2]}`);
    if (M.use === m[2]) M.use = 'shop';
    return null;
  }
  if (/^SHOW\s+(?:DATABASES|SCHEMAS)$/i.test(b)) return { columns: ['Database'], values: [...SYSTEM_DBS, ...dbNames(d)].sort().map((n) => [n]) };
  if (/^SELECT\s+DATABASE\(\)$/i.test(b)) return { columns: ['DATABASE()'], values: [[M.use]] };
  if ((m = b.match(/^SHOW\s+(FULL\s+)?TABLES$/i))) return showTables(d, !!m[1]);
  if ((m = b.match(/^CREATE\s+USER\s+(IF\s+NOT\s+EXISTS\s+)?([\s\S]+?)(?:\s+IDENTIFIED\s+(?:WITH\s+\w+\s+)?BY\s+'[^']*')?$/i))) {
    const k = userKey(m[2]);
    if (M.users.has(k)) { if (m[1]) return null; fail(`ERROR 1396 (HY000): Operation CREATE USER failed for ${quoteUser(k)}`); }
    M.users.set(k, new Map()); return null;
  }
  if ((m = b.match(/^DROP\s+USER\s+(IF\s+EXISTS\s+)?([\s\S]+)$/i))) {
    const k = userKey(m[2]);
    if (!M.users.has(k)) { if (m[1]) return null; fail(`ERROR 1396 (HY000): Operation DROP USER failed for ${quoteUser(k)}`); }
    M.users.delete(k); return null;
  }
  if (/^GRANT\s/i.test(b)) return grant(d, b);
  if (/^REVOKE\s/i.test(b)) return revoke(d, b);
  if ((m = b.match(/^SHOW\s+GRANTS(?:\s+FOR\s+([\s\S]+))?$/i))) {
    const k = m[1] ? userKey(m[1]) : M.as;
    return { columns: [`Grants for ${k ? k.replace('@', '@') : 'root@localhost'}`], values: grantLines(d, k) };
  }
  if (/^CREATE\s+(?:DEFINER\s*=\s*\S+\s+)?PROCEDURE\s/i.test(b)) { createProc(d, b); return null; }
  if (/^CREATE\s+(?:DEFINER\s*=\s*\S+\s+)?(?:FUNCTION|TRIGGER|EVENT)\s/i.test(b))
    fail("ERROR: stored functions, triggers and events aren't supported in this sandbox (procedures are)");
  if ((m = b.match(/^DROP\s+PROCEDURE\s+(IF\s+EXISTS\s+)?`?(\w+)`?$/i))) {
    if (!M.procs.delete(m[2].toLowerCase()) && !m[1]) fail(`ERROR 1305 (42000): PROCEDURE ${M.use}.${m[2]} does not exist`);
    return null;
  }
  if (/^CALL\s/i.test(b)) return callProc(d, b);
  if (/^SHOW\s+PROCEDURE\s+STATUS\b/i.test(b))
    return { columns: ['Db', 'Name', 'Type', 'Security_type'], values: [...M.procs.values()].map((p) => ['shop', p.name, 'PROCEDURE', 'DEFINER']) };
  if ((m = b.match(/^SHOW\s+CREATE\s+PROCEDURE\s+`?(\w+)`?$/i))) {
    const p = M.procs.get(m[1].toLowerCase());
    if (!p) fail(`ERROR 1305 (42000): PROCEDURE ${m[1]} does not exist`);
    return { columns: ['Procedure', 'Create Procedure'], values: [[p.name, p.text]] };
  }
  if ((m = b.match(/^SET\s+(@[\s\S]+)$/i))) {
    for (const a of splitTop(m[1])) {
      const x = a.match(/^@(\w+)\s*:?=\s*([\s\S]+)$/);
      if (!x) fail(syntax(a));
      M.vars.set(x[1].toLowerCase(), evalExpr(d, x[2], null, { vars: M.vars }));
    }
    return null;
  }
  if (/^SELECT\b/i.test(b) && /\bINTO\s+@/i.test(b)) {
    const s = selectInto(b);
    const r = exec(substitute(s.sql, null, M.vars), d);
    s.targets.forEach((t, i) => M.vars.set(t.slice(1).toLowerCase(), r?.values[0]?.[i] ?? null));
    return null;
  }
  return undefined;
}
export const needsVars = hasVar;
