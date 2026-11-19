import { useEffect, useRef, useState } from 'react';
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
  const page = lesson ? `${lesson.title} · step ${step + 1}` : location.hash.startsWith('#/my-data') ? 'My Data' : 'Course';
  useEffect(() => { if (open) track('chat_open'); }, [open]);

  return (
    <>
      <button className={`chat-fab${open ? ' open' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="chat-panel"
        aria-label={open ? 'Close the tutor' : 'Ask the SQL tutor'}>{open ? '×' : '💬'}</button>
      {open && (
        <section className="chat-panel" id="chat-panel" role="dialog" aria-label="SQL tutor">
          <header className="chat-head">
            <b>✦ Tutor</b>
            <small>{page}</small>
          </header>
          <Tutor lessons={lessons} lesson={lesson} step={step} done={done} />
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

