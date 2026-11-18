import { useEffect, useRef } from 'react';

export default function Stepper({ steps, current, onGo }) {
  const ol = useRef(null);
  // keep the current step centred without scrolling the page itself
  useEffect(() => {
    const li = ol.current?.children[current];
    if (li) ol.current.scrollLeft = li.offsetLeft - ol.current.offsetLeft - ol.current.clientWidth / 2 + li.clientWidth / 2;
  }, [current, steps]);
  return (
    <div className="stepper-card">
      <div className="stepper-head"><b>IN THIS LESSON</b><span>Step {current + 1} of {steps.length}</span></div>
      <ol className="stepper" ref={ol}>
        {steps.map((s, i) => (
          <li key={i} className={[s.expect && 'challenge', i === current && 'current', i < current && 'seen'].filter(Boolean).join(' ')}>
            <button onClick={() => onGo(i)} aria-label={`Step ${i + 1}: ${s.title}`} aria-current={i === current ? 'step' : undefined}>{i + 1}</button>
            <span>{s.short || s.title}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
