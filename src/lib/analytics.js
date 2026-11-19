// Learning analytics. Events go to Google Tag Manager's dataLayer (configure GA4 tags on them in GTM),
// and a small summary is kept in this browser to power recommendations and the tutor's context.
// Never sent to analytics: query text, comments, or anything from imported data.

const KEY = 'learn-analytics';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
let state = { lessons: {}, searches: [], lastError: null, ...load() };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked */ } };

export function track(event, params = {}) {
  try { (window.dataLayer = window.dataLayer || []).push({ event, ...params }); } catch { /* no GTM */ }
}

const lessonState = (id) => (state.lessons[id] ||= { views: 0, ms: 0, fails: 0, passes: 0, lastStep: 0, lastSeen: 0 });
let current = null; // { id, step, since }

// Called whenever the visible step changes; also closes the timer on the previous step.
export function stepView(id, step, extra = {}) {
  const now = Date.now();
  if (current) lessonState(current.id).ms += Math.min(now - current.since, 30 * 60 * 1000); // cap idle tabs at 30 min
  current = { id, step, since: now };
  const l = lessonState(id);
  l.views++; l.lastStep = Math.max(l.lastStep, step); l.lastSeen = now;
  save();
  track('lesson_step_view', { lesson_id: id, step: step + 1, ...extra });
}

// A query run in the editor: challenge results count towards recommendations.
export function queryRun(id, step, { ok, challenge, error, sql }) {
  const l = lessonState(id);
  if (challenge) { if (ok) l.passes++; else l.fails++; }
  state.lastError = error ? { lesson: id, step, error: String(error).slice(0, 300), sql: String(sql || '').slice(0, 1500), at: Date.now() } : null;
  save();
  track(challenge ? 'challenge_result' : 'query_run', { lesson_id: id, step: step + 1, success: !!ok, ...(error ? { error_code: (String(error).match(/ERROR (\d+)/) || [])[1] || 'other' } : {}) });
}

export function searched(q, results) {
  state.searches = [q, ...state.searches.filter((x) => x !== q)].slice(0, 8);
  save();
  track('site_search', { search_term: q.slice(0, 60), results });
}

export const lastError = () => state.lastError;

// Rule-based recommendations: work without any AI and also feed the tutor.
export function recommendations(lessons, done, currentId) {
  const recs = [];
  const add = (id, reason) => { const l = lessons.find((x) => x.id === id); if (l && !recs.some((r) => r.id === id)) recs.push({ id, title: l.title, reason }); };
  for (const [id, l] of Object.entries(state.lessons))
    if (l.fails >= 2 && !l.passes && !done.includes(id)) add(id, `You tried its challenge ${l.fails} times: revisit the steps before it`);
  const started = Object.entries(state.lessons).filter(([id, l]) => !done.includes(id) && l.views && id !== currentId).sort((a, b) => b[1].lastSeen - a[1].lastSeen);
  if (started[0]) add(started[0][0], 'You started this one: pick up where you left off');
  const idx = lessons.findIndex((l) => l.id === currentId);
  const next = lessons.slice(Math.max(0, idx + 1)).find((l) => !done.includes(l.id)) || lessons.find((l) => !done.includes(l.id));
  if (next) add(next.id, 'Next in the course');
  return recs.slice(0, 3);
}

// Compact progress summary for the tutor (no personal data).
export function summary(lessons, done) {
  const minutes = (ms) => Math.round(ms / 60000);
  return {
    completed: done,
    in_progress: Object.entries(state.lessons).filter(([id]) => !done.includes(id)).map(([id, l]) => ({ id, minutes: minutes(l.ms), furthest_step: l.lastStep + 1, challenge_fails: l.fails })),
    struggling_with: Object.entries(state.lessons).filter(([, l]) => l.fails >= 2 && !l.passes).map(([id]) => id),
    recent_searches: state.searches.slice(0, 5),
    total_lessons: lessons.length,
  };
}
