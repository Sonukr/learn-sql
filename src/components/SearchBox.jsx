import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { MODULES } from '../lessons';
import { Cats } from './CourseTree';
import { searched } from '../lib/analytics';

const strip = (h = '') => h.replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// One entry per lesson step: what it's called, what it says, and the SQL it runs.
const ENTRIES = MODULES.flatMap((m) => m.lessons.flatMap((l) => l.steps.map((s, i) => ({
  id: l.id, step: i, lesson: l.title, title: s.title, cats: m.cats,
  kind: s.expect ? 'challenge' : s.sql ? 'try it' : 'concept',
  name: `${s.title} ${s.short || ''}`.toLowerCase(),
  head: `${l.title} ${m.title} ${m.tag} ${m.cats.join(' ')} ${i === 0 ? strip(l.learn.join(' ')) : ''}`.toLowerCase(),
  code: `${s.sql || ''} ${s.pre || ''} ${s.expect || ''}`.toLowerCase(),
  text: strip(`${s.body} ${s.key || ''}`),
}))));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function search(q) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const phrase = terms.join(' ');
  return ENTRIES.map((e) => {
    const low = e.text.toLowerCase();
    let score = 0;
    for (const t of terms) {
      // whole word beats a prefix ("DESC" ≠ "DESCRIBE") beats any substring
      const whole = new RegExp(`(^|[^a-z0-9_])${esc(t)}($|[^a-z0-9_])`), prefix = new RegExp(`(^|[^a-z0-9_])${esc(t)}`);
      // short terms (ASC, IN, OR) only match as words: "asc" must not hit "cascade"
      const hit = (str, w) => (whole.test(str) ? w : prefix.test(str) ? w / 2 : t.length > 3 && str.includes(t) ? w / 4 : 0);
      const s = hit(e.name, 12) + hit(e.code, 7) + hit(e.head, 4) + hit(low, 2);
      if (!s) return null; // every word must match somewhere
      score += s;
    }
    if (e.name.includes(phrase)) score += 10;
    if (e.name.startsWith(phrase)) score += 8; // a step titled after the method is the best answer
    if (e.code.includes(phrase)) score += 6;
    if (e.kind === 'concept') score -= 1;
    return { ...e, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 12);
}

// A short excerpt around the first matching word, with every term highlighted.
function snippet(text, terms) {
  const low = text.toLowerCase();
  const at = Math.max(0, Math.min(...terms.map((t) => low.indexOf(t)).filter((i) => i >= 0), text.length) - 40);
  const cut = (at ? '…' : '') + text.slice(at, at + 130) + (at + 130 < text.length ? '…' : '');
  const parts = cut.split(new RegExp(`(${terms.map(esc).join('|')})`, 'gi'));
  return parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p));
}

export default function SearchBox() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  const results = useMemo(() => search(q), [q]);
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);

  useEffect(() => {
    const onKey = (e) => {
      const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault();
        input.current.focus();
        input.current.select();
        setOpen(true);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const go = (r) => {
    searched(q.trim(), results.length);
    location.hash = `#/${r.id}/${r.step + 1}`;
    setOpen(false);
    setQ('');
    input.current.blur();
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && results[sel]) go(results[sel]);
    if (e.key === 'Escape') { setOpen(false); input.current.blur(); }
  };

  return (
    <div className="search" role="search">
      <Search className="search-ic" aria-hidden="true" />
      <input ref={input} type="search" value={q} placeholder="Search methods: JOIN, RANK, GRANT…" aria-label="Search lessons and SQL methods"
        aria-expanded={open && !!q} aria-controls="search-results" aria-activedescendant={results[sel] ? `sr-${sel}` : undefined}
        onChange={(e) => { setQ(e.target.value); setSel(0); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKeyDown} />
      <kbd className="search-kbd">⌘K</kbd>
      {open && q.trim() && (
        <ul className="search-results" id="search-results" role="listbox">
          {results.length === 0 && <li className="none">No step teaches “{q}” yet. Try a keyword like SELECT, JOIN or INDEX.</li>}
          {results.map((r, i) => (
            <li key={`${r.id}-${r.step}`} id={`sr-${i}`} role="option" aria-selected={i === sel}
              className={i === sel ? 'sel' : ''} onMouseEnter={() => setSel(i)} onMouseDown={(e) => { e.preventDefault(); go(r); }}>
              <div className="sr-head">
                <span className="cats"><Cats cats={r.cats} /></span>
                <b>{r.title}</b>
                <span className={`sr-kind ${r.kind.replace(' ', '-')}`}>{r.kind}</span>
              </div>
              <div className="sr-where">{r.lesson} · step {r.step + 1}</div>
              <div className="sr-snip">{snippet(r.text, terms)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
