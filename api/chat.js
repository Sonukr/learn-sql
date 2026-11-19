// POST /api/chat: the SQL tutor, backed by Google Gemini. The API key stays here on the server.
// Env: GEMINI_API_KEY (required), GEMINI_MODEL (optional, default below).

const MODEL = () => process.env.GEMINI_MODEL || 'gemini-flash-latest';
const MAX_MESSAGES = 12, MAX_CHARS = 4000;

// ponytail: in-memory per-IP limit, per serverless instance only. Use Upstash/Vercel KV if abuse becomes real.
const hits = new Map();
function limited(ip, max = 20, windowMs = 10 * 60 * 1000) {
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > max;
}

const json = (body, status = 200) => Response.json(body, { status });

const SYSTEM = `You are the friendly tutor inside "Learn SQL", an interactive MySQL course with animated lessons.
Rules:
- Teach MySQL 8 syntax. Keep answers short (under ~150 words) unless asked for detail, and use small SQL examples in \`\`\`sql blocks.
- Use the learner's context (current lesson and step, the query that just failed, their progress) to make answers specific.
- When recommending what to learn, only recommend lessons from the course catalog in the context, as markdown links exactly like [Lesson title](#/lesson-id/1). Never invent lessons.
- Explain errors by their MySQL error code and the likely fix.
- If the learner gives feedback about the site itself (bugs, ideas, content), thank them and suggest the Feedback tab so it reaches the authors.
- You can't see the learner's imported data rows, only query text. Don't ask for passwords or personal data.`;

export async function POST(request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: 'The AI tutor isn’t set up yet: add GEMINI_API_KEY in the Vercel project settings.' }, 503);
  const ip = (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  if (limited(ip)) return json({ error: 'Too many questions in a short time. Please wait a few minutes.' }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const messages = Array.isArray(body?.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  if (!messages.length || messages.some((m) => typeof m?.text !== 'string' || !['user', 'model'].includes(m.role)))
    return json({ error: 'Invalid messages' }, 400);
  const context = JSON.stringify(body.context || {}).slice(0, 12000);

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${SYSTEM}\n\nLearner context (JSON):\n${context}` }] },
      contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text.slice(0, MAX_CHARS) }] })),
      generationConfig: { temperature: 0.4, maxOutputTokens: 900 },
    }),
  }).catch(() => null);
  if (!res) return json({ error: 'Couldn’t reach Google Gemini. Try again.' }, 502);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json({ error: `Gemini error ${res.status}: ${data?.error?.message || 'request failed'}` }, 502);
  const reply = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
  if (!reply) return json({ error: 'The tutor had no answer for that (it may have been blocked by safety filters). Try rephrasing.' }, 502);
  return json({ reply });
}
