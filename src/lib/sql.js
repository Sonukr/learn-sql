// SQLite (sql.js) made to look and behave like MySQL for the lessons.
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { SETUP_SQL } from '../lessons';
import { admin, meta, qualify, checkPrivileges, alterTable, truncate, analyze, showCreate, withVars, needsVars, fail, syntax, schemaOf, dbNames } from './admin';

let SQL;
export const ready = initSqlJs({ locateFile: () => wasmUrl }).then((s) => { SQL = s; });

// Opening a DB (or db.export()) resets pragmas, so FK enforcement is switched on here every time.
const PRAGMAS = 'PRAGMA foreign_keys = ON; PRAGMA automatic_index = OFF;';
// automatic_index off: SQLite would quietly build temporary indexes for joins, which MySQL never does.
export function openDb(bytes) {
  const d = new SQL.Database(bytes);
  d.run(PRAGMAS);
  return d;
}
// `extra` = a lesson's own setup (e.g. the 50,000-row page_views table), run after the shop data.
export function freshDb(extra) { const d = openDb(); d.run(SETUP_SQL); if (extra) d.run(extra); return d; }

// Split a script into statements on ';' (or the current DELIMITER, as the mysql client does),
// ignoring delimiters inside quotes and -- comments.
export function splitStatements(sql) {
  const out = []; let cur = '', q = null, delim = ';';
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (!q && (i === 0 || sql[i - 1] === '\n')) {
      const dm = sql.slice(i).match(/^[ \t]*DELIMITER[ \t]+(\S+)[^\n]*/i);
      if (dm) { out.push(cur); cur = ''; delim = dm[1]; i += dm[0].length - 1; continue; }
    }
    if (!q && ch === '-' && sql[i + 1] === '-') {
      const j = sql.indexOf('\n', i), end = j < 0 ? sql.length : j;
      cur += sql.slice(i, end); i = end - 1; continue;
    }
    if (q) { if (ch === q) q = null; } else if (ch === "'" || ch === '"') q = ch;
    if (!q && sql.startsWith(delim, i)) { out.push(cur); cur = ''; i += delim.length - 1; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s.replace(/--[^\n]*/g, '').trim());
}
const bare = (st) => st.replace(/--[^\n]*/g, '').trim();

// BEGIN only succeeds outside a transaction, so this tests whether one is open.
export function txOpen(d) {
  try { d.exec('BEGIN; ROLLBACK;'); return false; } catch { return true; }
}

// Rewrite SQLite's error text into the MySQL error a learner would actually see.
export function mysqlError(msg, sql) {
  let m;
  if (/^ERROR[ :]/.test(msg)) return msg; // already MySQL-shaped (from admin.js)
  const alter = /^\s*ALTER\b/i.test(sql);
  if ((m = msg.match(/near "([^"]*)": syntax error/))) return syntax(m[1]);
  if (/incomplete input/.test(msg)) return syntax('');
  if ((m = msg.match(/no such table: (?:(\w+)\.)?(\w+)/))) return `ERROR 1146 (42S02): Table '${!m[1] || m[1] === 'main' ? 'shop' : m[1]}.${m[2]}' doesn't exist`;
  if ((m = msg.match(/no such column: ([\w.]+)/))) return `ERROR 1054 (42S22): Unknown column '${m[1]}' in 'field list'`;
  if ((m = msg.match(/(?:table|view) (\w+) already exists/))) return `ERROR 1050 (42S01): Table '${m[1]}' already exists`;
  if ((m = msg.match(/no such view: (?:\w+\.)?(\w+)/))) return `ERROR 1051 (42S02): Unknown table 'shop.${m[1]}'`;
  if ((m = msg.match(/no such savepoint: (\w+)/))) return `ERROR 1305 (42000): SAVEPOINT ${m[1]} does not exist`;
  if (/cannot modify \w+ because it is a view/.test(msg)) return "ERROR: views are read-only in this sandbox (MySQL lets you INSERT/UPDATE/DELETE through simple views)";
  if (/sub-select returns \d+ columns|row value misused/.test(msg)) return 'ERROR 1241 (21000): Operand should contain 1 column(s)';
  if (/SELECTs to the left and right of (UNION|INTERSECT|EXCEPT)/.test(msg)) return 'ERROR 1222 (21000): The used SELECT statements have a different number of columns';
  if (alter && (m = msg.match(/CHECK constraint failed: len_(\w+)/))) return `ERROR 1265 (01000): Data truncated for column '${m[1]}' at row 1`;
  if (alter && /NOT NULL constraint failed/.test(msg)) return 'ERROR 1138 (22004): Invalid use of NULL value';
  if ((m = msg.match(/UNIQUE constraint failed: (\w+)\.(\w+)/)))
    return `ERROR 1062 (23000): Duplicate entry for key '${m[1]}.${m[2] === 'id' || msg.includes(',') ? 'PRIMARY' : m[2]}'`;
  // the named CHECKs below are added by shimColumn() to mimic MySQL's strict type checks
  if ((m = msg.match(/CHECK constraint failed: len_(\w+)/))) return `ERROR 1406 (22001): Data too long for column '${m[1]}' at row 1`;
  if ((m = msg.match(/CHECK constraint failed: type_(\w+)/))) return `ERROR 1366 (HY000): Incorrect value for column '${m[1]}' at row 1`;
  if ((m = msg.match(/CHECK constraint failed: enum_(\w+)/))) return `ERROR 1265 (01000): Data truncated for column '${m[1]}' at row 1`;
  if ((m = msg.match(/CHECK constraint failed: (\w+)$/))) return `ERROR 3819 (HY000): Check constraint '${m[1]}' is violated.`;
  if (/CHECK constraint failed/.test(msg))
    return `ERROR 3819 (HY000): Check constraint '${(sql.match(/(?:INTO|UPDATE)\s+(\w+)/i) || [])[1] || 't'}_chk_1' is violated.`;
  if ((m = msg.match(/index (\w+) already exists/))) return `ERROR 1061 (42000): Duplicate key name '${m[1]}'`;
  if ((m = msg.match(/no such index: (\w+)/))) return `ERROR 1091 (42000): Can't DROP '${m[1]}'; check that column/key exists`;
  if ((m = msg.match(/NOT NULL constraint failed: \w+\.(\w+)/)))
    return `ERROR 1048 (23000): Column '${m[1]}' cannot be null`;
  if (/FOREIGN KEY constraint failed/.test(msg))
    return /^\s*(INSERT|ALTER)/i.test(sql)
      ? 'ERROR 1452 (23000): Cannot add or update a child row: a foreign key constraint fails'
      : 'ERROR 1451 (23000): Cannot delete or update a parent row: a foreign key constraint fails';
  return 'ERROR: ' + msg;
}

// MySQL-only syntax, rewritten for SQLite.
// ponytail: regex shims for the statements lessons use; add more (AUTO_INCREMENT in CREATE TABLE…) when a lesson needs them.
export function splitTop(list) { // split on commas that are not inside parentheses or quotes
  const out = []; let depth = 0, q = false, cur = '';
  for (const ch of list) {
    if (ch === "'") q = !q;
    if (!q && ch === '(') depth++;
    if (!q && ch === ')') depth--;
    if (!q && ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// One column definition, MySQL → SQLite. SQLite ignores declared types, so named CHECKs stand in for
// MySQL strict mode (VARCHAR length, numeric types, ENUM values); mysqlError() maps them back.
export function shimColumn(item) {
  if (/^(KEY|INDEX|FULLTEXT|SPATIAL)\b/i.test(item)) return ''; // indexes become CREATE INDEX (see shimCreate); fulltext isn't supported
  if (/^(?:CONSTRAINT\s+\S+\s+)?UNIQUE\s+(?:KEY|INDEX)\b/i.test(item)) return item.replace(/UNIQUE\s+(?:KEY|INDEX)\s*(?:`?\w+`?\s*)?\(/i, 'UNIQUE (');
  if (/^(PRIMARY|UNIQUE|FOREIGN|CONSTRAINT|CHECK)\b/i.test(item)) return item;
  // column attributes SQLite doesn't know (from real dumps)
  item = item.replace(/\s+(?:CHARACTER\s+SET|CHARSET)\s+\w+/gi, '').replace(/\s+COLLATE\s+\w+/gi, '')
    .replace(/\s+COMMENT\s+'(?:[^']|'')*'/gi, '').replace(/\s+(ZEROFILL|SIGNED)\b/gi, '');
  const m = item.match(/^`?(\w+)`?\s+(\w+)(\s*\([^)]*\))?(\s+UNSIGNED)?([\s\S]*)$/i);
  if (!m) return item;
  let [, col, type, args = '', uns = '', rest] = m;
  const T = type.toUpperCase();
  rest = rest.replace(/\bON\s+UPDATE\s+CURRENT_TIMESTAMP\b/i, '');
  if (/\bAUTO_INCREMENT\b/i.test(rest)) return `${col} INTEGER${rest.replace(/\bAUTO_INCREMENT\b/i, '')}`; // INTEGER PRIMARY KEY auto-numbers
  if (T === 'ENUM') return `${col} ENUM${rest} CONSTRAINT enum_${col} CHECK (${col} IN ${args.trim()})`;
  if (T === 'SET') return `${col} TEXT${rest}`; // SET('a','b'): stored as text here
  let check = '';
  if (/^(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT)$/.test(T)) check = ` CONSTRAINT type_${col} CHECK (typeof(${col}) IN ('integer', 'null'))`;
  if (/^(DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL)$/.test(T)) check = ` CONSTRAINT type_${col} CHECK (typeof(${col}) IN ('integer', 'real', 'null'))`;
  if (/^(VARCHAR|CHAR)$/.test(T) && args) check = ` CONSTRAINT len_${col} CHECK (length(${col}) <= ${args.replace(/[()\s]/g, '')})`;
  // SQLite wants the size last: `decimal unsigned(6,2)`, not MySQL's `decimal(6,2) unsigned`
  return `${col} ${type}${uns}${args}${rest}${check}`;
}
function shimCreate(st) {
  const open = st.indexOf('(');
  if (open < 0) return st;
  let depth = 0, close = -1;
  for (let i = open; i < st.length; i++) {
    if (st[i] === '(') depth++;
    if (st[i] === ')' && --depth === 0) { close = i; break; }
  }
  if (close < 0) return st;
  const table = st.match(/TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)/i)[1];
  const items = splitTop(st.slice(open + 1, close));
  // inline INDEX/KEY definitions become separate CREATE INDEX statements
  const idx = items.map((it) => it.match(/^(?:INDEX|KEY)\s+`?(\w+)`?\s*\(([^)]*)\)/i)).filter(Boolean)
    .map(([, n, c]) => `; CREATE INDEX ${n} ON ${table} (${c})`).join('');
  // whatever follows ")" is MySQL table options (ENGINE=InnoDB, DEFAULT CHARSET=…): dropped
  return `${st.slice(0, open)}(${items.map(shimColumn).filter(Boolean).join(', ')})${idx}`;
}

const describe = (t, sch = 'main') => `SELECT p.name AS Field, CASE p.type WHEN 'INTEGER' THEN 'INT' ELSE p.type END AS Type,
  CASE WHEN p."notnull" = 1 OR p.pk > 0 THEN 'NO' ELSE 'YES' END AS "Null",
  CASE WHEN p.pk > 0 THEN 'PRI'
    WHEN EXISTS (SELECT 1 FROM pragma_index_list('${t}', '${sch}') il JOIN pragma_index_info(il.name, '${sch}') ii
      WHERE il."unique" = 1 AND ii.name = p.name AND (SELECT COUNT(*) FROM pragma_index_info(il.name)) = 1) THEN 'UNI'
    WHEN EXISTS (SELECT 1 FROM pragma_foreign_key_list('${t}') f WHERE f."from" = p.name)
      OR EXISTS (SELECT 1 FROM pragma_index_list('${t}') il JOIN pragma_index_info(il.name) ii WHERE ii.seqno = 0 AND ii.name = p.name) THEN 'MUL' ELSE '' END AS "Key",
  CASE WHEN p.dflt_value LIKE '''%''' THEN substr(p.dflt_value, 2, length(p.dflt_value) - 2) ELSE p.dflt_value END AS "Default",
  CASE WHEN p.pk = 1 AND p.type = 'INTEGER' THEN 'auto_increment' ELSE '' END AS Extra
  FROM pragma_table_info('${t}', '${sch}') p;`;

// x > ALL (subquery) / x = ANY (subquery): SQLite has neither, so rewrite with (NOT) EXISTS.
// ALL treats a NULL in the list as "not satisfied", like MySQL.
function shimQuantified(sql) {
  const re = /([\w.]+|'[^']*'|\d+(?:\.\d+)?)\s*(<>|!=|<=|>=|=|<|>)\s*(ANY|SOME|ALL)\s*\(/i;
  let m, n = 0;
  while ((m = re.exec(sql)) && n++ < 20) {
    const open = m.index + m[0].length - 1;
    let dep = 0, close = open;
    for (; close < sql.length; close++) { if (sql[close] === '(') dep++; if (sql[close] === ')' && --dep === 0) break; }
    const sub = sql.slice(open + 1, close), x = m[1], op = m[2] === '!=' ? '<>' : m[2];
    const rep = m[3].toUpperCase() === 'ALL'
      ? `NOT EXISTS (WITH __q${n}(v) AS (${sub}) SELECT 1 FROM __q${n} WHERE NOT (${x} ${op} v) OR v IS NULL)`
      : `EXISTS (WITH __q${n}(v) AS (${sub}) SELECT 1 FROM __q${n} WHERE ${x} ${op} v)`;
    sql = sql.slice(0, m.index) + rep + sql.slice(close + 1);
  }
  return sql;
}

export function toSqlite(sql) {
  return shimQuantified(sql)
    .replace(/(^|;)(\s*)(CREATE\s+TABLE[^;]*)/gi, (_, p, ws, st) => p + ws + shimCreate(st))
    .replace(/DROP\s+INDEX\s+`?(\w+)`?\s+ON\s+\w+/gi, 'DROP INDEX $1')
    // only at statement start, so "ORDER BY x DESC LIMIT 3" is left alone
    .replace(/(^|;)\s*(?:DESCRIBE|DESC)\s+(?:(\w+)\.)?(\w+)\s*;?/gi, (_, p, sch, t) => p + describe(t, sch || 'main'))
    .replace(/\bDISTINCTROW\b/gi, 'DISTINCT')
    .replace(/\bINSERT\s+IGNORE\s+INTO\b/gi, 'INSERT OR IGNORE INTO')
    .replace(/\bGREATEST\s*\(/gi, 'max(').replace(/\bLEAST\s*\(/gi, 'min(')
    .replace(/\bSTART\s+TRANSACTION\b/gi, 'BEGIN')
    .replace(/ON\s+DUPLICATE\s+KEY\s+UPDATE([^;]*)/gi, (_, set) =>
      `ON CONFLICT DO UPDATE SET${set.replace(/\bVALUES\s*\(\s*(\w+)\s*\)/gi, 'excluded.$1')}`);
}

// Run SQL statement by statement with MySQL semantics; returns the last result set (or null).
export function exec(sql, d) {
  let last = null;
  // an already-split CREATE PROCEDURE (no DELIMITER line) is one statement: its body's own ';' must not split it
  const whole = /^\s*CREATE\s+(?:DEFINER\s*=\s*\S+\s+)?PROCEDURE\b/i.test(sql) && !/^\s*DELIMITER\b/im.test(sql);
  for (const st of whole ? [sql.trim().replace(/;$/, '')] : splitStatements(sql)) {
    const r = execOne(d, bare(st));
    if (r) last = r;
  }
  return last;
}
function execOne(d, b0) {
  const open = txOpen(d);
  // MySQL: START TRANSACTION implicitly commits an open one; COMMIT/ROLLBACK/SAVEPOINT with nothing open is a no-op.
  if (/^(START\s+TRANSACTION|BEGIN)$/i.test(b0) && open) d.exec('COMMIT');
  if ((/^(COMMIT|ROLLBACK)\b/i.test(b0) && !/^ROLLBACK\s+TO\b/i.test(b0) || /^SAVEPOINT\b/i.test(b0)) && !open) return null;
  checkPrivileges(d, b0);
  const handled = admin(d, b0); // databases, users, procedures, @variables, SHOW TABLES
  if (handled !== undefined) return handled;
  let b = qualify(needsVars(b0) ? withVars(b0, meta(d).vars) : b0, d).replace(/\bDATABASE\(\)/gi, `'${meta(d).use}'`);
  let m;
  if (/^EXPLAIN\s/i.test(b)) return explain(d, b.replace(/^EXPLAIN\s+(?:FORMAT\s*=\s*\w+\s+)?/i, '')).result;
  if ((m = b.match(/^SHOW\s+(?:INDEX|INDEXES|KEYS)\s+(?:FROM|IN)\s+`?([\w.]+)`?/i))) return showIndex(d, m[1].split('.').pop());
  if ((m = b.match(/^SHOW\s+CREATE\s+TABLE\s+`?([\w.]+)`?$/i))) return showCreate(d, m[1]);
  if (/^ALTER\s+TABLE\s/i.test(b)) { alterTable(d, b); return null; }
  if ((m = b.match(/^TRUNCATE\s+(?:TABLE\s+)?`?([\w.]+)`?$/i))) { truncate(d, m[1]); return null; }
  if ((m = b.match(/^ANALYZE\s+(?:NO_WRITE_TO_BINLOG\s+|LOCAL\s+)?TABLES?\s+([\s\S]+)$/i))) return analyze(d, m[1]);
  if ((m = b.match(/^(?:CREATE\s+OR\s+REPLACE|ALTER)\s+VIEW\s+`?([\w.]+)`?/i))) {
    d.exec(`DROP VIEW IF EXISTS ${m[1]}`);
    b = b.replace(/^(?:CREATE\s+OR\s+REPLACE|ALTER)\s+VIEW/i, 'CREATE VIEW');
  }
  if ((m = b.match(/\bFULL\s+(?:OUTER\s+)?JOIN\b[\s\S]{0,25}/i))) fail(syntax(m[0])); // MySQL has no FULL JOIN
  const res = d.exec(toSqlite(b));
  return res[res.length - 1] || null;
}

// ---- indexes as MySQL reports them ----
export function indexesOf(d, t) {
  const pk = d.exec(`SELECT name FROM pragma_table_info('${t}') WHERE pk > 0 ORDER BY pk`)[0]?.values.map((v) => v[0]) || [];
  const list = [];
  if (pk.length) list.push({ name: 'PRIMARY', unique: true, cols: pk });
  for (const [name, uniq, origin] of d.exec(`SELECT name, "unique", origin FROM pragma_index_list('${t}')`)[0]?.values || []) {
    if (origin === 'pk') continue;
    const cols = d.exec(`SELECT name FROM pragma_index_info('${name}') ORDER BY seqno`)[0].values.map((v) => v[0]);
    list.push({ name: origin === 'u' ? cols[0] : name, unique: !!uniq, cols, sqliteName: name });
  }
  return list;
}
function showIndex(d, t) {
  const values = [];
  for (const ix of indexesOf(d, t))
    ix.cols.forEach((c, i) => values.push([t, ix.unique ? 0 : 1, ix.name, i + 1, c,
      d.exec(`SELECT COUNT(DISTINCT ${c}) FROM ${t}`)[0].values[0][0], 'BTREE']));
  return { columns: ['Table', 'Non_unique', 'Key_name', 'Seq_in_index', 'Column_name', 'Cardinality', 'Index_type'], values };
}

// ---- EXPLAIN in MySQL's format, translated from SQLite's EXPLAIN QUERY PLAN ----
// ponytail: approximates MySQL's optimizer from SQLite's plan (same access paths, rows estimated from real
// counts/cardinality). Good for teaching the columns; not a byte-for-byte MySQL EXPLAIN.
const count = (d, sql) => d.exec(sql)[0]?.values[0][0] ?? 0;
// Blank out every (...) group (keeping string positions) so top-level keywords can be found safely.
export function mask(s) { let r = s, prev; do { prev = r; r = r.replace(/\([^()]*\)/g, (m) => '#'.repeat(m.length)); } while (r !== prev); return r; }
function clause(sql, kw, enders) {
  const m = mask(sql), i = m.search(new RegExp(` ${kw} `, 'i'));
  if (i < 0) return null;
  const rest = m.slice(i + kw.length + 2), e = rest.search(new RegExp(` (${enders})( |$)`, 'i'));
  return sql.slice(i + kw.length + 2, e < 0 ? sql.length : i + kw.length + 2 + e).trim();
}
export const whereOf = (sql) => clause(sql, 'WHERE', 'GROUP BY|HAVING|ORDER BY|LIMIT');
export function splitAnd(where) { // top-level AND, keeping "BETWEEN a AND b" together
  if (!where) return [];
  const m = mask(where), parts = [];
  let last = 0;
  for (const x of m.matchAll(/\s+AND\s+/gi)) { parts.push(where.slice(last, x.index)); last = x.index + x[0].length; }
  parts.push(where.slice(last));
  return parts.reduce((acc, p) => {
    if (acc.length && /\bBETWEEN\s+\S+$/i.test(acc[acc.length - 1])) acc[acc.length - 1] += ' AND ' + p; else acc.push(p.trim());
    return acc;
  }, []);
}
function subqueries(flat) { // bodies of every "(SELECT …)", in text order
  const out = [];
  for (let i = 0; i < flat.length; i++) {
    if (flat[i] !== '(' || !/^\(\s*SELECT\b/i.test(flat.slice(i, i + 12))) continue;
    let dep = 0, j = i;
    for (; j < flat.length; j++) { if (flat[j] === '(') dep++; if (flat[j] === ')' && --dep === 0) break; }
    out.push(flat.slice(i + 1, j).trim());
  }
  return out;
}
const NOT_ALIAS = /^(WHERE|ON|JOIN|LEFT|RIGHT|INNER|CROSS|GROUP|ORDER|LIMIT|HAVING|USING|UNION)$/i;
function aliasMap(flat) {
  const map = {};
  for (const m of flat.matchAll(/\b(?:FROM|JOIN)\s+`?(\w+)`?(?:\s+(?:AS\s+)?(\w+))?/gi)) {
    map[m[1]] = m[1];
    if (m[2] && !NOT_ALIAS.test(m[2])) map[m[2]] = m[1];
  }
  return map;
}

export function explain(d, q) {
  const flat = q.replace(/\s+/g, ' ').trim().replace(/;$/, '');
  const subs = subqueries(flat), alias = aliasMap(flat);
  const plan = d.exec('EXPLAIN QUERY PLAN ' + toSqlite(q))[0]?.values || [];
  const root = { id: 1, type: 'SIMPLE', rows: [], sql: flat };
  const blocks = [root], nodeBlock = new Map([[0, root]]);
  let pendingExtra = [];
  const newBlock = (nid, type, extra = {}) => {
    const b = { id: blocks.length + 1, type, rows: [], sql: subs[blocks.length - 1] || '', ...extra };
    blocks.push(b); nodeBlock.set(nid, b); root.type = 'PRIMARY';
  };
  for (const [nid, pid, , detail] of plan) {
    const blk = nodeBlock.get(pid) || root;
    nodeBlock.set(nid, blk);
    let m;
    if ((m = detail.match(/^(CORRELATED )?(?:SCALAR|LIST) SUBQUERY/))) { newBlock(nid, m[1] ? 'DEPENDENT SUBQUERY' : 'SUBQUERY'); continue; }
    if ((m = detail.match(/^(?:MATERIALIZE|CO-ROUTINE) (\S+)/))) { newBlock(nid, 'DERIVED', { alias: m[1] }); continue; }
    if ((m = detail.match(/^USE TEMP B-TREE FOR (.*)/))) {
      const x = /ORDER BY/.test(m[1]) ? 'Using filesort' : 'Using temporary';
      if (blk.rows[0]) blk.rows[0].extra.push(x); else pendingExtra.push([blk, x]);
      continue;
    }
    m = detail.match(/^(SCAN|SEARCH) (\S+)(?: AS (\S+))?(?: USING (COVERING INDEX|INDEX|INTEGER PRIMARY KEY|PRIMARY KEY)(?: ([^\s(]\S*))?)?(?: \((.*)\))?/);
    if (!m) continue;
    const [, op, name, as, how, idxName, cond = ''] = m;
    const derivedBlk = blocks.find((b) => b.alias === name);
    const real = derivedBlk ? null : alias[name] || name;
    const shown = derivedBlk ? `<derived${derivedBlk.id}>` : as || name;
    const ali = as || name;
    const bw = whereOf(blk.sql);
    const n = real ? count(d, `SELECT COUNT(*) FROM ${real}`) : count(d, `SELECT COUNT(*) FROM (${derivedBlk.sql})`);
    const ixs = real ? indexesOf(d, real) : [];
    const isPk = /PRIMARY/.test(how || '');
    const ix = isPk ? ixs.find((x) => x.name === 'PRIMARY') : idxName ? ixs.find((x) => x.sqliteName === idxName || x.name === idxName) : null;
    const keyCols = ix?.cols || [];
    const row = { table: shown, real, alias: ali, key: ix?.name || null, keyCols, cond, extra: [], n };
    const firstInBlock = blk.rows.length === 0;
    const onKey = splitAnd(bw).filter((c) => keyCols.some((k) => new RegExp(`(^|[^\\w])(${ali}\\.)?${k}\\b`, 'i').test(c)));
    const noStr = (c) => c.replace(/'[^']*'/g, "''"); // so a value like 'IN' isn't read as the IN operator
    const literal = onKey.filter((c) => !/\b\w+\.\w+\s*$/.test(noStr(c).split(/=|<|>|\bIN\b|\bBETWEEN\b/i).pop()));
    const filtered = () => Math.max(1, count(d, `SELECT COUNT(*) FROM ${real} ${ali} WHERE ${literal.join(' AND ')}`));
    if (op === 'SCAN') {
      row.type = how ? 'index' : 'ALL';
      row.rows = n;
      if (!how && !firstInBlock) row.extra.push('Using where', 'Using join buffer (hash join)');
      else if (!how && bw) row.extra.push('Using where');
    } else if (/[<>]/.test(cond) || literal.some((c) => /\b(IN|BETWEEN)\b|[<>]/i.test(noStr(c)))) {
      row.type = 'range';
      row.rows = literal.length ? filtered() : Math.round(n / 3);
      if (how !== 'COVERING INDEX' && !isPk) row.extra.push('Using index condition');
      if (isPk && bw) row.extra.push('Using where');
    } else {
      const fullUnique = ix?.unique && keyCols.every((k) => new RegExp(`\\b(${k}|rowid)=`).test(cond));
      if (fullUnique) { row.type = firstInBlock && blk === root && literal.length ? 'const' : 'eq_ref'; row.rows = 1; }
      else {
        row.type = 'ref';
        // literal conditions: count exactly; join lookups: rows ÷ distinct values (MySQL's cardinality estimate)
        row.rows = literal.length ? filtered()
          : Math.max(1, Math.round(n / Math.max(1, count(d, `SELECT COUNT(DISTINCT ${keyCols[0]}) FROM ${real}`))));
      }
    }
    if (how === 'COVERING INDEX') row.extra.push('Using index');
    for (const [b, x] of pendingExtra) if (b === blk) row.extra.push(x);
    pendingExtra = pendingExtra.filter(([b]) => b !== blk);
    blk.rows.push(row);
  }
  const rows = blocks.flatMap((b) => b.rows.map((r) => ({ ...r, id: b.id, select_type: b.type, sql: b.sql })));
  const result = {
    columns: ['id', 'select_type', 'table', 'type', 'possible_keys', 'key', 'rows', 'Extra'],
    values: rows.map((r) => [r.id, r.select_type, r.table, r.type, r.key, r.key, r.rows, r.extra.join('; ') || null]),
  };
  return { rows, result };
}

// Average wall-clock time of a read query, in ms.
export function timeQuery(d, q, runs = 5) {
  const s = toSqlite(q);
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) d.exec(s);
  return (performance.now() - t0) / runs;
}

export const READ_ONLY = /^\s*(SELECT|SHOW|DESC|EXPLAIN)/i;
export const fmt = (v) => (typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(2) : v);
export const cellText = (v) => (v === null ? 'NULL' : String(fmt(v)));
// Compare as an unordered multiset of rows, ignoring column names, so valid alternatives pass.
const canon = (r) => JSON.stringify((r?.values || []).map((row) => JSON.stringify(row.map(fmt))).sort());

export function read(d, table, limit) {
  const r = d.exec(`SELECT rowid AS __rid, * FROM ${table} ORDER BY rowid${limit ? ' LIMIT ' + limit : ''}`)[0];
  const cols = d.exec(`SELECT name FROM pragma_table_info('${table}')`)[0].values.map((v) => v[0]);
  return { cols, rows: (r?.values || []).map((v) => ({ rid: v[0], vals: v.slice(1) })) };
}

export function tableCounts(d) {
  const sch = schemaOf(d);
  const rows = d.exec(`SELECT name, type FROM ${sch}.sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name`)[0]?.values || [];
  return rows.map(([n, t]) => [n, t === 'view' ? 'view' : d.exec(`SELECT COUNT(*) FROM ${sch}."${n}"`)[0].values[0][0]]);
}

// A copy for grading. export() keeps only the main database and resets pragmas; server-side state (users,
// procedures, variables) lives in __meta and is copied across.
function cloneDb(d, bytes, metaCopy) {
  const c = openDb(bytes ?? d.export());
  d.run(PRAGMAS);
  c.__meta = structuredClone(metaCopy ?? meta(d));
  if (!dbNames(c).includes(c.__meta.use)) c.__meta.use = 'shop';
  if (!dbNames(d).includes(meta(d).use)) meta(d).use = 'shop';
  return c;
}

// Run a learner's SQL for a step. Returns { result | error, changed, verdict: {ok, msg} | null }.
export function attempt(d, step, sql) {
  const out = { result: null, error: null, changed: 0, verdict: null };
  // Write challenges: snapshot, run the model answer on a copy, compare the resulting data.
  // (Never export while a transaction is open: export reopens the DB, which would roll it back.)
  const snap = step.verify && !txOpen(d) ? d.export() : null;
  const metaSnap = snap && structuredClone(meta(d));
  if (snap) { d.run(PRAGMAS); if (!dbNames(d).includes(meta(d).use)) meta(d).use = 'shop'; } // export() reset them
  try {
    const t0 = performance.now();
    out.result = exec(sql, d);
    out.ms = performance.now() - t0;
    out.changed = d.getRowsModified();
    if (step.verify) {
      if (!snap) out.verdict = { ok: false, msg: '✗ Finish the open transaction first (COMMIT or ROLLBACK), then run again' };
      else if (txOpen(d)) out.verdict = { ok: false, msg: '✗ Close to it! Your transaction is still open. Remember to COMMIT' };
      else {
        // `verify` may insert probe rows, so it runs on throwaway copies of both databases
        const ref = cloneDb(d, snap, metaSnap), mine = cloneDb(d);
        try {
          exec(step.expect, ref);
          const ok = canon(exec(step.verify, mine)) === canon(exec(step.verify, ref));
          out.verdict = { ok, msg: ok ? '✓ Correct!' : '✗ Not quite. The data doesn’t match what was asked' };
        } catch (e) {
          out.verdict = { ok: false, msg: `✗ Not quite. Your table doesn’t behave as asked (${e.message})` };
        } finally { ref.close(); mine.close(); }
      }
    } else if (step.expect) {
      const ok = canon(out.result) === canon(exec(step.expect, d));
      out.verdict = { ok, msg: ok ? '✓ Correct!' : '✗ Not quite. Compare your rows with what was asked' };
    }
  } catch (e) {
    out.error = mysqlError(e.message, sql);
  }
  return out;
}
