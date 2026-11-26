import { useEffect, useRef, useState } from 'react';
import { Eye, Code, RotateCw, Play, Pause, FileCode } from 'lucide-react';
import { play, stop, setPaused } from '../lib/scenes';
import EditorPane from './EditorPane';

// The stage React renders once; lib/scenes animates rows inside these elements.
export default function Stage({ step, stepKey, setup, custom, onVisualise, mode, setMode, db, dbVer, onResetDb, onSolved }) {
  const refs = { scene: useRef(), inner: useRef(), metrics: useRef(), legend: useRef(), caption: useRef(), bubble: useRef(), qcode: useRef() };
  const [paused, setP] = useState(false);
  const [tick, setTick] = useState(0);
  const visual = mode === 'visual';

  useEffect(() => {
    if (!visual) return;
    const ui = Object.fromEntries(Object.entries(refs).map(([k, r]) => [k, r.current]));
    play({ ...ui, onPause: setP }, step, setup, custom);
    return stop;
  }, [stepKey, visual, tick]);

  useEffect(() => {
    if (!visual) return;
    const onKey = (e) => {
      if (e.target.closest('textarea, input, button, summary, a, [contenteditable]')) return;
      if (e.key === 'r' || e.key === 'R') setTick((t) => t + 1);
      if (e.key === ' ') { e.preventDefault(); setPaused(!paused); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [visual, paused]);

  return (
    <section className="stage">
      <div className="stage-top">
        <div className="metrics" ref={refs.metrics} hidden={!visual} />
        <div className="controls">
          <div className="seg" role="tablist" aria-label="Stage mode">
            <button role="tab" aria-selected={visual} onClick={() => setMode('visual')}><Eye /> Visual</button>
            <button role="tab" aria-selected={!visual} onClick={() => setMode('editor')} disabled={!step.sql}><Code /> Editor</button>
          </div>
          {visual && <>
            <button className="btn" onClick={() => setTick((t) => t + 1)} title="Replay (R)" aria-label="Replay"><RotateCw /><span className="lbl">Replay</span></button>
            <button className="btn" onClick={() => setPaused(!paused)} title="Pause (Space)" aria-label={paused ? 'Play' : 'Pause'}>{paused ? <Play /> : <Pause />}<span className="lbl">{paused ? 'Play' : 'Pause'}</span></button>
          </>}
        </div>
      </div>

      <div className="scene" ref={refs.scene} hidden={!visual}>
        <div className="caption" ref={refs.caption} aria-live="polite" />
        <div className="bubble" ref={refs.bubble} hidden />
        <div className="scene-inner" ref={refs.inner} />
      </div>

      <div className="stage-foot" hidden={!visual}>
        <div className="legend" ref={refs.legend} />
        <div className="qcard" hidden={!step.sql || !!step.expect}>
          <div className="qhead"><span><FileCode /> THE QUERY</span><button onClick={() => setMode('editor')}>Edit &amp; run <Code /></button></div>
          <pre ref={refs.qcode} />
        </div>
      </div>

      {!visual && step.sql && (
        <EditorPane key={`${stepKey}#${dbVer}`} stepKey={stepKey} step={step} db={db} onVisualise={onVisualise} onResetDb={onResetDb} onSolved={onSolved} />
      )}
    </section>
  );
}
