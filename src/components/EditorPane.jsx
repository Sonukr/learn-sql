import { useEffect, useRef, useState } from 'react';
import { attempt, exec, READ_ONLY, fmt, tableCounts, txOpen } from '../lib/sql';
import { meta } from '../lib/admin';
import { queryRun } from '../lib/analytics';

const MAX = 200; // rendering 50,000 rows would freeze the page

function ResultView({ out }) {
  if (!out) return null;
  if (out.error) return <div className="err">{out.error}</div>;
  if (out.message) return <div className="ok-msg">{out.message}</div>;
  const r = out.result;
  if (!r) return <div className="ok-msg">Query OK, {out.changed} row(s) affected{out.ms != null && ` (${(out.ms / 1000).toFixed(3)} sec)`}</div>;
  return (
    <>
      <table>
        <thead><tr>{r.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
        <tbody>
          {r.values.slice(0, MAX).map((row, i) => (
            <tr key={i} style={{ animationDelay: `${Math.min(i * 40, 600)}ms` }}>
              {row.map((v, j) => v === null
                ? <td key={j} className="null">NULL</td>
                : <td key={j} className={typeof v === 'number' ? 'num' : ''}>{fmt(v)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="meta">
        {r.values.length.toLocaleString('en-US')} row{r.values.length === 1 ? '' : 's'} in set{out.ms != null && ` (${(out.ms / 1000).toFixed(3)} sec)`}
        {r.values.length > MAX && ` · showing the first ${MAX}`}
      </div>
    </>
  );
}

export default function EditorPane({ step, stepKey, db, onResetDb, onSolved, onVisualise }) {
  const [sql, setSql] = useState(step.sql);
  const [out, setOut] = useState(null);
  const [asUser, setAsUser] = useState(step.as || '');
  const users = [...meta(db).users.keys()];
  const ta = useRef(null);

  const run = () => {
    meta(db).as = asUser || null; // privileges are checked as this user
    let o;
    try { o = attempt(db, step, sql); } finally { meta(db).as = null; }
    setOut(o);
    const [lid, sidx] = (stepKey || 'my-data/0').split('/');
    queryRun(lid, +sidx || 0, { ok: o.verdict ? o.verdict.ok : !o.error, challenge: !!step.expect, error: o.error, sql });
    if (o.verdict?.ok) onSolved();
  };
  // read-only demos show their result straight away; writes wait for Run
  useEffect(() => {
    // a step's setup (`pre`) runs once on your practice database too, so the step works in the editor
    const done = meta(db).preDone;
    if (step.pre && !done.includes(stepKey)) { done.push(stepKey); try { exec(step.pre, db); } catch { /* already set up */ } }
    if (!step.expect && READ_ONLY.test(step.sql)) run();
    ta.current?.focus();
  }, []);

  const peek = (name) => {
    try { setOut({ result: db.exec(`SELECT * FROM "${name}"`)[0] || null }); }
    catch (e) { setOut({ error: e.message }); }
  };

  return (
    <div className="editor">
      <div className="tables">
        tables:
        {tableCounts(db).map(([n, c]) => <button key={n} onClick={() => peek(n)} title={`Peek at ${n}`}>{n} ({c})</button>)}
        {meta(db).use !== 'shop' && <span className="tx">● USE {meta(db).use}</span>}
        {txOpen(db) && <span className="tx">● transaction open (uncommitted)</span>}
      </div>
      <label className="sr-only" htmlFor="editor">SQL editor</label>
      <textarea id="editor" ref={ta} spellCheck={false} autoComplete="off" value={sql}
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); } }} />
      <div className="run-row">
        <button className="btn primary" onClick={run}>▶ Run <kbd>Ctrl ↵</kbd></button>
        {onVisualise && <button className="btn" onClick={() => onVisualise(sql)} title="Animate this query">◉ Visualise</button>}
        {!onVisualise && <button className="btn" onClick={() => setSql(step.sql)} title="Restore this step's query">↺ Restore query</button>}
        <button className="btn" onClick={onResetDb} title="Rebuild the practice database">⟲ Reset data</button>
        {users.length > 0 && (
          <label className="run-as">Run as
            <select value={asUser} onChange={(e) => setAsUser(e.target.value)}>
              <option value="">root@localhost</option>
              {users.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
        )}
        {out?.verdict && <span className={`check ${out.verdict.ok ? 'ok' : 'no'}`} role="status">{out.verdict.msg}</span>}
      </div>
      <div className="result" aria-live="polite"><ResultView out={out} /></div>
    </div>
  );
}
