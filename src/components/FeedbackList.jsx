import { useEffect, useState } from 'react';

// Read-only view of everything sent through the Feedback tab (#/feedback). No edit or delete, by design.
export default function FeedbackList() {
  const [state, setState] = useState({ list: null, error: null });
  useEffect(() => {
    fetch('/api/feedback')
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d.feedback; })
      .then((list) => setState({ list, error: null }), (e) => setState({ list: null, error: e.message }));
  }, []);
  const { list, error } = state;
  const rated = list?.filter((f) => f.rating) || [];
  const avg = rated.length ? (rated.reduce((n, f) => n + f.rating, 0) / rated.length).toFixed(1) : null;

  return (
    <main className="card lesson fb-page">
      <div className="lesson-head">
        <div>
          <div className="crumb">Feedback / All entries</div>
          <h1>Learner feedback</h1>
          <p className="summary">Everything sent from the 💬 Feedback tab, newest first. Entries can't be edited or deleted.</p>
        </div>
        {list && <div className="badges">
          <span className="badge steps">☰ {list.length} entries</span>
          {avg && <span className="badge time">★ {avg} average</span>}
        </div>}
      </div>
      {error && <div className="err" role="alert">{error}</div>}
      {!list && !error && <p className="chat-hint">Loading…</p>}
      {list?.length === 0 && <p className="chat-hint">No feedback yet.</p>}
      <ul className="fb-list">
        {list?.map((f) => (
          <li key={f.id}>
            <div className="fb-meta">
              <b className="fb-name">{f.name || 'Anonymous'}</b>
              <span className="fb-stars" aria-label={f.rating ? `${f.rating} of 5` : 'No rating'}>{f.rating ? '★'.repeat(f.rating) + '☆'.repeat(5 - f.rating) : '—'}</span>
              <span className="chip">{f.category}</span>
              <time dateTime={f.at}>{new Date(f.at).toLocaleString()}</time>
            </div>
            {f.comment && <p>{f.comment}</p>}
            <small>{[f.page, f.lesson && <a key="l" href={`#/${f.lesson}/1`}>{f.lesson}</a>, f.progress].filter(Boolean).reduce((a, x, i) => [...a, i ? ' · ' : '', x], [])}</small>
          </li>
        ))}
      </ul>
    </main>
  );
}
