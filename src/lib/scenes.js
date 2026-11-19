// Animated "what the database does" scenes. Imperative on purpose: React renders the stage once,
// this module moves rows around inside it. `ui` holds the stage elements (set by play()).
import { exec, freshDb, read, txOpen, mysqlError, cellText, fmt, splitTop, READ_ONLY, explain, timeQuery, splitStatements, whereOf, splitAnd, mask } from './sql';
import { meta, dbNames, has, grantLines, showCreate } from './admin';
import { openDataset } from './importer';

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const PALETTE = ['#e0a03a', '#3fa7a0', '#9a7cd6', '#e0725f', '#5c8fd9', '#7bb05a'];
let ui = null;
const RH = 30; // row height in px, must match .trow in CSS
let animId = 0, paused = false;
class Cancel extends Error {}

// Pausable, cancellable sleep. Every await in a scene goes through here.
async function wait(ms) {
  const id = animId;
  while (ms > 0) {
    await new Promise((r) => setTimeout(r, 30));
    if (id !== animId) throw new Cancel();
    if (!paused) ms -= 30;
  }
}
const pace = (i) => (i < 3 ? 1 : 0.35); // first few items slowly, the rest briskly

export function setPaused(p) {
  if (!ui) return;
  paused = p;
  ui.onPause?.(p);
  ui.scene.getAnimations({ subtree: true }).forEach((a) => (p ? a.pause() : a.play()));
}

// ---- stage chrome ----
function metrics(defs) {
  ui.metrics.innerHTML = defs.map(([k, label]) => `<div class="metric"><small>${label}</small><b id="m-${k}">–</b></div>`).join('');
}
function setM(k, v) {
  const e = ui.metrics.querySelector('#m-' + k);
  if (!e) return;
  e.textContent = v;
  e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump');
}
function legend(items) {
  ui.legend.innerHTML = items.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('');
}
function caption(title, text = '') {
  ui.caption.innerHTML = title ? `<b>${esc(title)}</b>${text ? ' ' + text : ''}` : '';
}
function bubble(msg) {
  const b = ui.bubble;
  b.hidden = !msg;
  b.textContent = msg || '';
}

function renderQuery(sql) {
  let st = 0;
  ui.qcode.innerHTML = sql.trim().split('\n').map((l) => {
    const h = `<span class="ql" data-st="${st}">${esc(l) || ' '}</span>`;
    st += (l.match(/;/g) || []).length;
    return h;
  }).join('');
}
function hl(test) {
  const lines = [...ui.qcode.querySelectorAll('.ql')];
  lines.forEach((el) => el.classList.toggle('on', test(el)));
  if (lines.length === 1 && test !== none) lines[0].classList.add('on');
}
const none = () => false;
// Highlight the clause starting with one of `kws`, plus its AND/OR/ON continuation lines.
function hlKw(...kws) {
  let on = false;
  hl((el) => {
    const t = el.textContent.trim().toUpperCase();
    if (kws.some((k) => t.startsWith(k))) on = true;
    else if (!/^(AND|OR|ON|\w+\s*[,)]|[\w.]+\s*AS\b)/.test(t) || /^(FROM|WHERE|GROUP|HAVING|ORDER|LIMIT|SELECT|JOIN|LEFT)/.test(t)) on = false;
    return on;
  });
}
const hlStmt = (i) => hl((el) => +el.dataset.st === i);

// ---- tables as animated blocks ----
// Which columns are keys: { col: { kind: 'pk' | 'fk', title } } from the table's real definition (works for imported data too).
function keysOf(d, table) {
  const out = {};
  try {
    for (const [col] of d.exec(`SELECT name FROM pragma_table_info('${table}') WHERE pk > 0`)[0]?.values || [])
      out[col.toLowerCase()] = { kind: 'pk', title: 'Primary key' };
    for (const [col, ref, to] of d.exec(`SELECT "from", "table", "to" FROM pragma_foreign_key_list('${table}')`)[0]?.values || [])
      if (!out[col.toLowerCase()]) out[col.toLowerCase()] = { kind: 'fk', title: `Foreign key → ${ref}.${to || 'id'}` };
  } catch { /* not a table (view, result) */ }
  return out;
}
function mkTable(name, cols, rows, opt = {}) {
  const key = (c) => opt.keys?.[String(c).toLowerCase()];
  const w = cols.map((c, i) => Math.min(26, Math.max(String(c).length + (key(c) ? 4 : 0), ...rows.map((r) => cellText(r.vals[i]).length), 2)));
  const tpl = w.map((x) => `calc(${x}ch + 18px)`).join(' '); // 18px = cell padding
  const cc = (i) => (opt.colColors?.[i] ? ` class="cc" style="--cc:${opt.colColors[i]}"` : '');
  const el = document.createElement('div');
  el.className = 'tbl';
  if (opt.color) el.style.setProperty('--tc', opt.color);
  el.innerHTML = `<div class="tname">${esc(name)}</div>
    <div class="thead" style="grid-template-columns:${tpl}">${cols.map((c, i) => `<span${cc(i)}>${esc(c)}${key(c) ? `<sup class="kbadge ${key(c).kind}" title="${esc(key(c).title)}">${key(c).kind.toUpperCase()}</sup>` : ''}</span>`).join('')}</div>
    <div class="tbody"></div>`;
  const t = { el, name, body: el.querySelector('.tbody'), tpl, cols, rows: new Map(), order: [], colColors: opt.colColors };
  rows.forEach((r) => addRow(t, r));
  return t;
}
function addRow(t, r) {
  const e = document.createElement('div');
  e.className = 'trow gone';
  e.style.gridTemplateColumns = t.tpl;
  e.innerHTML = r.vals.map((v, i) => {
    const c = t.colColors?.[i];
    return `<span class="${v === null ? 'null' : typeof v === 'number' ? 'num' : ''}${c ? ' cc' : ''}"${c ? ` style="--cc:${c}"` : ''}>${esc(cellText(v))}</span>`;
  }).join('');
  e.style.transform = `translateY(${t.order.length * RH}px)`;
  t.body.append(e);
  t.rows.set(r.rid, { el: e, vals: r.vals });
  return e;
}
// Show `rids` in this order (others fade out); `gaps` = indices where a group gap goes.
function place(t, rids, gaps) {
  let y = 0;
  const vis = new Set(rids);
  rids.forEach((rid, i) => {
    if (gaps?.has(i)) y += 10;
    const r = t.rows.get(rid);
    r.el.style.transform = `translateY(${y}px)`;
    r.el.classList.remove('gone');
    y += RH;
  });
  t.rows.forEach((r, rid) => { if (!vis.has(rid)) r.el.classList.add('gone'); });
  t.body.style.height = Math.max(y, RH) + 'px';
  t.order = rids;
}
async function enter(...tables) {
  let n = 0;
  for (const t of tables) {
    const rids = [...t.rows.keys()];
    rids.forEach((rid, i) => (t.rows.get(rid).el.style.transitionDelay = i * 35 + 'ms'));
    place(t, rids);
    n = Math.max(n, rids.length);
  }
  await wait(n * 35 + 450);
  tables.forEach((t) => t.rows.forEach((r) => (r.el.style.transitionDelay = '')));
}

// ---- layout + geometry ----
// Sources on top, results underneath, links drawn in an SVG layer over both.
// Sources on the left, results to the right (→). Pass { vertical: true } last to stack them instead (JOINs).
function board(top, ...rest) {
  const vertical = rest.at(-1)?.vertical === true;
  const below = vertical ? rest.slice(0, -1) : rest;
  const inner = ui.inner;
  inner.innerHTML = `<svg class="links" id="links"></svg><div class="board${vertical ? ' vertical' : ' side'}"><div class="row-top"></div></div>`;
  inner.querySelector('.row-top').append(...top);
  const b = inner.querySelector('.board');
  below.filter(Boolean).forEach((n) => {
    const a = document.createElement('div');
    a.className = 'down';
    a.textContent = vertical ? '↓' : '→';
    if (vertical) return b.append(a, n);
    const pair = document.createElement('div'); // arrow + result wrap together, so the arrow never points at nothing
    pair.className = 'pair';
    pair.append(a, n);
    b.append(pair);
  });
}
function rel(el) {
  const a = el.getBoundingClientRect(), b = ui.inner.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
}
function link(fromEl, toEl, color, vertical = false) {
  const svg = ui.inner.querySelector('.links'), inner = ui.inner;
  svg.setAttribute('width', inner.scrollWidth);
  svg.setAttribute('height', inner.scrollHeight);
  const a = rel(fromEl), b = rel(toEl);
  let x1, y1, x2, y2, d;
  if (vertical) {
    x1 = a.x + a.w / 2; y1 = a.y + a.h; x2 = b.x + b.w / 2; y2 = b.y;
    const k = (y2 - y1) / 2;
    d = `M${x1},${y1} C${x1},${y1 + k} ${x2},${y2 - k} ${x2},${y2}`;
  } else {
    const ltr = a.x < b.x;
    x1 = ltr ? a.x + a.w : a.x; y1 = a.y + a.h / 2; x2 = ltr ? b.x : b.x + b.w; y2 = b.y + b.h / 2;
    const k = (x2 - x1) / 2;
    d = `M${x1},${y1} C${x1 + k},${y1} ${x2 - k},${y2} ${x2},${y2}`;
  }
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  p.style.stroke = color;
  svg.append(p);
  const len = p.getTotalLength();
  p.style.strokeDasharray = len;
  p.style.strokeDashoffset = len;
  p.getBoundingClientRect();
  p.style.strokeDashoffset = 0;
  [['circle', x1, y1], ['circle', x2, y2]].forEach(([tag, cx, cy]) => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', tag);
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', 4); c.style.fill = color;
    svg.append(c);
    p._dots = [...(p._dots || []), c];
  });
  return p;
}
function unlink(p, keepFaint) {
  if (!p) return;
  if (keepFaint) { p.classList.add('faint'); p._dots.forEach((c) => c.classList.add('faint')); }
  else { p.remove(); p._dots.forEach((c) => c.remove()); }
}
function clearLinks() { const s = ui.inner.querySelector('.links'); if (s) s.innerHTML = ''; }
// A copy of a source row glides into its slot in the result table.
function fly(fromEl, toEl, color) {
  const inner = ui.inner, a = rel(fromEl), b = rel(toEl);
  const g = fromEl.cloneNode(true);
  g.className = 'trow ghost';
  g.style.cssText = `left:${a.x}px;top:${a.y}px;width:${a.w}px;grid-template-columns:${fromEl.style.gridTemplateColumns};--pc:${color}`;
  inner.append(g);
  g.getBoundingClientRect();
  Object.assign(g.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', opacity: '0.15' });
  setTimeout(() => g.remove(), 650);
}

// ---- query parsing (only the lesson's own, well-formed queries are parsed) ----
function parseSelect(sql) {
  const s = sql.replace(/;\s*$/, '').replace(/\s+/g, ' ').trim();
  const g = (re) => (s.match(re) || [])[1]?.trim();
  const p = {
    distinct: /^SELECT DISTINCT /i.test(s),
    cols: g(/^SELECT (?:DISTINCT )?(.+?) FROM /i),
    from: g(/ FROM (.+?)(?= WHERE | GROUP BY | HAVING | ORDER BY | LIMIT |$)/i),
    where: g(/ WHERE (.+?)(?= GROUP BY | HAVING | ORDER BY | LIMIT |$)/i),
    group: g(/ GROUP BY (.+?)(?= HAVING | ORDER BY | LIMIT |$)/i),
    having: g(/ HAVING (.+?)(?= ORDER BY | LIMIT |$)/i),
    order: g(/ ORDER BY (.+?)(?= LIMIT |$)/i),
    limit: g(/ LIMIT (.+)$/i),
  };
  p.table = p.from?.split(' ')[0];
  p.items = splitTop(p.cols || '');
  p.agg = /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(p.cols || '');
  return p;
}
const tail = (p) => ['where', 'group', 'having', 'order', 'limit']
  .filter((k) => p[k]).map((k) => ` ${{ where: 'WHERE', group: 'GROUP BY', having: 'HAVING', order: 'ORDER BY', limit: 'LIMIT' }[k]} ${p[k]}`).join('');

// ---- scene: single-table SELECT (scan → filter → sort/limit → project) ----
async function selectScene(s, d) {
  const p = parseSelect(s.sql);
  metrics([['scan', 'Rows scanned'], ['match', 'Matched'], ['ret', 'Returned'], ['cols', 'Columns']]);
  legend([['var(--good)', 'matches WHERE'], ['var(--bad)', 'filtered out'], ['var(--muted)', 'cut by LIMIT'], ['var(--accent)', 'in result']]);
  const src = read(d, p.table);
  const t = mkTable(p.table, src.cols, src.rows, { color: PALETTE[0], keys: keysOf(d, p.table) });
  // Final rows tagged with the source rowid they came from (not possible after DISTINCT collapses rows).
  const al = p.from.split(' ')[1] && !/^(WHERE|AS)$/i.test(p.from.split(' ')[1]) ? p.from.split(' ').pop() : p.table; // FROM customers c → c
  const tagged = p.distinct ? null : exec(s.sql.replace(/^\s*SELECT\s+/i, `SELECT ${al}.rowid AS __r, `), d);
  const final = exec(s.sql, d) || { columns: [], values: [] };
  const res = mkTable('result', final.columns, final.values.map((v, i) => ({ rid: i, vals: v })), { color: 'var(--accent)' });
  board([t.el], res.el);
  res.rows.forEach((r) => r.el.classList.add('gone'));

  caption('FROM ' + p.table, 'MySQL reads the table, row by row.'); hlKw('FROM');
  await enter(t);
  const all = [...t.rows.keys()];
  const matched = new Set(p.where ? exec(`SELECT ${al}.rowid FROM ${p.from} WHERE ${p.where}`, d)?.values.map((v) => v[0]) || [] : all);

  // a subquery in WHERE: show what it returns before the rows are tested
  const sub = p.where && (p.where.match(/\((SELECT .*)\)/i) || [])[1];
  if (sub) {
    hlKw('WHERE');
    let shown;
    try { const r = exec(sub, d); shown = (r?.values || []).map((v) => cellText(v[0])); } catch { shown = null; }
    if (shown) caption('Subquery first', `(${sub.length > 40 ? sub.slice(0, 40) + '…' : sub}) → ${shown.length === 1 ? shown[0] : '(' + shown.join(', ') + ')'}`);
    else caption('Correlated subquery', 'It mentions the outer row, so it runs again for every row being tested.');
    await wait(2200);
  }

  if (p.where) {
    caption('WHERE ' + p.where, 'is tested against every row.'); hlKw('WHERE');
    let m = 0;
    for (const [i, rid] of all.entries()) {
      const el = t.rows.get(rid).el;
      el.classList.add('cursor');
      await wait(380 * pace(i));
      el.classList.remove('cursor');
      el.classList.add(matched.has(rid) ? 'match' : 'miss');
      setM('scan', i + 1);
      if (matched.has(rid)) setM('match', ++m);
    }
    await wait(500);
  } else {
    setM('scan', all.length); setM('match', all.length);
    all.forEach((rid) => t.rows.get(rid).el.classList.add('match'));
    await wait(400);
  }

  if (p.order) { caption('ORDER BY ' + p.order, 'decides the order rows arrive in the result.'); hlKw('ORDER BY'); await wait(1300); }
  if (p.limit && tagged) {
    const keep = new Set(tagged.values.map((v) => v[0]));
    caption('LIMIT ' + p.limit, 'keeps only part of the sorted rows.'); hlKw('LIMIT');
    matched.forEach((rid) => { if (!keep.has(rid)) t.rows.get(rid).el.classList.replace('match', 'cut'); });
    await wait(1300);
  }

  // projection: highlight the source columns the SELECT list uses
  const used = src.cols.map((c) => new RegExp(`(^|[^\\w.])${c}\\b`, 'i').test(p.cols) || p.cols.trim() === '*');
  t.el.querySelectorAll('.thead span').forEach((sp, i) => sp.classList.toggle('used', used[i]));
  t.rows.forEach((r) => [...r.el.children].forEach((sp, i) => sp.classList.toggle('dimcol', !used[i])));
  caption('SELECT ' + p.cols, p.distinct ? '— and DISTINCT merges identical rows.' : 'shapes each output row.'); hlKw('SELECT');
  setM('cols', final.columns.length);
  for (let i = 0; i < final.values.length; i++) {
    const target = res.rows.get(i).el;
    const fromRid = tagged?.values[i][0];
    if (fromRid != null) { const from = t.rows.get(fromRid).el; from.classList.add('pick'); fly(from, target, PALETTE[0]); }
    await wait(520 * pace(i));
    place(res, [...res.order, i]);
    setM('ret', i + 1);
    if (fromRid != null) t.rows.get(fromRid).el.classList.remove('pick');
  }
  if (!final.values.length) setM('ret', 0);
  caption('✓ ' + final.values.length + ' row' + (final.values.length === 1 ? '' : 's') + ' in set'); hl(none);
}

// ---- scene: aggregates / GROUP BY on one table ----
async function groupScene(s, d) {
  const p = parseSelect(s.sql);
  metrics([['scan', 'Rows scanned'], ['match', 'Rows used'], ['groups', 'Groups'], ['ret', 'Returned']]);
  const src = read(d, p.table);
  const t = mkTable(p.table, src.cols, src.rows, { color: PALETTE[0], keys: keysOf(d, p.table) });
  const W = p.where ? ` WHERE ${p.where}` : '';
  const key = p.group || "'all rows'";
  const keyOf = new Map(exec(`SELECT rowid, ${key} FROM ${p.table}${W}`, d)?.values || []);
  const keys = [...new Set([...keyOf.values()])];
  const color = (k) => PALETTE[keys.indexOf(k) % PALETTE.length];
  const tagged = exec(s.sql.replace(/^\s*SELECT\s+/i, `SELECT ${key} AS __k, `), d) || { values: [] };
  const final = exec(s.sql, d) || { columns: [], values: [] };
  const res = mkTable('result', final.columns, final.values.map((v, i) => ({ rid: i, vals: v })), { color: 'var(--accent)' });
  board([t.el], res.el);
  legend(keys.slice(0, 6).map((k) => [color(k), p.group ? `group: ${cellText(k)}` : 'one group (no GROUP BY)']));

  caption('FROM ' + p.table); hlKw('FROM');
  await enter(t);
  const all = [...t.rows.keys()];
  if (p.where) {
    caption('WHERE ' + p.where, 'runs first: only matching rows get aggregated.'); hlKw('WHERE');
    for (const [i, rid] of all.entries()) {
      const el = t.rows.get(rid).el;
      el.classList.add('cursor'); await wait(320 * pace(i)); el.classList.remove('cursor');
      el.classList.add(keyOf.has(rid) ? 'match' : 'miss');
      setM('scan', i + 1);
    }
    await wait(400);
  } else setM('scan', all.length);
  setM('match', keyOf.size);

  caption(p.group ? 'GROUP BY ' + p.group : 'No GROUP BY', p.group ? 'puts rows with the same value into one bucket.' : 'so every row lands in one big group.');
  hlKw('GROUP BY', 'FROM');
  all.forEach((rid) => { if (keyOf.has(rid)) { const el = t.rows.get(rid).el; el.classList.remove('match'); el.classList.add('grouped'); el.style.setProperty('--g', color(keyOf.get(rid))); } });
  setM('groups', keys.length);
  await wait(900);
  const sorted = [...all].sort((a, b) => (keyOf.has(a) ? keys.indexOf(keyOf.get(a)) : 99) - (keyOf.has(b) ? keys.indexOf(keyOf.get(b)) : 99) || a - b);
  const gaps = new Set(sorted.map((rid, i) => (i && keyOf.get(rid) !== keyOf.get(sorted[i - 1]) ? i : -1)).filter((i) => i > 0));
  place(t, sorted, gaps);
  await wait(1100);

  if (p.having) {
    const keep = new Set(d.exec(`SELECT ${key} FROM ${p.table}${W} GROUP BY ${key} HAVING ${p.having}`)[0]?.values.map((v) => v[0]) || []);
    caption('HAVING ' + p.having, 'drops whole groups after they are summarised.'); hlKw('HAVING');
    keyOf.forEach((k, rid) => { if (!keep.has(k)) t.rows.get(rid).el.classList.add('cut'); });
    await wait(1300);
  }

  caption('SELECT ' + p.cols, 'squashes each group into one row.'); hlKw('SELECT');
  for (let i = 0; i < final.values.length; i++) {
    const k = tagged.values[i]?.[0];
    const target = res.rows.get(i).el;
    target.style.setProperty('--g', color(k));
    target.classList.add('grouped');
    const members = [...keyOf].filter(([, kk]) => kk === k).map(([rid]) => t.rows.get(rid).el);
    members.forEach((el) => { el.classList.add('pick'); fly(el, target, color(k)); });
    await wait(700 * pace(i));
    place(res, [...res.order, i]);
    members.forEach((el) => el.classList.remove('pick'));
    setM('ret', i + 1);
  }
  caption('✓ ' + final.values.length + ' row' + (final.values.length === 1 ? '' : 's') + ' in set'); hl(none);
}

// ---- scene: JOIN (source tables on top, joined result underneath) ----
async function joinScene(s, d) {
  const p = parseSelect(s.sql);
  const head = p.from.match(/^(\w+)(?: (?:AS )?(?!LEFT\b|INNER\b|JOIN\b)(\w+))?/i);
  const parts = [{ table: head[1], alias: head[2] || head[1] }];
  for (const m of p.from.matchAll(/(LEFT )?(?:INNER )?JOIN (\w+)(?: (?:AS )?(?!ON\b)(\w+))? ON (.+?)(?= (?:LEFT |INNER )?JOIN |$)/gi))
    parts.push({ table: m[2], alias: m[3] || m[2], left: !!m[1], on: m[4] });
  parts.forEach((x, i) => {
    x.color = PALETTE[i];
    const all = read(d, x.table).cols;
    const ref = new Set([...s.sql.matchAll(new RegExp(`\\b${x.alias}\\.(\\w+)`, 'g'))].map((m) => m[1].toLowerCase()));
    x.cols = all.filter((c) => c === 'id' || ref.has(c.toLowerCase()));
  });
  // which column of each table carries the join key
  const keyCol = {};
  parts.slice(1).forEach((x) => {
    const m = x.on.match(/(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/);
    if (m) { keyCol[m[1] + '>' + x.alias] = m[2]; keyCol[m[3] + '>' + x.alias] = m[4]; x.pairs = [m[1], m[3]]; }
  });
  const byAlias = Object.fromEntries(parts.map((x) => [x.alias, x]));
  parts.forEach((x) => {
    const r = d.exec(`SELECT rowid, ${x.cols.join(', ')} FROM ${x.table} ORDER BY rowid`)[0];
    x.t = mkTable(`${x.table}${x.alias !== x.table ? ' ' + x.alias : ''}`, x.cols, r.values.map((v) => ({ rid: v[0], vals: v.slice(1) })), { color: x.color, keys: keysOf(d, x.table) });
  });

  // One query gives, per joined row: the rowid from each table + the output columns.
  const grouped = !!p.group || p.agg;
  const items = grouped
    ? [...new Set([...(p.cols + ' ' + (p.group || '')).matchAll(/\b(\w+)\.(\w+)\b/g)].map((m) => m[0]))].map((c) => `${c} AS "${c}"`)
    : p.items;
  const firstKey = grouped ? (p.group ? splitTop(p.group)[0] : "'all'") : null;
  const q = `SELECT ${parts.map((x) => x.alias + '.rowid').join(', ')}, ${items.join(', ')}`
    + (p.where ? `, CASE WHEN ${p.where} THEN 1 ELSE 0 END` : '')
    + (grouped ? `, ${firstKey}` : '')
    + ` FROM ${p.from}` + (p.where && grouped ? '' : '') + (!grouped && p.order ? ` ORDER BY ${p.order}` : '');
  const rows = exec(q, d);
  const n = parts.length, m = items.length;
  const outCols = rows.columns.slice(n, n + m);
  const colColors = items.map((it) => {
    const aliases = [...new Set([...it.matchAll(/\b(\w+)\./g)].map((x) => x[1]))].filter((a) => byAlias[a]);
    return aliases.length === 1 ? byAlias[aliases[0]].color : 'var(--muted)';
  });
  const joined = mkTable(grouped ? 'joined rows' : 'result', outCols, rows.values.map((v, i) => ({ rid: i, vals: v.slice(n, n + m) })), { colColors, color: 'var(--accent)' });
  const final = grouped ? exec(s.sql, d) : null;
  const fin = final && mkTable('result', final.columns, final.values.map((v, i) => ({ rid: i, vals: v })), { color: 'var(--accent)' });
  const topOrder = n === 3 ? [parts[1], parts[0], parts[2]] : parts;
  board(topOrder.map((x) => x.t.el), joined.el, fin?.el, { vertical: true }); // joins: tables on top, result below

  metrics([['pairs', 'Rows matched'], ['nomatch', 'No partner'], ['ret', 'Returned']]);
  legend([...parts.map((x) => [x.color, `from ${x.table}`]), ['var(--bad)', 'no match']]);
  setM('nomatch', 0);
  caption('FROM ' + parts.map((x) => x.table).join(' + '), 'Start with the tables being combined.'); hlKw('FROM');
  await enter(...parts.map((x) => x.t));

  const cellOf = (x, rid, col) => x.t.rows.get(rid)?.el.children[x.cols.indexOf(col)];
  const headCell = (x, col) => x.t.el.querySelectorAll('.thead span')[x.cols.indexOf(col)];
  parts.slice(1).forEach((x) => x.pairs?.forEach((a) => headCell(byAlias[a], keyCol[a + '>' + x.alias])?.classList.add('joinkey')));
  const joinWord = parts.some((x) => x.left) ? 'LEFT JOIN' : 'JOIN';
  caption(`${joinWord} … ON ${parts.slice(1).map((x) => x.on).join(' and ')}`, 'For each row, find the partner row whose key matches.');
  hlKw('JOIN', 'LEFT JOIN', 'INNER JOIN');

  const seen = parts.map(() => new Set());
  let noMatch = 0, live = [];
  for (let i = 0; i < rows.values.length; i++) {
    const rids = rows.values[i].slice(0, n);
    live.forEach((l) => unlink(l)); live = [];
    const els = [];
    rids.forEach((rid, j) => { if (rid != null) { seen[j].add(rid); const el = parts[j].t.rows.get(rid).el; el.classList.add('hit'); el.style.setProperty('--pc', parts[j].color); els.push([el, parts[j].color]); } });
    // draw the key-to-key link for every join condition
    parts.slice(1).forEach((x, jj) => {
      const j = jj + 1;
      if (!x.pairs) return;
      const [a1, a2] = x.pairs;
      const A = byAlias[a1], B = byAlias[a2];
      const ra = rids[parts.indexOf(A)], rb = rids[parts.indexOf(B)];
      const ca = ra != null && cellOf(A, ra, keyCol[a1 + '>' + x.alias]);
      const cb = rb != null && cellOf(B, rb, keyCol[a2 + '>' + x.alias]);
      if (ca && cb) { ca.classList.add('keyhit'); cb.classList.add('keyhit'); live.push(link(ca, cb, x.color)); }
      else { const lone = ca || cb; lone?.closest('.trow').classList.add('nopartner'); noMatch++; setM('nomatch', noMatch); }
    });
    const target = joined.rows.get(i).el;
    await wait(450 * pace(i));
    els.forEach(([el, c]) => fly(el, target, c));
    await wait(520 * pace(i));
    place(joined, [...joined.order, i]);
    setM('pairs', i + 1);
    els.forEach(([el]) => el.classList.remove('hit'));
    ui.inner.querySelectorAll('.keyhit').forEach((e) => e.classList.remove('keyhit'));
  }
  live.forEach((l) => unlink(l, true));
  await wait(300);
  clearLinks();

  // rows that never found a partner (INNER JOIN drops them)
  const dropped = [];
  parts.forEach((x, j) => x.t.rows.forEach((r, rid) => { if (!seen[j].has(rid)) { r.el.classList.add('cut'); dropped.push(cellText(r.vals[x.cols.indexOf('name')] ?? rid)); } }));
  if (dropped.length) { caption('No partner → not in the result', `${dropped.slice(0, 3).join(', ')}${dropped.length > 3 ? '…' : ''} had nothing to match, so an inner JOIN leaves ${dropped.length === 1 ? 'it' : 'them'} out.`); await wait(2200); }

  let out = [...joined.order];
  if (p.where) {
    const keepIdx = n + m;
    caption('WHERE ' + p.where, 'filters the joined rows.'); hlKw('WHERE');
    joined.rows.forEach((r, i) => { if (!rows.values[i][keepIdx]) r.el.classList.add('miss'); else r.el.classList.add('match'); });
    await wait(1400);
    out = out.filter((i) => rows.values[i][keepIdx]);
    place(joined, out);
    await wait(700);
  }
  setM('ret', out.length);

  if (grouped) {
    const gi = n + m + (p.where ? 1 : 0);
    const keys = [...new Set(out.map((i) => rows.values[i][gi]))];
    const col = (k) => PALETTE[(keys.indexOf(k) + 3) % PALETTE.length];
    caption('GROUP BY ' + (p.group || '—'), 'buckets the joined rows.'); hlKw('GROUP BY');
    out.forEach((i) => { const el = joined.rows.get(i).el; el.classList.add('grouped'); el.style.setProperty('--g', col(rows.values[i][gi])); });
    await wait(900);
    const sorted = [...out].sort((a, b) => keys.indexOf(rows.values[a][gi]) - keys.indexOf(rows.values[b][gi]) || a - b);
    place(joined, sorted, new Set(sorted.map((r, i) => (i && rows.values[r][gi] !== rows.values[sorted[i - 1]][gi] ? i : -1)).filter((i) => i > 0)));
    await wait(1100);
    const tagged = exec(s.sql.replace(/^\s*SELECT\s+/i, `SELECT ${firstKey} AS __k, `), d);
    caption('SELECT ' + p.cols, p.order ? `— one row per group, then ORDER BY ${p.order}.` : '— one row per group.'); hlKw('SELECT', 'ORDER BY');
    for (let i = 0; i < final.values.length; i++) {
      const k = tagged.values[i][0];
      const target = fin.rows.get(i).el;
      target.classList.add('grouped'); target.style.setProperty('--g', col(k));
      const members = out.filter((r) => rows.values[r][gi] === k).map((r) => joined.rows.get(r).el);
      members.forEach((el) => { el.classList.add('pick'); fly(el, target, col(k)); });
      await wait(650 * pace(i));
      place(fin, [...fin.order, i]);
      members.forEach((el) => el.classList.remove('pick'));
      setM('ret', i + 1);
    }
  }
  caption('✓ ' + (fin ? fin.order.length : out.length) + ' rows in set'); hl(none);
}

// ---- schema cards for CREATE TABLE (parsed from the learner-facing MySQL text) ----
const isConstraint = (it) => /^(PRIMARY|UNIQUE|FOREIGN|CONSTRAINT|CHECK|KEY|INDEX)\b/i.test(it);
function schemaRow(it, pkCols = new Set(), fks = {}, i = 0, added = false, uqCols = new Set()) {
  const m = it.match(/^`?(\w+)`?\s+(\w+(?:\s*\([^)]*\))?(?:\s+UNSIGNED)?)([\s\S]*)$/i);
  if (!m) return '';
  const [, col, type, rest] = m;
  const chips = [];
  if (/PRIMARY\s+KEY/i.test(rest) || pkCols.has(col)) chips.push(['pk', 'PK']);
  if (/AUTO_INCREMENT/i.test(rest)) chips.push(['ai', 'AUTO_INCREMENT']);
  if (/NOT\s+NULL/i.test(rest)) chips.push(['nn', 'NOT NULL']);
  if (/\bUNIQUE\b/i.test(rest) || uqCols.has(col)) chips.push(['uq', 'UNIQUE']);
  const df = rest.match(/DEFAULT\s+('[^']*'|[\w.()]+)/i);
  if (df && !/^NULL$/i.test(df[1])) chips.push(['df', 'DEFAULT ' + df[1]]);
  const ck = rest.match(/CHECK\s*(\(.*\))/i);
  if (ck) chips.push(['ck', 'CHECK ' + ck[1]]);
  const rf = rest.match(/REFERENCES\s+(\w+)\s*\((\w+)\)(.*)/i);
  const fk = rf ? `→ ${rf[1]}.${rf[2]}${/CASCADE/i.test(rf[3]) ? ' · CASCADE' : ''}` : fks[col];
  if (fk) chips.push(['fk', 'FK ' + fk]);
  if (added) chips.push(['new', 'ADDED']);
  return `<tr data-col="${esc(col)}" class="pop${added ? ' added' : ''}" style="--d:${(i * 0.22).toFixed(2)}s"><td class="sc-name">${esc(col)}</td><td class="sc-type">${esc(type.toUpperCase())}</td>
    <td>${chips.map(([c, t]) => `<span class="chip ${c}">${esc(t)}</span>`).join('')}</td></tr>`;
}
function schemaCard(st, color) {
  st = st.replace(/`/g, '');
  const name = st.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)/i)[1];
  const items = splitTop(st.slice(st.indexOf('(') + 1, st.lastIndexOf(')')));
  const pkCols = new Set(), fks = {}, extra = [], uqCols = new Set();
  items.filter(isConstraint).forEach((it) => {
    let m;
    if ((m = it.match(/^PRIMARY\s+KEY\s*\(([^)]*)\)/i))) m[1].split(',').forEach((c) => pkCols.add(c.trim().replace(/`/g, '')));
    else if ((m = it.match(/FOREIGN\s+KEY\s*\(`?(\w+)`?\)\s*REFERENCES\s+(\w+)\s*\((\w+)\)(.*)$/i)))
      fks[m[1]] = `→ ${m[2]}.${m[3]}${/CASCADE/i.test(m[4]) ? ' · CASCADE' : /SET\s+NULL/i.test(m[4]) ? ' · SET NULL' : ''}`;
    else if ((m = it.match(/^UNIQUE\s+(?:KEY|INDEX)?\s*\w*\s*\((\w+)\)$/i))) uqCols.add(m[1]);
    else if (!/^(KEY|INDEX)\b/i.test(it)) extra.push(it.replace(/\s+/g, ' '));
  });
  const cols = items.filter((it) => !isConstraint(it));
  const el = document.createElement('div');
  el.className = 'slab schema pop';
  el.style.setProperty('--c', color);
  el.innerHTML = `<div class="slab-title">CREATE TABLE ${esc(name)}</div>
    <table>${cols.map((c, i) => schemaRow(c, pkCols, fks, i, false, uqCols)).join('')}</table>
    ${extra.map((x) => `<div class="chip ck wide">${esc(x)}</div>`).join('')}`;
  el.cols = cols.length;
  return el;
}

// ---- scene: CREATE/ALTER/DROP + INSERT / UPDATE / DELETE / transactions, statement by statement ----
const exists = (d, n) => !!d.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${n}'`)[0];
const tableCount = (d) => d.exec(`SELECT COUNT(*) FROM sqlite_master WHERE type='table'`)[0].values[0][0];
const TARGET = /(?:^|;)\s*(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|ALTER\s+TABLE|DROP\s+TABLE(?:\s+IF\s+EXISTS)?|TRUNCATE\s+(?:TABLE\s+)?)\s+`?(\w+)/gim;
const targetOf = (st) => new RegExp(TARGET.source, 'im').exec(st)?.[1].toLowerCase(); // fresh regex: a shared /g one keeps lastIndex

async function writeScene(s, d) {
  const allSql = (s.pre || '') + '\n' + s.sql;
  const names = [...new Set([...allSql.matchAll(TARGET)].map((m) => m[1].toLowerCase()))];
  const usesTx = /\b(START\s+TRANSACTION|BEGIN|COMMIT|ROLLBACK)\b/i.test(allSql);
  metrics([['ins', 'Inserted'], ['upd', 'Updated'], ['del', 'Deleted'], usesTx ? ['tx', 'Transaction'] : ['tables', 'Tables']]);
  legend([['var(--good)', 'inserted'], ['var(--amber)', 'updated'], ['var(--bad)', 'deleted'],
    usesTx ? ['repeating-linear-gradient(45deg,var(--amber) 0 3px,transparent 3px 6px)', 'uncommitted'] : ['var(--violet)', 'schema']]);
  const resHolder = document.createElement('div');
  board([], resHolder);
  const row = ui.inner.querySelector('.row-top');
  const tabs = new Map();
  let ci = 0;
  const preCreate = (n) => (s.pre || '').split(';').find((x) => /^\s*CREATE\s+TABLE/i.test(x) && targetOf(x) === n);
  const addTable = (n, createSql) => {
    const r = read(d, n);
    const color = PALETTE[ci++ % PALETTE.length];
    const t = mkTable(n, r.cols, r.rows, { color, keys: keysOf(d, n) });
    t.color = color;
    t.wrap = document.createElement('div');
    t.wrap.className = 'tgroup';
    if (createSql) { t.card = schemaCard(createSql, color); t.wrap.append(t.card); }
    t.wrap.append(t.el);
    row.append(t.wrap);
    tabs.set(n, t);
    return t;
  };
  names.filter((n) => exists(d, n)).forEach((n) => addTable(n, preCreate(n)));
  ['ins', 'upd', 'del'].forEach((k) => setM(k, 0));
  const open0 = txOpen(d);
  if (usesTx) setM('tx', open0 ? 'open' : 'autocommit'); else setM('tables', tableCount(d));
  if (open0) { // a transaction from `pre` is in flight: show its changes as uncommitted
    const base = freshDb();
    tabs.forEach((t) => {
      if (!exists(base, t.name)) return;
      const b = new Map(read(base, t.name).rows.map((r) => [r.rid, JSON.stringify(r.vals)]));
      t.rows.forEach((r, rid) => { if (b.get(rid) !== JSON.stringify(r.vals)) r.el.classList.add('pend', b.has(rid) ? 'upd' : 'ins'); });
    });
    base.close();
  }
  caption('Before', tabs.size ? 'This is the data right now.' : 'The table doesn’t exist yet.'); hl(none);
  await enter(...tabs.values());
  await wait(500);

  // views created in `pre` are shown as cards from the start
  for (const v of (s.pre || '').matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+`?(\w+)`?/gi)) {
    const def = d.exec(`SELECT sql FROM sqlite_master WHERE type='view' AND name='${v[1]}'`)[0]?.values[0][0];
    if (def) row.prepend(viewCard(v[1], def));
  }
  const stmts = splitStatements(s.sql);
  const count = { ins: 0, upd: 0, del: 0 };
  const say = {
    INSERT: ['INSERT', 'adds new rows.'], UPDATE: ['UPDATE', 'changes values in the rows WHERE matches.'],
    DELETE: ['DELETE', 'removes the rows WHERE matches.'], START: ['START TRANSACTION', 'From here, changes are tentative until COMMIT.'],
    BEGIN: ['BEGIN', 'From here, changes are tentative until COMMIT.'], COMMIT: ['COMMIT', 'makes every change in the transaction permanent.'],
    ROLLBACK: ['ROLLBACK', 'undoes every change since START TRANSACTION.'], CREATE: ['CREATE TABLE', 'defines a new table: its columns, their types and their rules.'],
    ALTER: ['ALTER TABLE', 'changes the shape of an existing table.'], DROP: ['DROP TABLE', 'deletes the table, structure and rows, for good.'],
    TRUNCATE: ['TRUNCATE TABLE', 'empties the whole table in one go: no WHERE, and no rollback.'], SAVEPOINT: ['SAVEPOINT', 'bookmarks this moment inside the transaction.'],
    ROLLBACK_TO: ['ROLLBACK TO SAVEPOINT', 'undoes only the changes made after the bookmark. The transaction stays open.'], RELEASE: ['RELEASE SAVEPOINT', 'forgets the bookmark; the changes stay.'],
  };
  for (const [i, st] of stmts.entries()) {
    const kw = /^ROLLBACK\s+TO\b/i.test(st) ? 'ROLLBACK_TO' : st.split(/\s+/)[0].toUpperCase();
    hlStmt(i);
    if (READ_ONLY.test(st)) {
      caption(kw === 'SELECT' ? 'SELECT' : st.replace(/\s+/g, ' '), kw === 'SELECT' ? 'reads the data back.' : 'shows the table definition.');
      await wait(500);
      const r = exec(st, d);
      if (r) { const rt = mkTable('result', r.columns, r.values.map((v, j) => ({ rid: j, vals: v })), { color: 'var(--accent)' }); resHolder.replaceChildren(rt.el); await enter(rt); }
      continue;
    }
    caption(...(say[kw] || [kw, '']));
    await wait(900);
    try { exec(st, d); } catch (e) {
      bubble(mysqlError(e.message, st));
      tabs.forEach((t) => t.el.classList.add('shake'));
      caption('Rejected', 'The database refused this statement, and nothing changed.');
      await wait(3200);
      break;
    }
    const target = targetOf(st);
    const view = st.match(/^(?:CREATE(?:\s+OR\s+REPLACE)?|ALTER)\s+VIEW\s+`?(\w+)`?/i);
    if (view) {
      caption('CREATE VIEW', 'saves the query under a name. No data is copied.');
      row.querySelector(`[data-view="${view[1].toLowerCase()}"]`)?.remove();
      row.prepend(viewCard(view[1], st));
      await wait(1500);
      continue;
    }
    const dropView = st.match(/^DROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?`?(\w+)/i);
    if (dropView) {
      const c = row.querySelector(`[data-view="${dropView[1].toLowerCase()}"]`);
      c?.classList.add('dropped'); await wait(900); c?.remove();
      continue;
    }
    if (kw === 'SAVEPOINT' || kw === 'RELEASE') {
      if (kw === 'SAVEPOINT') setM('tx', `open · savepoint ${st.split(/\s+/)[1]}`);
      await wait(500);
      continue;
    }
    if (kw === 'CREATE') {
      const t = addTable(target, st);
      place(t, []);
      await wait(700 + t.card.cols * 260);
      if (!usesTx) setM('tables', tableCount(d));
      continue;
    }
    if (kw === 'DROP') {
      const t = tabs.get(target);
      if (t) { t.wrap.classList.add('dropped'); await wait(1000); t.wrap.remove(); tabs.delete(target); }
      if (!usesTx) setM('tables', tableCount(d));
      continue;
    }
    if (kw === 'ALTER') {
      const old = tabs.get(target), r = read(d, target);
      const t = mkTable(target, r.cols, r.rows, { color: old.color, keys: keysOf(d, target) });
      Object.assign(t, { color: old.color, wrap: old.wrap });
      old.el.replaceWith(t.el);
      tabs.set(target, t);
      const added = r.cols.map((c) => !old.cols.includes(c));
      t.el.querySelectorAll('.thead span').forEach((sp, j) => sp.classList.toggle('used', added[j]));
      // redraw the schema card from MySQL's own view of the table, highlighting what changed
      const card = schemaCard(showCreate(d, target).values[0][1], old.color);
      card.querySelector('.slab-title').textContent = `ALTER TABLE ${target}`;
      const was = new Map([...(old.card?.querySelectorAll('tr[data-col]') || [])].map((tr) => [tr.dataset.col, tr.textContent]));
      card.querySelectorAll('tr[data-col]').forEach((tr) => { if (was.get(tr.dataset.col) !== tr.textContent) tr.classList.add('added'); });
      if (old.card) old.card.replaceWith(card); else t.wrap.prepend(card);
      t.card = card;
      await enter(t);
      t.rows.forEach((rw) => rw.el.querySelectorAll('span').forEach((sp, j) => { if (added[j]) sp.classList.add('flash'); }));
      await wait(1200);
      continue;
    }
    const open = txOpen(d);
    if (kw === 'START' || kw === 'BEGIN') setM('tx', 'open');
    for (const t of tabs.values()) {
      const now = read(d, t.name);
      const nowMap = new Map(now.rows.map((r) => [r.rid, r.vals]));
      t.rows.forEach((r, rid) => {
        if (!nowMap.has(rid) && !r.el.classList.contains('gone')) { r.el.classList.add('del'); if (!kw.startsWith('ROLLBACK')) setM('del', ++count.del); }
      });
      for (const [rid, vals] of nowMap) {
        const cur = t.rows.get(rid);
        if (!cur) {
          const e = addRow(t, { rid, vals });
          e.classList.add('ins'); if (open) e.classList.add('pend');
          if (!kw.startsWith('ROLLBACK')) setM('ins', ++count.ins);
        } else if (JSON.stringify(cur.vals) !== JSON.stringify(vals)) {
          vals.forEach((v, ci2) => { if (v !== cur.vals[ci2]) { const sp = cur.el.children[ci2]; sp.textContent = cellText(v); sp.classList.remove('flash'); void sp.offsetWidth; sp.classList.add('flash'); } });
          cur.vals = vals;
          cur.el.classList.add('upd'); if (open) cur.el.classList.add('pend');
          if (!kw.startsWith('ROLLBACK')) setM('upd', ++count.upd);
        }
      }
      t.next = now.rows.map((r) => r.rid);
      place(t, [...t.order.filter((rid) => t.rows.get(rid)), ...t.next.filter((rid) => !t.order.includes(rid))]);
    }
    await wait(1300);
    tabs.forEach((t) => {
      place(t, t.next);
      t.rows.forEach((r) => { if (r.el.classList.contains('del')) setTimeout(() => r.el.remove(), 500); });
      t.rows.forEach((r, rid) => { if (r.el.classList.contains('del')) t.rows.delete(rid); });
    });
    if (kw === 'ROLLBACK_TO') setM('tx', 'open · rolled back to savepoint');
    if (kw === 'COMMIT') { tabs.forEach((t) => t.rows.forEach((r) => { if (r.el.classList.contains('pend')) r.el.classList.replace('pend', 'committed'); })); setM('tx', 'committed ✓'); }
    if (kw === 'ROLLBACK') { tabs.forEach((t) => t.rows.forEach((r) => r.el.classList.remove('pend', 'ins', 'upd'))); setM('tx', 'rolled back ↺'); }
    await wait(700);
  }
  if (!ui.bubble.textContent) caption('✓ Done', txOpen(d) ? 'The transaction is still open. Nothing is permanent yet.' : '');
  hl(none);
}

// ---- scene: query plans — full table scan vs B-tree index seek ----
const TYPE_COLOR = { ALL: 'var(--bad)', index: '#e0725f', range: 'var(--amber)', ref: 'var(--good)', eq_ref: 'var(--accent)', const: 'var(--accent)' };
const fmtN = (n) => Number(n).toLocaleString('en-US');
const BARS = 48;

// Conditions from this row's SELECT block that only involve this table and a literal value.
function literalWhere(row) {
  const w = whereOf(row.sql || '');
  if (!w) return [];
  return splitAnd(w).filter((c) => !/\(\s*SELECT/i.test(c)
    && [...c.matchAll(/\b(\w+)\.\w+/g)].every((m) => m[1] === row.alias)
    && !/=\s*\w+\.\w+/.test(c));
}
function strip(d, row) {
  const n = row.n, B = Math.max(1, Math.min(BARS, n));
  const hits = new Array(B).fill(0);
  const lits = literalWhere(row);
  if (row.real && lits.length)
    for (const [b, c] of d.exec(`SELECT CAST((rowid - 1) * ${B} / ${n} AS INT) AS b, COUNT(*) FROM ${row.real} ${row.alias} WHERE ${lits.join(' AND ')} GROUP BY b`)[0]?.values || []) hits[Math.min(B - 1, b)] = c;
  const el = document.createElement('div');
  el.className = 'strip';
  el.innerHTML = `<div class="bars">${hits.map((h) => `<i class="${h ? 'hit' : ''}" title="${h ? h + ' match' : ''}"></i>`).join('')}</div>
    <div class="strip-cap">${esc(row.real || row.table)} · ${fmtN(n)} rows${B < n ? ` · each bar ≈ ${fmtN(Math.round(n / B))} rows` : ''}</div>`;
  el.hits = hits;
  return el;
}
function btree(d, row) {
  const col = row.keyCols[0], n = row.n;
  const at = (k) => d.exec(`SELECT ${col} FROM ${row.real} ORDER BY ${col} LIMIT 1 OFFSET ${Math.min(n - 1, Math.floor(k))}`)[0]?.values[0][0];
  const first = [0, 1, 2, 3, 4, 5].map((i) => at((n * i) / 6));
  // which leaf holds the value we're looking for?
  const lit = literalWhere(row).map((c) => c.match(new RegExp(`\\b${col}\\s*(?:=|>=|>|<=|<|BETWEEN|IN\\s*\\()\\s*('[^']*'|-?\\d+(?:\\.\\d+)?)`, 'i'))).find(Boolean);
  const target = lit ? (lit[1].startsWith("'") ? lit[1].slice(1, -1) : +lit[1]) : null;
  let leaf = 2;
  if (target !== null) { leaf = 0; first.forEach((f, i) => { if (f !== null && f <= target) leaf = i; }); }
  const short = (v) => esc(String(v ?? '').slice(0, 10));
  const el = document.createElement('div');
  el.className = 'btree';
  el.innerHTML = `
    <div class="bt-level"><div class="bt-node" data-l="0">${short(first[3])}</div></div>
    <div class="bt-level"><div class="bt-node" data-l="1" data-i="0">${short(first[1])} · ${short(first[2])}</div><div class="bt-node" data-l="1" data-i="1">${short(first[4])} · ${short(first[5])}</div></div>
    <div class="bt-level">${first.map((f, i) => `<div class="bt-node leaf" data-l="2" data-i="${i}">${short(f)} …</div>`).join('')}</div>
    <div class="bt-cap">B-tree on <b>${esc(col)}</b> · sorted, ~${Math.max(2, Math.ceil(Math.log(Math.max(n, 2)) / Math.log(100)) + 1)} levels for ${fmtN(n)} rows${target === null ? ' · key comes from the outer row' : ` · looking for ${esc(String(target))}`}</div>`;
  el.path = [el.querySelector('[data-l="0"]'), el.querySelector(`[data-l="1"][data-i="${leaf < 3 ? 0 : 1}"]`), el.querySelector(`[data-l="2"][data-i="${leaf}"]`)];
  return el;
}
function accessCard(row) {
  const el = document.createElement('div');
  el.className = 'access pop';
  el.style.setProperty('--tc', TYPE_COLOR[row.type] || 'var(--muted)');
  el.innerHTML = `<div class="access-head">
      <span class="slab-title">${esc(row.table)}${row.select_type !== 'SIMPLE' ? ` <small>${esc(row.select_type)}</small>` : ''}</span>
      <span class="type-badge">type: ${esc(row.type)}</span>
      <span class="chip ${row.key ? 'pk' : 'ck'}">key: ${esc(row.key || 'none')}</span>
      <span class="chip df">rows ≈ ${fmtN(row.rows)}</span>
      ${row.extra.map((x) => `<span class="chip ${/filesort|temporary|join buffer/.test(x) ? 'ck' : 'uq'}">${esc(x)}</span>`).join('')}
    </div><div class="access-body"></div>`;
  return el;
}

async function playAccess(d, row, card, examined) {
  const body = card.querySelector('.access-body');
  if (row.type === 'ALL' || row.type === 'index' || !row.real) {
    const st = strip(d, row);
    body.append(st);
    caption(row.type === 'ALL' ? 'Full table scan' : 'Full index scan', `${row.type === 'ALL' ? 'no usable index, so' : ''} MySQL reads all ${fmtN(row.n)} rows of ${row.table}.`);
    const bars = [...st.querySelectorAll('i')];
    for (const [i, b] of bars.entries()) {
      b.classList.add('read');
      setM('rows', fmtN(Math.round(examined + ((i + 1) / bars.length) * row.rows)));
      await wait(1800 / bars.length);
    }
    return row.rows;
  }
  const tree = btree(d, row);
  body.append(tree);
  caption(`Index lookup (${row.type})`, `MySQL walks the ${row.key} B-tree from the root down to one leaf.`);
  await wait(400);
  for (const [i, node] of tree.path.entries()) {
    node.classList.add('on');
    if (i) link(tree.path[i - 1], node, TYPE_COLOR[row.type], true);
    await wait(650);
  }
  if (row.extra.includes('Using index')) {
    const note = document.createElement('div');
    note.className = 'covering';
    note.textContent = '✓ Covering index: every column the query needs is in the index, so the table itself is never read.';
    body.append(note);
  } else {
    const st = strip(d, row);
    st.classList.add('direct');
    body.append(st);
    const lit = [...st.querySelectorAll('i.hit')];
    caption(`→ ${fmtN(row.rows)} row${row.rows === 1 ? '' : 's'}`, 'The leaf stores pointers, so MySQL jumps straight to the matching rows and reads nothing else.');
    lit.slice(0, 6).forEach((b) => link(tree.path[2], b, TYPE_COLOR[row.type], true));
    lit.forEach((b) => b.classList.add('read'));
    if (!lit.length) st.querySelectorAll('i')[Math.floor(st.querySelectorAll('i').length / 2)]?.classList.add('read', 'hit');
  }
  setM('rows', fmtN(examined + row.rows));
  await wait(1200);
  return row.rows;
}

async function planScene(s, d) {
  metrics([['type', 'Access type'], ['key', 'Key used'], ['rows', 'Rows examined'], ['time', 'Query time']]);
  legend([['var(--bad)', 'ALL · full scan'], ['var(--amber)', 'range'], ['var(--good)', 'ref'], ['var(--accent)', 'eq_ref / const'], ['var(--violet)', 'Extra']]);
  ui.inner.innerHTML = `<svg class="links"></svg><div class="plan-stack"></div>`;
  const stack = ui.inner.querySelector('.plan-stack');
  const stmts = splitStatements(s.sql);
  let n = 0;
  for (const [i, st] of stmts.entries()) {
    hlStmt(i);
    const isExplain = /^EXPLAIN\s/i.test(st), isSelect = /^SELECT\b/i.test(st);
    if (!isExplain && !isSelect) {
      const idx = st.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(\w+)\s+ON\s+(\w+)\s*\(([^)]*)\)/i);
      caption(idx ? 'CREATE INDEX' : st.split(/\s+/).slice(0, 2).join(' '), idx ? `builds a sorted copy of ${idx[3]} with a pointer to each row of ${idx[2]}.` : '');
      await wait(700);
      try { exec(st, d); } catch (e) { bubble(mysqlError(e.message, st)); await wait(2500); return; }
      if (idx) {
        const b = document.createElement('div');
        b.className = 'block pop built';
        b.style.setProperty('--c', '#7bb05a');
        b.innerHTML = `<b>✓ index ${esc(idx[1])}</b><small>on ${esc(idx[2])} (${esc(idx[3])}) · ${fmtN(d.exec(`SELECT COUNT(*) FROM ${idx[2]}`)[0].values[0][0])} entries, sorted</small>`;
        stack.append(b);
        ui.scene.scrollTo({ top: b.offsetTop, behavior: 'smooth' });
        await wait(1200);
      }
      continue;
    }
    const q = st.replace(/^EXPLAIN\s+(?:FORMAT\s*=\s*\w+\s+)?/i, '');
    const { rows, result } = explain(d, q);
    const ms = timeQuery(d, q);
    n++;
    const panel = document.createElement('div');
    panel.className = 'plan-panel pop';
    panel.innerHTML = `<div class="plan-title"><b>${isExplain ? 'EXPLAIN' : 'SELECT'} #${n}</b><code>${esc(q.replace(/\s+/g, ' ').slice(0, 90))}</code></div><div class="plan-body"><div class="plan-left"><div class="plan-cards"></div><div class="plan-sum"></div></div></div>`;
    stack.append(panel);
    ui.scene.scrollTo({ top: panel.offsetTop, behavior: 'smooth' });
    const cards = panel.querySelector('.plan-cards');
    caption(isExplain ? 'EXPLAIN' : 'Plan', 'MySQL decides how to reach each table before it reads anything.');
    await wait(700);
    let examined = 0, product = 1;
    const worst = rows.reduce((w, r) => (['ALL', 'index', 'range', 'ref', 'eq_ref', 'const'].indexOf(r.type) < ['ALL', 'index', 'range', 'ref', 'eq_ref', 'const'].indexOf(w) ? r.type : w), 'const');
    for (const [k, row] of rows.entries()) {
      if (k) {
        const j = document.createElement('div');
        j.className = 'nest';
        j.textContent = row.select_type === 'DEPENDENT SUBQUERY'
          ? `↓ correlated: this runs again for each of the ${fmtN(rows[0].rows)} outer rows`
          : row.id === rows[k - 1].id ? `↓ nested loop: for each row above, look up in ${row.table}` : `↓ subquery #${row.id}`;
        cards.append(j);
      }
      const card = accessCard(row);
      cards.append(card);
      setM('type', row.type); setM('key', row.key || 'none');
      await wait(400);
      // a dependent subquery runs once per outer row
      examined += (await playAccess(d, row, card, examined)) * (row.select_type === 'DEPENDENT SUBQUERY' ? rows[0].rows : 1);
      if (row.id === 1) product *= row.rows;
    }
    setM('type', worst);
    setM('rows', rows.filter((r) => r.id === 1).length > 1 ? `${rows.filter((r) => r.id === 1).map((r) => fmtN(r.rows)).join(' × ')} = ${fmtN(product)}` : fmtN(examined));
    setM('time', ms < 1 ? ms.toFixed(3) + ' ms' : ms.toFixed(1) + ' ms');
    panel.querySelector('.plan-sum').innerHTML = `<span style="--tc:${TYPE_COLOR[worst]}" class="type-badge">${esc(worst)}</span> examined ≈ <b>${fmtN(rows.filter((r) => r.id === 1).length > 1 ? product : examined)}</b> rows · <b>${ms < 1 ? ms.toFixed(3) : ms.toFixed(1)} ms</b>`;
    // the EXPLAIN output itself, as MySQL prints it
    const shown = isExplain ? result : (() => { const r = exec(q, d) || { columns: [], values: [] }; return { columns: r.columns, values: r.values.slice(0, 8), total: r.values.length }; })();
    const t = mkTable(isExplain ? 'EXPLAIN' : `result${shown.total > 8 ? ` (first 8 of ${fmtN(shown.total)})` : ''}`, shown.columns, shown.values.map((v, j) => ({ rid: j, vals: v })), { color: 'var(--accent)' });
    panel.querySelector('.plan-body').append(t.el);
    await enter(t);
    await wait(600);
  }
  caption('✓ Done', n > 1 ? 'Compare the panels: same question, very different amounts of work.' : ''); hl(none);
}

// ---- scene: window functions — every row stays; each one looks through its window ----
function overSpec(item) {
  const m = item.match(/\bOVER\s*\(/i);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  let dep = 0, close = open;
  for (; close < item.length; close++) { if (item[close] === '(') dep++; if (item[close] === ')' && --dep === 0) break; }
  const fn = item.slice(0, m.index).match(/(\w+)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/);
  return { spec: item.slice(open + 1, close).trim(), fn: fn ? fn[1].toUpperCase() : '?', args: fn ? splitTop(fn[2]) : [] };
}
const WIN_SAY = {
  ROW_NUMBER: 'numbers the rows 1, 2, 3… inside each window. Ties still get different numbers.',
  RANK: 'gives ties the same rank, then skips ahead (1, 1, 3).',
  DENSE_RANK: 'gives ties the same rank, with no gaps (1, 1, 2).',
  PERCENT_RANK: '= (rank − 1) ÷ (rows in window − 1): where the row sits, from 0 to 1.',
  CUME_DIST: '= share of rows in the window at or before this one.',
  NTILE: 'deals the rows into N buckets of nearly equal size.',
  LAG: 'copies a value from an earlier row of the window, or NULL if there isn’t one.',
  LEAD: 'copies a value from a later row of the window, or NULL if there isn’t one.',
  FIRST_VALUE: 'takes the value from the first row of the frame.',
  LAST_VALUE: 'takes the value from the last row of the frame. Watch out: by default the frame ends at the current row!',
  NTH_VALUE: 'takes the value from the Nth row of the frame.',
};
async function windowScene(s, d) {
  let q = s.sql.replace(/\s+/g, ' ').trim().replace(/;$/, '');
  let outerWhere = null;
  const top = mask(q);
  if (!/\bOVER\s*\(/i.test(q.slice(0, top.search(/ FROM /i)))) { // mask() blanks the parentheses, so test the real text
    // window inside a derived table (top-N per group): animate the inner query, then the outer WHERE
    const sub = q.match(/FROM\s*\(\s*(SELECT[\s\S]+)\s*\)\s*(?:AS\s+)?\w+\s*(?:WHERE\s+([\s\S]+?))?(?:\s+ORDER BY[\s\S]*)?$/i);
    if (!sub) return selectScene(s, d);
    q = sub[1]; outerWhere = sub[2] || null;
  }
  const selEnd = mask(q).search(/ FROM /i);
  const items = splitTop(q.slice(7, selEnd));
  const wins = items.map((it, i) => ({ i, ...(overSpec(it) || {}) })).filter((w) => w.spec !== undefined);
  const spec = wins[0].spec;
  const part = (spec.match(/PARTITION BY (.+?)(?= ORDER BY | ROWS | RANGE |$)/i) || [])[1];
  const ord = (spec.match(/ORDER BY (.+?)(?= ROWS | RANGE |$)/i) || [])[1];
  const terms = ord ? splitTop(ord).map((x) => x.replace(/\s+(ASC|DESC)$/i, '')) : [];
  let aug = `SELECT ${part || "'all'"} AS __p, ROW_NUMBER() OVER (${part ? 'PARTITION BY ' + part : ''} ${ord ? 'ORDER BY ' + ord : ''}) AS __rn, `
    + `${terms.length ? terms.map((x) => `COALESCE(CAST(${x} AS TEXT), '∅')`).join(" || '|' || ") : 'NULL'} AS __o, ${items.join(', ')} ${q.slice(selEnd)}`;
  if (outerWhere) aug = `SELECT *, CASE WHEN (${outerWhere}) THEN 1 ELSE 0 END AS __keep FROM (${aug})`;
  const r = exec(aug, d);
  const cols = r.columns.slice(3, 3 + items.length);
  const rows = r.values.map((v) => ({ p: v[0], rn: v[1], o: v[2], vals: v.slice(3, 3 + items.length), keep: outerWhere ? v[3 + items.length] : 1 }));
  const parts = [...new Set(rows.map((x) => x.p))].sort((a, b) => (a === null ? -1 : b === null ? 1 : a < b ? -1 : a > b ? 1 : 0));
  rows.sort((a, b) => parts.indexOf(a.p) - parts.indexOf(b.p) || a.rn - b.rn);
  const color = (p) => PALETTE[parts.indexOf(p) % PALETTE.length];
  const winCols = new Set(wins.map((w) => w.i));
  const t = mkTable(outerWhere ? 'inner query' : 'result', cols, rows.map((x, j) => ({ rid: j, vals: x.vals })),
    { color: 'var(--accent)', colColors: cols.map((c, i) => (winCols.has(i) ? 'var(--violet)' : null)) });
  board([t.el]);
  rows.forEach((x, j) => wins.forEach((w) => { const sp = t.rows.get(j).el.children[w.i]; sp.textContent = '·'; sp.classList.add('pending'); }));
  metrics([['parts', 'Windows'], ['rows', 'Rows'], ['fn', 'Function'], ['frame', 'Frame']]);
  legend([...parts.slice(0, 6).map((p) => [color(p), part ? `window: ${cellText(p)}` : 'one window: every row']), ['var(--violet)', 'window column']]);
  caption('FROM', 'Every row stays. A window function adds a column; it never removes rows.'); hlKw('FROM');
  await enter(t);
  setM('rows', rows.length); setM('parts', parts.length);
  const gaps = new Set(rows.map((x, j) => (j && x.p !== rows[j - 1].p ? j : -1)).filter((j) => j > 0));
  caption(part ? `PARTITION BY ${part}` : 'OVER ()', part ? `splits the rows into ${parts.length} windows, without squashing them like GROUP BY.` : 'One window holding every row.');
  hl((el) => /OVER|PARTITION BY/i.test(el.textContent));
  rows.forEach((x, j) => { const el = t.rows.get(j).el; el.classList.add('grouped'); el.style.setProperty('--g', color(x.p)); });
  place(t, rows.map((_, j) => j), gaps);
  await wait(1200);
  if (ord) { caption(`ORDER BY ${ord}`, 'sorts the rows inside each window.'); await wait(1000); }
  const pos = rows.map((x, j) => rows.filter((y, k) => k < j && y.p === x.p).length);
  const members = (j) => rows.map((_, k) => k).filter((k) => rows[k].p === rows[j].p);
  for (const w of wins) {
    caption(`${w.fn}() OVER (${w.spec})`, WIN_SAY[w.fn] || (/ORDER BY/i.test(w.spec) ? 'is computed over the frame: from the window’s first row up to this one, a running total.' : 'is computed over the whole window, so every row gets the window total.'));
    setM('fn', w.fn);
    const fr = w.spec.match(/ROWS\s+BETWEEN\s+(UNBOUNDED\s+PRECEDING|(\d+)\s+PRECEDING|CURRENT\s+ROW)\s+AND\s+(UNBOUNDED\s+FOLLOWING|(\d+)\s+FOLLOWING|CURRENT\s+ROW)/i);
    for (let j = 0; j < rows.length; j++) {
      const mem = members(j), k = pos[j], n = mem.length;
      let lo = 0, hi = n - 1;
      if (fr) {
        lo = /UNBOUNDED/i.test(fr[1]) ? 0 : fr[2] ? Math.max(0, k - +fr[2]) : k;
        hi = /UNBOUNDED/i.test(fr[3]) ? n - 1 : fr[4] ? Math.min(n - 1, k + +fr[4]) : k;
      } else if (/ORDER BY/i.test(w.spec)) { hi = k; while (hi + 1 < n && rows[mem[hi + 1]].o === rows[j].o) hi++; } // default RANGE frame: up to the last tie
      const off = +(w.args[1] ?? 1) || 1;
      const span = (a, b) => (b < a ? [] : [...Array(b - a + 1).keys()].map((x) => x + a));
      const frame = { LAG: k - off >= 0 ? [k - off] : [], LEAD: k + off < n ? [k + off] : [], FIRST_VALUE: [lo], LAST_VALUE: [hi],
        NTH_VALUE: lo + (+w.args[1] || 1) - 1 <= hi ? [lo + (+w.args[1] || 1) - 1] : [] }[w.fn]
        ?? (/^(ROW_NUMBER|RANK|DENSE_RANK|PERCENT_RANK|CUME_DIST|NTILE)$/.test(w.fn) ? span(0, k) : span(lo, hi));
      const cur = t.rows.get(j).el;
      cur.classList.add('cursor');
      frame.forEach((f) => t.rows.get(mem[f]).el.classList.add('frame'));
      setM('frame', frame.length ? `${frame.length} row${frame.length === 1 ? '' : 's'}` : 'none → NULL');
      await wait(560 * pace(j));
      const sp = cur.children[w.i];
      sp.textContent = cellText(rows[j].vals[w.i]); sp.classList.remove('pending'); sp.classList.add('flash');
      await wait(240 * pace(j));
      cur.classList.remove('cursor');
      frame.forEach((f) => t.rows.get(mem[f]).el.classList.remove('frame'));
    }
    await wait(400);
  }
  if (outerWhere) {
    caption(`WHERE ${outerWhere}`, 'The outer query filters on the window column. WHERE can’t see window results directly, hence the wrapper query.');
    hl((el) => /^\s*\)|WHERE/i.test(el.textContent) && !/OVER/i.test(el.textContent));
    const keep = rows.map((x, j) => (x.keep ? j : -1)).filter((j) => j >= 0);
    rows.forEach((x, j) => { if (!x.keep) t.rows.get(j).el.classList.add('cut'); });
    await wait(1500);
    place(t, keep, new Set(keep.map((j, i) => (i && rows[j].p !== rows[keep[i - 1]].p ? i : -1)).filter((i) => i > 0)));
    await wait(700);
    caption(`✓ ${keep.length} rows in set`); hl(none); return;
  }
  caption(`✓ ${rows.length} rows in set`, part ? '(shown grouped by window)' : ''); hl(none);
}

// ---- scene: UNION / INTERSECT / EXCEPT — results stacked, not joined ----
async function setScene(s, d) {
  const flat = s.sql.replace(/\s+/g, ' ').trim().replace(/;$/, '');
  const ops = [...mask(flat).matchAll(/\s(UNION ALL|UNION DISTINCT|UNION|INTERSECT|EXCEPT)\s+(?=SELECT|\()/gi)];
  const parts = [];
  let last = 0;
  ops.forEach((o) => { parts.push(flat.slice(last, o.index).trim()); last = o.index + o[0].length; });
  let lastPart = flat.slice(last).trim(), tail = '';
  const ti = mask(lastPart).search(/\s(ORDER BY|LIMIT)\s/i);
  if (ti >= 0) { tail = lastPart.slice(ti).trim(); lastPart = lastPart.slice(0, ti).trim(); }
  parts.push(lastPart);
  const res = parts.map((p) => exec(p.replace(/^\((.*)\)$/s, '$1'), d) || { columns: [], values: [] });
  const key = (row) => JSON.stringify(row.map(fmt));
  metrics([['a', 'SELECT #1 rows'], ['b', parts.length > 2 ? 'Other SELECTs' : 'SELECT #2 rows'], ['dup', 'Duplicates dropped'], ['ret', 'Result']]);
  legend([...parts.map((_, i) => [PALETTE[i], `SELECT #${i + 1}`]), ['var(--bad)', 'dropped']]);
  const srcT = res.map((r, i) => mkTable(`SELECT #${i + 1}`, r.columns, r.values.map((v, j) => ({ rid: j, vals: v })), { color: PALETTE[i] }));
  const out = mkTable('result', res[0].columns, [], { color: 'var(--accent)' });
  board(srcT.map((t) => t.el), out.el);
  caption('Separate queries', 'Each SELECT runs on its own first. Same number of columns in each!'); hl(none);
  await enter(...srcT);
  setM('a', res[0].values.length); setM('b', res.slice(1).reduce((n, r) => n + r.values.length, 0)); setM('dup', 0); setM('ret', 0);
  let acc = [], nextId = 0, dups = 0;
  const addOut = async (row, fromEl, color, i) => {
    const id = nextId++;
    const e = addRow(out, { rid: id, vals: row });
    fly(fromEl, e, color);
    await wait(420 * pace(i));
    place(out, [...out.order, id]);
    acc.push({ k: key(row), id });
    setM('ret', acc.length);
  };
  const dedupeAll = ops.some((o) => !/ALL/i.test(o[1]));
  caption('SELECT #1', 'Its rows go into the result first.'); hl((el) => el.dataset.st === '0' && !/UNION|INTERSECT|EXCEPT/i.test(el.textContent));
  for (const [j, row] of res[0].values.entries()) {
    const el = srcT[0].rows.get(j).el;
    if (dedupeAll && acc.some((a) => a.k === key(row))) { el.classList.add('miss'); setM('dup', ++dups); await wait(300); continue; }
    await addOut(row, el, PALETTE[0], j);
  }
  for (const [oi, o] of ops.entries()) {
    const op = o[1].toUpperCase().replace('UNION DISTINCT', 'UNION');
    const B = res[oi + 1], bt = srcT[oi + 1], bKeys = new Set(B.values.map(key));
    hl((el) => el.textContent.trim().toUpperCase().startsWith(op.split(' ')[0]));
    if (op.startsWith('UNION')) {
      caption(op, op === 'UNION ALL' ? 'appends every row, duplicates included.' : 'appends rows, but a row that’s already in the result is dropped.');
      await wait(700);
      for (const [j, row] of B.values.entries()) {
        const el = bt.rows.get(j).el, hit = acc.find((a) => a.k === key(row));
        if (op === 'UNION' && hit) {
          const ex = out.rows.get(hit.id).el;
          el.classList.add('miss'); ex.classList.add('dupflash'); fly(el, ex, 'var(--bad)');
          setM('dup', ++dups);
          await wait(460 * pace(j));
          ex.classList.remove('dupflash');
          continue;
        }
        await addOut(row, el, PALETTE[oi + 1], j);
      }
    } else {
      const keepIt = op === 'INTERSECT' ? (k) => bKeys.has(k) : (k) => !bKeys.has(k);
      caption(op, op === 'INTERSECT' ? 'keeps only rows that appear in both results.' : 'removes every row that also appears in the next result.');
      await wait(700);
      for (const [i, a] of acc.entries()) {
        const el = out.rows.get(a.id).el, bj = B.values.findIndex((v) => key(v) === a.k);
        if (bj >= 0) { const b = bt.rows.get(bj).el; b.classList.add(op === 'INTERSECT' ? 'match' : 'miss'); link(b, el, op === 'INTERSECT' ? 'var(--good)' : 'var(--bad)', true); }
        el.classList.add(keepIt(a.k) ? 'match' : 'miss');
        await wait(450 * pace(i));
      }
      await wait(700);
      clearLinks();
      acc = acc.filter((a) => keepIt(a.k));
      place(out, acc.map((a) => a.id));
      bt.rows.forEach((r) => { if (!r.el.classList.contains('match') && !r.el.classList.contains('miss')) r.el.classList.add('cut'); });
      setM('ret', acc.length);
      await wait(600);
    }
  }
  if (tail) {
    caption(tail, 'applies to the combined result, not to one SELECT.'); hl((el) => /ORDER BY|LIMIT/i.test(el.textContent));
    const final = exec(s.sql, d);
    const used = new Set();
    const ids = final.values.map((v) => { const a = acc.find((x) => x.k === key(v) && !used.has(x.id)); if (a) used.add(a.id); return a?.id; }).filter((x) => x !== undefined);
    place(out, ids);
    acc = ids.map((id) => acc.find((a) => a.id === id));
    await wait(1100);
  }
  caption(`✓ ${acc.length} rows in set`, 'Column names come from the first SELECT.'); hl(none);
}

// ---- scene: databases on the server ----
async function catalogScene(s, d) {
  metrics([['dbs', 'Databases'], ['cur', 'Current (USE)'], ['tables', 'Tables in it']]);
  legend([['var(--accent)', 'current database'], ['var(--violet)', 'table'], ['var(--amber)', 'view']]);
  ui.inner.innerHTML = `<svg class="links"></svg><div class="board side"><div class="row-top catalog"></div><div class="res"></div></div>`;
  const row = ui.inner.querySelector('.catalog'), resBox = ui.inner.querySelector('.res');
  let seen = new Set();
  const render = () => {
    const cur = meta(d).use;
    row.innerHTML = '';
    for (const db of dbNames(d)) {
      const sch = db === 'shop' ? 'main' : db;
      const tabs = d.exec(`SELECT name, type FROM ${sch}.sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name`)[0]?.values || [];
      const col = document.createElement('div');
      col.className = `dbcol${db === cur ? ' current' : ''}${seen.has(db) ? '' : ' pop'}`;
      col.dataset.db = db;
      col.innerHTML = `<div class="cyl3d mini"><div class="disk"></div><div class="disk"></div><span class="tag-float">⛁ ${esc(db)}</span></div>
        <div class="dbtabs">${tabs.map(([n, ty]) => `<span class="chip ${ty === 'view' ? 'pk' : 'uq'}${seen.has(db + '.' + n) ? '' : ' pop'}">${esc(n)}${ty === 'view' ? ' · view' : ` · ${d.exec(`SELECT COUNT(*) FROM ${sch}.${n}`)[0].values[0][0]} rows`}</span>`).join('') || '<small>(empty)</small>'}</div>`;
      row.append(col);
      tabs.forEach(([n]) => seen.add(db + '.' + n));
      if (db === cur) setM('tables', tabs.length);
    }
    dbNames(d).forEach((db) => seen.add(db));
    setM('dbs', dbNames(d).length); setM('cur', cur);
  };
  render();
  caption('The server', 'One MySQL server holds many databases, and each database holds its own tables.'); hl(none);
  await wait(1200);
  const say = { CREATE: 'creates', USE: 'makes this the current database: unqualified table names now point here', DROP: 'deletes', SHOW: 'lists', SELECT: 'reads' };
  for (const [i, st] of splitStatements(s.sql).entries()) {
    hlStmt(i);
    const kw = st.split(/\s+/)[0].toUpperCase();
    caption(st.replace(/\s+/g, ' ').slice(0, 48), say[kw] ? say[kw] + '.' : '');
    await wait(900);
    const dropDb = st.match(/^DROP\s+(?:DATABASE|SCHEMA)\s+(?:IF\s+EXISTS\s+)?`?(\w+)/i);
    if (dropDb) { row.querySelector(`[data-db="${dropDb[1]}"]`)?.classList.add('dropped'); await wait(900); }
    let r;
    try { r = exec(st, d); } catch (e) { bubble(mysqlError(e.message, st)); caption('Rejected'); await wait(3000); break; }
    render();
    if (r) { const t = mkTable('result', r.columns, r.values.map((v, j) => ({ rid: j, vals: v })), { color: 'var(--accent)' }); resBox.replaceChildren(t.el); await enter(t); }
    await wait(700);
  }
  if (!ui.bubble.textContent) caption('✓ Done'); hl(none);
}

// ---- scene: users and their privileges ----
async function privScene(s, d) {
  metrics([['users', 'Users'], ['who', 'Connected as'], ['grants', 'Privileges']]);
  legend([['var(--good)', 'allowed'], ['var(--line)', 'not allowed'], ['var(--bad)', 'denied']]);
  ui.inner.innerHTML = `<svg class="links"></svg><div class="board side"><div class="row-top users"></div><div class="res"></div></div>`;
  const row = ui.inner.querySelector('.users'), resBox = ui.inner.querySelector('.res');
  const P4 = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  let before = new Map(), seen = new Set();
  const render = (who) => {
    const tables = d.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)[0]?.values.map((v) => v[0]) || [];
    const now = new Map();
    let total = 0;
    row.innerHTML = `<div class="block root-user"><b>root@localhost</b><small>ALL PRIVILEGES · can GRANT</small></div>`;
    for (const k of meta(d).users.keys()) {
      const card = document.createElement('div');
      card.className = `slab priv${seen.has(k) ? '' : ' pop'}${who === k ? ' connected' : ''}`;
      card.dataset.user = k;
      card.style.setProperty('--c', '#9a7cd6');
      const cells = tables.map((t) => `<tr><th>${esc(t)}</th>${P4.map((p) => {
        const ok = has(d, k, p, 'shop', t), id = `${k}|${t}|${p}`;
        now.set(id, ok); if (ok) total++;
        const was = before.get(id);
        return `<td data-cell="${esc(t)}|${p}" class="${ok ? 'yes' : 'no'}${was !== undefined && was !== ok ? (ok ? ' gained' : ' lost') : ''}">${ok ? '✓' : '·'}</td>`;
      }).join('')}</tr>`).join('');
      card.innerHTML = `<div class="slab-title">${esc(k.replace('@', "'@'").replace(/^/, "'") + "'")}${who === k ? ' · connected' : ''}</div>
        <table><tr><th></th>${P4.map((p) => `<th>${p}</th>`).join('')}</tr>${cells}</table>
        <div class="grants">${grantLines(d, k).slice(1).map(([g]) => `<code>${esc(g.replace(/ TO .*/, ''))}</code>`).join('') || '<small>USAGE only: can log in, nothing else</small>'}</div>`;
      row.append(card);
      seen.add(k);
    }
    before = now;
    setM('users', meta(d).users.size + 1); setM('grants', total); setM('who', who || 'root');
  };
  render(null);
  caption('Accounts', 'root can do everything. Every other account starts with nothing.'); hl(none);
  await wait(1100);
  for (const [i, st] of splitStatements(s.sql).entries()) {
    hlStmt(i);
    const admin = /^(CREATE|DROP)\s+USER|^GRANT|^REVOKE|^SHOW\s+GRANTS/i.test(st);
    const who = s.as && !admin ? s.as : null;
    caption(who ? `Connected as ${who}` : st.replace(/\s+/g, ' ').slice(0, 50), who ? 'Every statement is checked against this user’s privileges.' : '');
    render(who);
    await wait(900);
    meta(d).as = who;
    let r;
    try { r = exec(st, d); } catch (e) {
      const msg = mysqlError(e.message, st);
      bubble(msg);
      const m = msg.match(/1142 \(42000\): (\w+) command denied .* table '(\w+)'/);
      const card = row.querySelector(`[data-user="${who}"]`);
      card?.classList.add('shake');
      if (m) card?.querySelector(`[data-cell="${m[2]}|${m[1]}"]`)?.classList.add('deny');
      caption('Denied', 'MySQL refused before touching any data.');
      await wait(3200);
      break;
    } finally { meta(d).as = null; }
    render(who);
    if (r) { const t = mkTable('result', r.columns, r.values.map((v, j) => ({ rid: j, vals: v })), { color: 'var(--accent)' }); resBox.replaceChildren(t.el); await enter(t); }
    await wait(900);
  }
  if (!ui.bubble.textContent) caption('✓ Done'); hl(none);
}

// ---- scene: stored procedures — the server runs the stored code line by line ----
function procLines(tree, depth = 1) {
  const out = [];
  for (const n of tree) {
    if (n.type === 'stmt') out.push([n.id, depth, n.text]);
    else if (n.type === 'if') {
      out.push([n.id, depth, n.text]);
      n.branches.forEach((b, i) => { if (i) out.push([b.id, depth, b.text]); out.push(...procLines(b.list, depth + 1)); });
      if (n.else) { out.push([n.elseId, depth, 'ELSE']); out.push(...procLines(n.else, depth + 1)); }
      out.push([null, depth, 'END IF']);
    } else { out.push([n.id, depth, n.text]); out.push(...procLines(n.list, depth + 1)); out.push([null, depth, 'END WHILE']); }
  }
  return out;
}
function procCard(p) {
  const el = document.createElement('div');
  el.className = 'slab code proc pop';
  el.dataset.proc = p.name.toLowerCase();
  el.style.setProperty('--c', '#5c8fd9');
  const sig = p.params.map((x) => `${x.mode} ${x.name} ${x.type}`).join(', ');
  el.innerHTML = `<div class="slab-title">PROCEDURE ${esc(p.name)}(${esc(sig)})</div>
    <div class="pl">BEGIN</div>${procLines(p.tree).map(([id, dep, txt]) => `<div class="pl"${id !== null ? ` data-id="${id}"` : ''} style="padding-left:${dep * 16}px">${esc(txt.replace(/\s+/g, ' ').slice(0, 72))}</div>`).join('')}<div class="pl">END</div>`;
  return el;
}
function hlText(st) {
  const lines = [...ui.qcode.querySelectorAll('.ql')];
  const first = st.split('\n')[0].trim();
  const at = lines.findIndex((el) => el.textContent.trim().startsWith(first));
  const n = st.split('\n').length;
  lines.forEach((el, i) => el.classList.toggle('on', at >= 0 && i >= at && i < at + n));
}
async function procScene(s, d) {
  metrics([['stmts', 'Statements run'], ['changed', 'Rows changed'], ['results', 'Result sets']]);
  legend([['var(--amber)', 'running now'], ['var(--violet)', 'variables'], ['var(--bad)', 'error']]);
  ui.inner.innerHTML = `<svg class="links"></svg><div class="board side"><div class="left-col"><div class="row-top procs"></div><div class="vars"></div></div><div class="res"></div></div>`;
  const row = ui.inner.querySelector('.procs'), varsBox = ui.inner.querySelector('.vars'), resBox = ui.inner.querySelector('.res');
  const showVars = (obj) => { varsBox.innerHTML = Object.entries(obj || {}).map(([k, v]) => `<span class="chip uq">${esc(k)} = ${esc(cellText(v))}</span>`).join(''); };
  const showResult = async (r) => { const t = mkTable('result', r.columns, r.values.slice(0, 10).map((v, j) => ({ rid: j, vals: v })), { color: 'var(--accent)' }); resBox.replaceChildren(t.el); await enter(t); };
  meta(d).procs.forEach((p) => row.append(procCard(p)));
  let stmts = 0, changed = 0, results = 0;
  ['stmts', 'changed', 'results'].forEach((k) => setM(k, 0));
  caption('Stored procedures', 'Code saved on the server, run with CALL.'); hl(none);
  await wait(800);
  for (const st of splitStatements(s.sql)) {
    hlText(st);
    const kw = st.split(/\s+/)[0].toUpperCase();
    if (/^CREATE\s+(?:DEFINER\s*=\s*\S+\s+)?PROCEDURE/i.test(st)) {
      caption('CREATE PROCEDURE', 'stores the code on the server. Nothing runs yet.');
      try { exec(st, d); } catch (e) { bubble(mysqlError(e.message, st)); await wait(3000); break; }
      const name = st.match(/PROCEDURE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)/i)[1].toLowerCase();
      row.querySelector(`[data-proc="${name}"]`)?.remove();
      row.append(procCard(meta(d).procs.get(name)));
      await wait(1500);
      continue;
    }
    if (kw === 'CALL') {
      caption(st.replace(/\s+/g, ' '), 'runs the stored code with these arguments.');
      await wait(800);
      let err = null;
      try { exec(st, d); } catch (e) { err = e; }
      const lc = meta(d).lastCall;
      if (!lc || (err && !lc.ctx)) { bubble(mysqlError(err.message, st)); await wait(3000); break; }
      const card = row.querySelector(`[data-proc="${lc.name.toLowerCase()}"]`);
      showVars(lc.args);
      let lastLine = null;
      for (const [i, tr] of lc.ctx.trace.entries()) {
        card?.querySelectorAll('.pl.on').forEach((e) => e.classList.remove('on'));
        lastLine = card?.querySelector(`[data-id="${tr.id}"]`);
        lastLine?.classList.add('on');
        if (tr.scope) showVars(tr.scope);
        setM('stmts', ++stmts);
        if (tr.changed) setM('changed', (changed += tr.changed));
        if (tr.result) { setM('results', ++results); await showResult(tr.result); }
        await wait(620 * pace(i));
      }
      if (err) {
        lastLine?.classList.replace('on', 'err');
        bubble(mysqlError(err.message, st));
        caption('Error raised', 'The procedure stopped here and the error went back to the caller.');
        await wait(3200);
        break;
      }
      card?.querySelectorAll('.pl.on').forEach((e) => e.classList.remove('on'));
      caption('✓ CALL finished');
      await wait(900);
      continue;
    }
    caption(st.replace(/\s+/g, ' ').slice(0, 50));
    await wait(700);
    const drop = st.match(/^DROP\s+PROCEDURE\s+(?:IF\s+EXISTS\s+)?`?(\w+)/i);
    let r;
    try { r = exec(st, d); } catch (e) { bubble(mysqlError(e.message, st)); await wait(3000); break; }
    if (drop) { const c = row.querySelector(`[data-proc="${drop[1].toLowerCase()}"]`); c?.classList.add('dropped'); await wait(900); c?.remove(); }
    if (r) { setM('results', ++results); await showResult(r); }
    showVars(Object.fromEntries([...meta(d).vars].map(([k, v]) => ['@' + k, v])));
    await wait(700);
  }
  if (!ui.bubble.textContent) caption('✓ Done'); hl(none);
}

// ---- scene: reading from a view ----
function viewCard(name, sqlText) {
  const el = document.createElement('div');
  el.className = 'slab code view pop';
  el.dataset.view = name.toLowerCase();
  el.style.setProperty('--c', '#e0a03a');
  const body = sqlText.replace(/^[\s\S]*?\bAS\s+(?=SELECT|WITH|\()/i, '').replace(/\s+/g, ' ');
  el.innerHTML = `<div class="slab-title">VIEW ${esc(name)}</div><pre>${esc(body.replace(/ (FROM|JOIN|WHERE|GROUP BY|ORDER BY) /gi, '\n$1 '))}</pre><small>a saved query: no rows are stored, it runs on every read</small>`;
  return el;
}
async function viewSelectScene(s, d, view) {
  metrics([['ret', 'Rows']]);
  legend([['var(--amber)', 'view definition']]);
  const def = d.exec(`SELECT sql FROM sqlite_master WHERE type='view' AND name='${view}'`)[0].values[0][0];
  const r = exec(s.sql, d) || { columns: [], values: [] };
  const t = mkTable('result', r.columns, r.values.map((v, j) => ({ rid: j, vals: v })), { color: 'var(--accent)' });
  board([viewCard(view, def)], t.el);
  caption(`${view} is a view`, 'MySQL swaps in the stored query, then applies yours on top.'); hl(() => true);
  await wait(1600);
  await enter(t);
  setM('ret', r.values.length);
  caption(`✓ ${r.values.length} rows in set`); hl(none);
}

// ---- scene: SHOW / DESCRIBE, and challenge previews ----
async function resultScene(s, d) {
  const r = exec(s.sql, d);
  if (r?.columns[1] === 'Create Table') {
    metrics([]); legend([]);
    const pre = document.createElement('div');
    pre.className = 'slab code pop';
    pre.style.setProperty('--c', '#5c8fd9');
    pre.innerHTML = `<div class="slab-title">SHOW CREATE TABLE</div><pre>${esc(r.values[0][1])}</pre>`;
    board([schemaCard(r.values[0][1], '#9a7cd6'), pre]);
    caption('SHOW CREATE TABLE', 'prints the exact DDL MySQL would use to rebuild this table, with every key and constraint named.'); hl(() => true);
    return;
  }
  metrics([['ret', 'Rows']]);
  legend([]);
  const t = mkTable('result', r.columns, r.values.map((v, i) => ({ rid: i, vals: v })), { color: 'var(--accent)' });
  board([t.el]);
  caption(s.sql.trim().split(/\s+/).slice(0, 2).join(' ').replace(';', ''), 'asks MySQL about the database itself.'); hl(() => true);
  await enter(t);
  setM('ret', r.values.length);
  caption('✓ ' + r.values.length + ' rows in set'); hl(none);
}
async function dataScene(s, d) {
  const names = [...new Set([...s.expect.matchAll(/(?:FROM|JOIN|INTO|UPDATE|REFERENCES|ON)\s+(\w+)/gi)].map((m) => m[1].toLowerCase()))].filter((n) => exists(d, n));
  metrics([]); legend([]);
  const tabs = names.map((n, i) => { const big = d.exec(`SELECT COUNT(*) FROM ${n}`)[0].values[0][0]; const r = read(d, n, big > 30 ? 10 : 0); return mkTable(big > 30 ? `${n} (first 10 of ${big.toLocaleString('en-US')})` : n, r.cols, r.rows, { color: PALETTE[i], keys: keysOf(d, n) }); });
  board(tabs.map((t) => t.el));
  caption('Your data', 'Switch to the Editor tab to write your answer.');
  await enter(...tabs);
}
async function conceptScene(s) {
  metrics([]); legend([]); caption('');
  ui.inner.innerHTML = `<div class="concept-stage">${s.viz || ''}</div>`;
}

const BIG = 200; // tables bigger than this are shown as plans, not row by row
function sceneFor(s, d) {
  if (!s.sql) return conceptScene;
  if (s.expect) return dataScene;
  if (/^\s*(CREATE\s+(?:DEFINER\S*\s+)?PROCEDURE|CALL\s|DELIMITER|DROP\s+PROCEDURE|SET\s+@)/im.test(s.sql)) return procScene;
  if (s.as || /^\s*(CREATE\s+USER|DROP\s+USER|GRANT|REVOKE|SHOW\s+GRANTS)\b/im.test(s.sql)) return privScene;
  if (s.scene === 'catalog' || /^\s*((CREATE|DROP)\s+(DATABASE|SCHEMA)|USE\s|SHOW\s+DATABASES)/im.test(s.sql)) return catalogScene;
  if (s.scene === 'plan' || /^\s*(EXPLAIN|CREATE\s+(UNIQUE\s+)?INDEX|DROP\s+INDEX|ANALYZE\s)/im.test(s.sql)) return planScene;
  if (/\bOVER\s*\(/i.test(s.sql) && !/^\s*(INSERT|UPDATE|DELETE|CREATE)/i.test(s.sql)) return windowScene;
  if (/\b(UNION|INTERSECT|EXCEPT)\b/i.test(s.sql) && /^\s*\(?\s*SELECT/i.test(s.sql)) return setScene;
  if (/^\s*(INSERT|UPDATE|DELETE|START|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|CREATE|ALTER|DROP|TRUNCATE)\b/im.test(s.sql)) return writeScene;
  if (splitStatements(s.sql).length > 1) return writeScene; // a script of several statements: play them one by one
  if (/^\s*(SHOW|DESC)/i.test(s.sql)) return resultScene;
  const p = parseSelect(s.sql);
  if (p.table && d.exec(`SELECT 1 FROM sqlite_master WHERE type='view' AND name='${p.table}'`)[0]) return (s2, d2) => viewSelectScene(s2, d2, p.table);
  if (p.table && exists(d, p.table) && d.exec(`SELECT COUNT(*) FROM ${p.table}`)[0].values[0][0] > BIG) return planScene;
  if (/\bJOIN\b/i.test(p.from || '')) return joinScene;
  if (p.group || p.agg) return groupScene;
  return selectScene;
}

export function stop() { animId++; }

export async function play(stage, s0, setup, custom = false) {
  // `name` → name for plain identifiers: the scenes' query parsing works on bare names
  const s = s0.sql ? { ...s0, sql: s0.sql.replace(/`(\w+)`/g, '$1') } : s0;
  ui = stage;
  animId++;
  setPaused(false);
  bubble(null);
  ui.inner.innerHTML = '';
  if (s.sql && !s.expect) renderQuery(s.sql);
  // scenes run on their own copy (of the shop, or of your imported data), so they're repeatable and never touch your data
  const d = custom ? openDataset() : freshDb(setup);
  try {
    if (s.pre) exec(s.pre, d);
    await sceneFor(s, d)(s, d);
  } catch (e) {
    if (e instanceof Cancel) return;
    console.error(e);
    // a query too unusual to animate step by step: still show what it returns
    try {
      const r = exec(s.sql, custom ? openDataset() : freshDb(setup));
      metrics([['ret', 'Rows']]); legend([]); bubble(null);
      const t = mkTable('result', r?.columns || [], (r?.values || []).slice(0, 50).map((v, i) => ({ rid: i, vals: v })), { color: 'var(--accent)' });
      board([t.el]);
      caption('Result', 'This query is too unusual to animate step by step, so here is what it returns.');
      await enter(t);
      setM('ret', r?.values.length ?? 0);
    } catch (e2) {
      if (!(e2 instanceof Cancel)) { caption('Error'); bubble(mysqlError(e2.message, s.sql)); }
    }
  } finally { d.close(); }
}
