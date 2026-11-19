// /api/feedback: visitor ratings and comments, stored in a Supabase table (see supabase/feedback.sql).
// POST adds one entry; GET lists them (newest first). Edit/delete is blocked by the table's row-level security.
// Env: SUPABASE_URL, SUPABASE_ANON_KEY (the anon / publishable key; it can only insert and read here).

const json = (body, status = 200) => Response.json(body, { status });
const CATEGORIES = ['Idea', 'Bug', 'Content', 'Other'];
const api = () => `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/feedback`;
const call = (url, init = {}) => fetch(url, { ...init, headers: { apikey: process.env.SUPABASE_ANON_KEY, ...init.headers }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
const notSetUp = () => !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY;
const SETUP = { error: 'Feedback isn’t set up yet: add SUPABASE_URL and SUPABASE_ANON_KEY to the environment.' };

const hits = new Map(); // ponytail: per-instance limit, like /api/chat
function limited(ip, max = 8, windowMs = 10 * 60 * 1000) {
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > max;
}

export async function GET() {
  if (notSetUp()) return json(SETUP, 503);
  const res = await call(`${api()}?select=*&order=at.desc&limit=500`); // ponytail: newest 500; paginate if it grows past that
  const list = res?.ok && (await res.json().catch(() => null));
  if (!Array.isArray(list)) return json({ error: res?.status === 404 ? 'The feedback table doesn’t exist yet: run supabase/feedback.sql.' : 'Couldn’t load feedback.' }, 502);
  return json({ feedback: list });
}

export async function POST(request) {
  if (notSetUp()) return json(SETUP, 503);
  const ip = (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  if (limited(ip)) return json({ error: 'Thanks! You’ve sent a lot of feedback already. Please try again later.' }, 429);

  let b;
  try { b = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const comment = String(b?.comment || '').trim();
  const n = Number(b?.rating), rating = n >= 1 && n <= 5 ? Math.round(n) : null;
  if (comment.length < 3 && !rating) return json({ error: 'Add a rating or a comment.' }, 400);
  const entry = {
    name: String(b?.name || '').trim().slice(0, 80),
    rating,
    category: CATEGORIES.includes(b?.category) ? b.category : 'Other',
    comment: comment.slice(0, 2000),
    page: String(b?.page || '').slice(0, 200),
    lesson: String(b?.lesson || '').slice(0, 100),
    progress: String(b?.progress || '').slice(0, 100),
  };
  const res = await call(api(), { method: 'POST', headers: { 'content-type': 'application/json', prefer: 'return=minimal' }, body: JSON.stringify(entry) });
  if (!res?.ok) return json({ error: 'Couldn’t save your feedback right now. Please try again.' }, 502);
  return json({ ok: true });
}
