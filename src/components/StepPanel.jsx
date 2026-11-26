import { Lightbulb, ArrowLeft, ArrowRight } from 'lucide-react';
export default function StepPanel({ step, index, total, onBack, onNext, backDisabled, nextLabel }) {
  const tag = step.expect ? 'challenge' : step.sql ? 'try' : 'concept';
  return (
    <section className="card step-card">
      <div className="step-head">
        <span>STEP {index + 1} / {total}</span>
        <span className={`tag ${tag}`}>{{ concept: 'CONCEPT', try: 'TRY IT', challenge: 'CHALLENGE' }[tag]}</span>
      </div>
      <h2>{step.title}</h2>
      {/* lesson bodies are our own static HTML */}
      <div className="step-body" dangerouslySetInnerHTML={{ __html: step.body }} />
      {step.key && (
        <div className="key"><span className="key-ic"><Lightbulb /></span><div><b>KEY IDEA</b><span dangerouslySetInnerHTML={{ __html: step.key }} /></div></div>
      )}
      <div className="step-foot">
        <div className="nav-row">
          <button className="btn" onClick={onBack} disabled={backDisabled}><ArrowLeft /> Back</button>
          <button className="btn primary" onClick={onNext}>{nextLabel} <ArrowRight /></button>
        </div>
        <p className="hint"><kbd>←</kbd> <kbd>→</kbd> step · <kbd>R</kbd> replay · <kbd>Space</kbd> pause</p>
      </div>
    </section>
  );
}
