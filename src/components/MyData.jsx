import { useEffect, useRef, useState } from 'react';
import { importFiles, importSql, clearDataset, openDataset } from '../lib/importer';
import Stage from './Stage';

const fmt = (n) => Number(n).toLocaleString('en-US');
const quoteId = (n) => (/^[a-z_]\w*$/i.test(n) ? n : `\`${n}\``); // backticks only when the name needs them

// "My Data": a section of its own, apart from the course. Import a dump/CSV, then explore it with the same animations.
export default function MyData({ tab, ds }) {
  return tab === 'explore' && ds ? <Explore ds={ds} /> : <Import ds={ds} tab={tab} />;
}

function Header({ tab, ds, title, summary }) {
  return (
    <div className="lesson-head">
      <div>
        <div className="crumb">My Data <span className="cat c-ddl">YOUR DATABASE</span> / {tab === 'explore' ? 'Explore' : 'Import'}</div>
        <h1>{title}</h1>
        <p className="summary">{summary}</p>
      </div>
      <div className="seg md-tabs" role="tablist" aria-label="My Data">
        <a role="tab" aria-selected={tab !== 'explore'} href="#/my-data/import">⇪ Import</a>
        <a role="tab" aria-selected={tab === 'explore'} href="#/my-data/explore" aria-disabled={!ds} onClick={(e) => { if (!ds) e.preventDefault(); }}>◉ Explore</a>
      </div>
    </div>
  );
}

function Tables({ ds, onPick }) {
  return (
    <section className="card learn-card md-tables">
      <h3>YOUR TABLES · {ds.name}</h3>
      {ds.tables.map((t) => (
        <details key={t.name}>
          <summary>
            <span className={`chip ${t.type === 'view' ? 'pk' : 'uq'}`}>{t.type === 'view' ? 'view' : 'table'}</span>
            <b>{t.name}</b><small>{fmt(t.rows)} rows · {t.columns.length} cols</small>
          </summary>
          <ul>{t.columns.map((c) => <li key={c.name}><span>{c.name}</span><code>{c.type || '—'}</code></li>)}</ul>
          {onPick && <button className="btn" onClick={() => onPick(t)}>◉ Visualise SELECT</button>}
        </details>
      ))}
    </section>
  );
}

function Import({ ds, tab }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [over, setOver] = useState(false);
  const [paste, setPaste] = useState('');
  const file = useRef(null);

  const run = async (job) => {
    setBusy(true); setError(null);
    await new Promise((r) => setTimeout(r, 30)); // let the "Importing…" state paint before the heavy work
    try { await job(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const onFiles = (files) => files.length && run(() => importFiles([...files]));

  return (
    <>
      <main className="card lesson">
        <Header tab={tab} ds={ds} title="Use your own data"
          summary="Load a MySQL dump or CSV files and explore them with the same animations as the course. Everything stays in this browser." />
        <section className="md-main">
          <div className={`dropzone${over ? ' over' : ''}${busy ? ' busy' : ''}`} role="button" tabIndex={0}
            onClick={() => file.current.click()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.current.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}>
            <div className="dz-ic" aria-hidden="true">⛁</div>
            <b>{busy ? 'Importing…' : 'Drop a MySQL dump (.sql) or CSV files here'}</b>
            <small>or click to choose files · several CSVs become several tables · up to 50 MB</small>
            <input ref={file} type="file" multiple accept=".sql,.csv,.tsv,.txt" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          </div>

          <details className="paste">
            <summary>…or paste SQL (CREATE TABLE + INSERT statements)</summary>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} spellCheck={false}
              placeholder={"CREATE TABLE books (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(100), year INT);\nINSERT INTO books (title, year) VALUES ('Dune', 1965), ('Neuromancer', 1984);"} />
            <button className="btn primary" disabled={!paste.trim() || busy} onClick={() => run(() => importSql(paste, 'pasted'))}>⇪ Import SQL</button>
          </details>

          {error && <div className="err" role="alert">{error}</div>}

          {ds && !busy && (
            <div className="md-result">
              <div className="md-result-head">
                <b>✓ {ds.name}</b>
                <span>{ds.tables.length} table{ds.tables.length === 1 ? '' : 's'} · {fmt(ds.tables.reduce((n, t) => n + t.rows, 0))} rows{ds.ms != null && ` · imported in ${(ds.ms / 1000).toFixed(2)} s`}</span>
              </div>
              {ds.warnings?.length > 0 && (
                <details className="md-warn">
                  <summary>{ds.failed ? `${ds.failed} statement${ds.failed === 1 ? '' : 's'} skipped` : `${ds.warnings.length} note${ds.warnings.length === 1 ? '' : 's'}`}: see why</summary>
                  <ul>{ds.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </details>
              )}
              <div className="run-row">
                <a className="btn primary" href="#/my-data/explore">◉ Explore your data →</a>
                <button className="btn" onClick={() => { if (confirm(`Remove "${ds.name}" from this browser?`)) clearDataset(); }}>🗑 Remove data</button>
              </div>
            </div>
          )}

          <div className="md-howto">
            <h3>Getting a dump from MySQL</h3>
            <p>From a terminal (works for local and remote servers):</p>
            <pre>mysqldump -u USER -p --no-tablespaces DATABASE &gt; my_db.sql</pre>
            <p>Add <code>-h HOST -P 3306</code> for a remote server. In <b>MySQL Workbench</b>: Server → Data Export → "Export to Self-Contained File". In <b>phpMyAdmin</b>: Export → SQL.</p>
            <p>CSV files become one table each, named after the file. Column types (INT, DECIMAL, DATE, VARCHAR…) are guessed from the values.</p>
          </div>
        </section>
      </main>
      <aside className="side">
        {ds ? <Tables ds={ds} /> : (
          <section className="card learn-card">
            <h3>HOW IT WORKS</h3>
            <ul>
              <li>Your file is read <b>in this browser</b>: nothing is uploaded</li>
              <li>It's loaded into its own database, separate from the course’s shop</li>
              <li>It's kept here across reloads until you remove it</li>
              <li>The <b>Explore</b> tab animates any query you write on it</li>
            </ul>
          </section>
        )}
        <p className="engine-note">Triggers, stored functions and FULLTEXT indexes in a dump are skipped. Tables, views, keys, indexes, constraints and procedures load.</p>
      </aside>
    </>
  );
}

function Explore({ ds }) {
  const first = ds.tables.find((t) => t.type === 'table') || ds.tables[0];
  const [viz, setViz] = useState({ sql: `SELECT * FROM ${quoteId(first.name)}\nLIMIT 10;`, tick: 0 });
  const [modeState, setModeState] = useState('visual');
  const dbRef = useRef(null);
  const [dbVer, setDbVer] = useState(0);
  // (re)open when the dataset changes
  if (!dbRef.current || dbRef.current.__ds !== ds) { dbRef.current?.close(); dbRef.current = openDataset(); dbRef.current.__ds = ds; }
  // close on leave; set to null so a remount (React StrictMode in dev) opens a fresh one instead of reusing a closed db
  useEffect(() => () => { dbRef.current?.close(); dbRef.current = null; }, []);
  const resetDb = () => { dbRef.current.close(); dbRef.current = openDataset(); dbRef.current.__ds = ds; setDbVer((v) => v + 1); };
  const visualise = (sql) => { setViz((v) => ({ sql, tick: v.tick + 1 })); setModeState('visual'); };
  const step = { title: 'Your query', sql: viz.sql, body: '' };

  return (
    <>
      <main className="card lesson">
        <Header tab="explore" ds={ds} title={`Explore ${ds.name}`}
          summary="Write any query in the Editor and press Visualise to watch it run on your tables. Run changes freely: Reset data restores your import." />
        <Stage step={step} stepKey={`mydata-${viz.tick}`} custom mode={modeState} setMode={setModeState}
          db={dbRef.current} dbVer={dbVer} onResetDb={resetDb} onSolved={() => {}} onVisualise={visualise} />
      </main>
      <aside className="side">
        <Tables ds={ds} onPick={(t) => visualise(`SELECT * FROM ${quoteId(t.name)}\nLIMIT 10;`)} />
        <p className="engine-note">Tip: big tables (over 200 rows) are shown as query plans, the way the Performance module does, so try EXPLAIN and indexes on your own data too.</p>
      </aside>
    </>
  );
}
