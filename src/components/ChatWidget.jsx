import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Sparkles, MessageSquareText, Check, Star } from 'lucide-react';
import { recommendations, summary, lastError, track } from '../lib/analytics';

// Tiny, safe markdown: escape everything, then allow ```code```, `code`, **bold** and links into the course (#/…) only.
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function md(text) {
  return esc(text)
    .replace(/```(?:sql|mysql)?\n?([\s\S]*?)```/g, (m, code) => `<pre>${code.trim()}</pre>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]\n]+)\]\((#\/[\w-]+\/\d+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n/g, '<br>');
}

export default function ChatWidget({ lessons, lesson, step, done }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('tutor');
  const page = lesson ? `${lesson.title} · step ${step + 1}` : location.hash.startsWith('#/my-data') ? 'My Data' : 'Course';
  useEffect(() => { if (open) track('chat_open', { tab }); }, [open]);
  useEffect(() => { // Escape closes the panel
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button className={`chat-fab${open ? ' open' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="chat-panel"
        aria-label={open ? 'Close the tutor' : 'Ask the tutor or send feedback'}>{open ? <X /> : <MessageCircle />}</button>
      {open && (
        <section className="chat-panel" id="chat-panel" role="dialog" aria-label="Tutor and feedback">
          <header className="chat-head">
            <div className="seg" role="tablist">
              <button role="tab" aria-selected={tab === 'tutor'} onClick={() => setTab('tutor')}><Sparkles /> Tutor</button>
              <button role="tab" aria-selected={tab === 'feedback'} onClick={() => setTab('feedback')}><MessageSquareText /> Feedback</button>
            </div>
            <small>{page}</small>
            <button className="icon-btn chat-close" onClick={() => setOpen(false)} aria-label="Close" title="Close (Esc)"><X /></button>
          </header>
          {tab === 'tutor'
            ? <Tutor lessons={lessons} lesson={lesson} step={step} done={done} />
            : <Feedback lesson={lesson} page={page} done={done} lessons={lessons} />}
        </section>
      )}
    </>
  );
}

function Tutor({ lessons, lesson, step, done }) {
  const [msgs, setMsgs] = useState([]); // { role: 'user' | 'model', text }
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const list = useRef(null);
  const recs = recommendations(lessons, done, lesson?.id);
  const err = lastError();
  const s = lesson?.steps[step];
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);

  const ask = async (text) => {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...msgs, { role: 'user', text: q }];
    setMsgs(next); setInput(''); setBusy(true); setError(null);
    track('tutor_question', { lesson_id: lesson?.id || 'none' }); // the question text itself is not sent to analytics
    const context = {
      current: lesson ? { lesson_id: lesson.id, lesson: lesson.title, module: lesson.mod.title, step: step + 1, step_title: s?.title, step_sql: s?.sql || s?.expect || null } : { page: 'My Data / course home' },
      last_failed_query: err && lesson && err.lesson === lesson.id ? err : null,
      progress: summary(lessons, done),
      catalog: lessons.map((l) => ({ id: l.id, title: l.title, module: l.mod.title })),
    };
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: next, context }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.reply) throw new Error(data.error || `The tutor is unavailable (HTTP ${res.status}).`);
      setMsgs([...next, { role: 'model', text: data.reply }]);
    } catch (e) {
      setError(e.message);
      setMsgs(msgs); setInput(q); // give the question back so it isn't lost
    } finally { setBusy(false); }
  };

  const chips = [
    s && ['Explain this step', `Explain the step "${s.title}" in simple words, with an example.`],
    err && lesson && err.lesson === lesson.id && ['Why did my query fail?', `My query failed with: ${err.error}. What's wrong and how do I fix it?`],
    ['What should I learn next?', 'Based on my progress, what should I learn next, and why?'],
    s?.expect && ['Hint for the challenge', 'Give me a hint for this challenge without giving away the full answer.'],
  ].filter(Boolean);

  return (
    <>
      <div className="chat-list" ref={list} aria-live="polite">
        {recs.length > 0 && (
          <div className="chat-recs">
            <b>Recommended for you</b>
            {recs.map((r) => <a key={r.id} href={`#/${r.id}/1`}>{r.title}<small>{r.reason}</small></a>)}
          </div>
        )}
        {msgs.length === 0 && <p className="chat-hint">Ask anything about SQL or this step. The tutor knows which lesson you're on and how you're doing.</p>}
        {msgs.map((m, i) => (
          m.role === 'user'
            ? <div key={i} className="msg user">{m.text}</div>
            : <div key={i} className="msg bot" dangerouslySetInnerHTML={{ __html: md(m.text) }} />
        ))}
        {busy && <div className="msg bot typing" aria-label="The tutor is typing"><i /><i /><i /></div>}
        {error && <div className="err" role="alert">{error}</div>}
      </div>
      <div className="chat-chips">{chips.map(([label, q]) => <button key={label} onClick={() => ask(q)} disabled={busy}>{label}</button>)}</div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <label className="sr-only" htmlFor="chat-q">Your question</label>
        <textarea id="chat-q" rows={2} value={input} maxLength={2000} placeholder="Ask about SQL, this step, or what to learn next…"
          onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }} />
        <button className="btn primary" disabled={busy || !input.trim()}>Send</button>
      </form>
      <p className="chat-note">Your question and course progress are sent to Google Gemini to answer it.</p>
    </>
  );
}

function Feedback({ lesson, page, done, lessons }) {
  const [name, setName] = useState(() => { try { return localStorage.getItem('feedback-name') || ''; } catch { return ''; } });
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState('Idea');
  const [comment, setComment] = useState('');
  const [state, setState] = useState({ busy: false, sent: false, error: null });

  const send = async (e) => {
    e.preventDefault();
    setState({ busy: true, sent: false, error: null });
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, rating, category, comment, page, lesson: lesson?.id || '', progress: `${done.length}/${lessons.length} lessons` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Couldn’t send (HTTP ${res.status}).`);
      try { localStorage.setItem('feedback-name', name.trim()); } catch { /* storage blocked */ }
      track('feedback_submit', { rating, category, lesson_id: lesson?.id || 'none' }); // the comment text stays out of analytics
      setState({ busy: false, sent: true, error: null });
      setComment(''); setRating(0);
    } catch (err) { setState({ busy: false, sent: false, error: err.message }); }
  };

  if (state.sent) return (
    <div className="chat-list"><div className="msg bot"><Check /> Thanks! Your feedback was saved. <a href="#/feedback">See all feedback</a></div>
      <button className="btn" onClick={() => setState({ busy: false, sent: false, error: null })}>Send more</button></div>
  );
  return (
    <form className="chat-feedback" onSubmit={send}>
      <fieldset className="stars">
        <legend>How is the course so far?</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} aria-pressed={rating === n} aria-label={`${n} of 5`} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}><Star /></button>
        ))}
      </fieldset>
      <label>Your name <small>(optional, shown on the feedback page)</small>
        <input value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} placeholder="Anonymous" />
      </label>
      <label>Type
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option>Idea</option><option>Bug</option><option>Content</option><option>Other</option>
        </select>
      </label>
      <label>Comment or recommendation
        <textarea rows={5} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder="What would make this better? Anything confusing on this page?" />
      </label>
      {state.error && <div className="err" role="alert">{state.error}</div>}
      <button className="btn primary" disabled={state.busy || (!rating && comment.trim().length < 3)}>{state.busy ? 'Sending…' : 'Send feedback'}</button>
      <p className="chat-note">Sent with the page you're on ({page}). Feedback is public on the <a href="#/feedback">feedback page</a>.</p>
    </form>
  );
}
