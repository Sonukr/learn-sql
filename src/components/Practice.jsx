import { useEffect, useRef, useState } from 'react';
import { Check, ArrowLeft, ArrowRight } from 'lucide-react';
import { freshDb } from '../lib/sql';
import { QUESTIONS, TOPICS, PRACTICE_SETUP } from '../practice';
import EditorPane from './EditorPane';

const KEY = 'practice-done';
const loadDone = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };

// #/practice = the question list; #/practice/q7 = one question with an editor that checks your answer.
export default function Practice({ id }) {
  const [done, setDone] = useState(loadDone);
  const solve = (qid) => setDone((d) => {
    if (d.includes(qid)) return d;
    const n = [...d, qid];
    try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* storage blocked */ }
    return n;
  });
  const q = QUESTIONS.find((x) => x.id === id);
  return q ? <Question key={q.id} q={q} done={done} onSolved={() => solve(q.id)} /> : <List done={done} />;
}

function Head({ title, summary, children }) {
  return (
    <div className="lesson-head">
      <div>
        <div className="crumb"><a href="#/practice">Practice</a>{children}</div>
        <h1>{title}</h1>
        <p className="summary">{summary}</p>
      </div>
    </div>
  );
}

function List({ done }) {
  const [text, setText] = useState('');
  const [topic, setTopic] = useState('');
  const t = text.trim().toLowerCase();
  const shown = QUESTIONS.filter((q) => (!topic || q.topic === topic) && (!t || q.title.toLowerCase().includes(t)));
  return (
    <main className="card practice">
      <Head title="Practice: SQL interview questions" summary={`${QUESTIONS.length} questions asked in data engineer and SQL developer interviews. Each one runs on a practice database and checks your answer. ${done.length} solved.`} />
      <div className="pr-tools">
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter questions…" aria-label="Filter questions" />
        <div className="pr-topics" role="group" aria-label="Topic">
          {['', ...TOPICS].map((x) => <button key={x || 'all'} aria-pressed={topic === x} onClick={() => setTopic(x)}>{x || 'All'}</button>)}
        </div>
      </div>
      <ol className="pr-list">
        {shown.map((q) => (
          <li key={q.id}>
            <a href={`#/practice/${q.id}`}>
              <span className={`file ${done.includes(q.id) ? 'done' : ''}`}>{done.includes(q.id) && <Check />}</span>
              <b>{q.no}.</b> {q.title}
              <span className="chip">{q.topic}</span>
            </a>
          </li>
        ))}
        {!shown.length && <li className="chat-hint">No questions match.</li>}
      </ol>
    </main>
  );
}

function Question({ q, done, onSolved }) {
  const db = useRef(null);
  const [ver, setVer] = useState(0);
  if (!db.current) db.current = freshDb(PRACTICE_SETUP);
  useEffect(() => {
    if (!db.current) { db.current = freshDb(PRACTICE_SETUP); setVer((v) => v + 1); } // remounted (React dev mode): rebuild
    return () => { db.current?.close(); db.current = null; };
  }, []);
  const reset = () => { db.current?.close(); db.current = freshDb(PRACTICE_SETUP); setVer((v) => v + 1); };
  const [solution, setSolution] = useState(false);
  const prev = QUESTIONS[q.no - 2], next = QUESTIONS[q.no];
  return (
    <main className="card practice">
      <Head title={`${q.no}. ${q.title}`} summary={done.includes(q.id) ? 'Solved. Try another way, or move on.' : 'Write a query, press Run, and it’s checked against a model answer.'}>
        {' / '}<span className="chip">{q.topic}</span>
      </Head>
      <div className="step-body" dangerouslySetInnerHTML={{ __html: q.body }} />
      <EditorPane key={ver} step={q} stepKey={`practice/${q.no - 1}`} db={db.current} onResetDb={reset} onSolved={onSolved} />
      <div className="pr-actions">
        <button className="btn" onClick={() => setSolution(!solution)} aria-expanded={solution}>{solution ? 'Hide solution' : 'Show solution'}</button>
        <a className="btn" href={`#/${q.learn}/1`}>Learn this</a>
        <span className="spacer" />
        {prev && <a className="btn" href={`#/practice/${prev.id}`}><ArrowLeft /> {prev.no}</a>}
        <a className="btn" href="#/practice">All questions</a>
        {next && <a className="btn primary" href={`#/practice/${next.id}`}>{next.no} <ArrowRight /></a>}
      </div>
      {solution && <pre className="pr-solution">{q.expect.replace(/ (FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT|UNION ALL|UNION|INTERSECT|EXCEPT|JOIN|LEFT JOIN|SELECT)\b/g, '\n$1')}</pre>}
    </main>
  );
}
