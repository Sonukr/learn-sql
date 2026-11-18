import { useEffect, useRef, useState } from 'react';
import { MODULES } from './lessons';
import { freshDb } from './lib/sql';
import CourseTree, { Cats } from './components/CourseTree';
import Stage from './components/Stage';
import Stepper from './components/Stepper';
import StepPanel from './components/StepPanel';
import SearchBox from './components/SearchBox';

export const LESSONS = MODULES.flatMap((m, mi) => m.lessons.map((l, li) => ({ ...l, mod: m, modNo: mi + 1, no: li + 1 })));
export const pad = (n) => String(n).padStart(2, '0');

// localStorage can throw (private mode, blocked storage); progress is a convenience, so fail quietly.
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => setHash(location.hash);
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return hash;
}
const go = (id, n) => { location.hash = `#/${id}/${n}`; };

export default function App() {
  const m = useHash().match(/^#\/([\w-]+)\/(\d+)/);
  const lesson = (m && LESSONS.find((l) => l.id === m[1])) || LESSONS[0];
  const step = Math.max(0, Math.min((m ? +m[2] : 1) - 1, lesson.steps.length - 1));
  const s = lesson.steps[step];
  const stepKey = `${lesson.id}/${step}`;
  const idx = LESSONS.indexOf(lesson);

  const [done, setDone] = useState(() => store.get('done', []));
  const [drawer, setDrawer] = useState(false);
  const [theme, setTheme] = useState(() => store.get('theme', null));
  const [modeState, setModeState] = useState({ k: '', m: '' });
  const mode = modeState.k === stepKey ? modeState.m : s.expect ? 'editor' : 'visual';
  const setMode = (mm) => setModeState({ k: stepKey, m: mm });

  // The learner's own practice database: rebuilt whenever a new lesson opens.
  const dbRef = useRef(null), dbLesson = useRef(null);
  const [dbVer, setDbVer] = useState(0);
  if (dbLesson.current !== lesson.id) { dbRef.current?.close(); dbRef.current = freshDb(lesson.setup); dbLesson.current = lesson.id; }
  const resetDb = () => { dbRef.current.close(); dbRef.current = freshDb(lesson.setup); setDbVer((v) => v + 1); };

  const markDone = (id = lesson.id) => setDone((d) => {
    if (d.includes(id)) return d;
    const n = [...d, id];
    store.set('done', n);
    return n;
  });
  // reaching the last step of a lesson completes it (a challenge completes it when solved)
  useEffect(() => { if (step === lesson.steps.length - 1 && !s.expect) markDone(); }, [stepKey]);
  useEffect(() => { document.title = `${lesson.title} · Lean SQL`; setDrawer(false); }, [stepKey]);
  useEffect(() => { if (theme) document.documentElement.dataset.theme = theme; }, [theme]);

  const next = () => {
    if (step < lesson.steps.length - 1) return go(lesson.id, step + 2);
    if (LESSONS[idx + 1]) go(LESSONS[idx + 1].id, 1);
  };
  const back = () => {
    if (step > 0) return go(lesson.id, step);
    const pl = LESSONS[idx - 1];
    if (pl) go(pl.id, pl.steps.length);
  };
  const toggleTheme = () => {
    const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const t = dark ? 'light' : 'dark';
    setTheme(t); store.set('theme', t);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('textarea, input')) return;
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') back();
      if (e.key === 'Escape') setDrawer(false);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const nextLesson = LESSONS[idx + 1];
  const nextLabel = step < lesson.steps.length - 1
    ? `Next: ${lesson.steps[step + 1].short || lesson.steps[step + 1].title}`
    : nextLesson ? `Next lesson: ${nextLesson.title}` : 'Finish ✓';

  return (
    <>
      <header className="top">
        <button className="icon-btn menu" aria-label="Open course outline" aria-expanded={drawer} onClick={() => setDrawer(!drawer)}>☰</button>
        <a className="logo" href="#/"><span className="logo-mark" aria-hidden="true">⛁</span> Learn SQL</a>
        <span className="spacer" />
        <SearchBox />
        <span className="spacer" />
        <button className="icon-btn" aria-label="Toggle dark mode" onClick={toggleTheme}>◐</button>
      </header>

      <div className="shell">
        <CourseTree lessons={LESSONS} lesson={lesson} done={done} open={drawer} />
        <div className={`scrim ${drawer ? 'open' : ''}`} onClick={() => setDrawer(false)} />

        <main className="card lesson">
          <div className="lesson-head">
            <div>
              <div className="crumb">{pad(lesson.modNo)}. {lesson.mod.title} <Cats cats={lesson.mod.cats} /> <span className="mtag">{lesson.mod.tag}</span>  /  Lesson {lesson.no} of {lesson.mod.lessons.length}</div>
              <h1>{lesson.title}</h1>
              <p className="summary">{lesson.summary}</p>
            </div>
            <div className="badges">
              <span className="badge time">◷ {lesson.minutes} min</span>
              <span className="badge level">▮▮ {lesson.level}</span>
              <span className="badge steps">☰ {lesson.steps.length} steps</span>
            </div>
          </div>
          <Stage step={s} stepKey={stepKey} setup={lesson.setup} mode={mode} setMode={setMode}
            db={dbRef.current} dbVer={dbVer} onResetDb={resetDb} onSolved={() => markDone()} />
          <Stepper steps={lesson.steps} current={step} onGo={(i) => go(lesson.id, i + 1)} />
        </main>

        <aside className="side">
          <StepPanel step={s} index={step} total={lesson.steps.length} onBack={back} onNext={next}
            backDisabled={step === 0 && idx === 0} nextLabel={nextLabel} />
          <section className="card learn-card">
            <h3>YOU'LL LEARN</h3>
            <ul>{lesson.learn.map((x, i) => <li key={i} dangerouslySetInnerHTML={{ __html: x }} />)}</ul>
          </section>
          <p className="engine-note">Queries run in your browser on SQLite (via sql.js). Everything taught here is standard MySQL syntax; real differences are called out.</p>
        </aside>
      </div>
    </>
  );
}
