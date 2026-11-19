// Checks api/chat.js (Gemini mocked) and api/feedback.js (Supabase mocked): run with `npm run test:api`.
import assert from 'node:assert/strict';
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const chat = await import(`${root}/api/chat.js`);
const fb = await import(`${root}/api/feedback.js`);
const req = (body, ip = '1.1.1.1') => new Request('http://x/api', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const ok = (name) => console.log('✓', name);
let sent = null, reply = { status: 200, body: { candidates: [{ content: { parts: [{ text: 'Use **JOIN** — see [JOINs](#/joins/1).' }] } }] } };
globalThis.fetch = async (url, init) => { sent = { url, init }; return new Response(JSON.stringify(reply.body), { status: reply.status }); };

delete process.env.GEMINI_API_KEY;
let r = await chat.POST(req({ messages: [{ role: 'user', text: 'hi' }] }));
assert.equal(r.status, 503); assert.match((await r.json()).error, /GEMINI_API_KEY/); ok('chat: 503 + setup hint when no key');

process.env.GEMINI_API_KEY = 'test-key';
r = await chat.POST(req({ messages: [{ role: 'user', text: 'What is a JOIN?' }], context: { current: { lesson_id: 'joins' } } }));
assert.equal(r.status, 200); assert.match((await r.json()).reply, /JOIN/);
assert.match(sent.url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-flash-latest:generateContent$/);
assert.equal(sent.init.headers['x-goog-api-key'], 'test-key'); assert.ok(!sent.url.includes('test-key'), 'key not in URL');
const payload = JSON.parse(sent.init.body);
assert.equal(payload.contents[0].role, 'user'); assert.match(payload.systemInstruction.parts[0].text, /"lesson_id":"joins"/);
ok('chat: calls Gemini with key in header, context in system instruction, returns reply');

r = await chat.POST(req({ messages: Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'model' : 'user', text: 'x'.repeat(9000) })) }, '2.2.2.2'));
const p2 = JSON.parse(sent.init.body); assert.equal(p2.contents.length, 12); assert.equal(p2.contents[0].parts[0].text.length, 4000);
ok('chat: keeps only last 12 messages, caps each at 4000 chars');

for (const bad of [{}, { messages: [] }, { messages: [{ role: 'system', text: 'x' }] }, { messages: [{ role: 'user', text: 5 }] }, 'not json']) {
  r = await chat.POST(req(bad, '3.3.3.3')); assert.equal(r.status, 400);
}
ok('chat: rejects malformed input (400)');

reply = { status: 400, body: { error: { message: 'API key not valid' } } };
r = await chat.POST(req({ messages: [{ role: 'user', text: 'q' }] }, '4.4.4.4'));
assert.equal(r.status, 502); assert.match((await r.json()).error, /API key not valid/); ok('chat: surfaces Gemini errors (502)');
reply = { status: 200, body: { candidates: [{ finishReason: 'SAFETY' }] } };
r = await chat.POST(req({ messages: [{ role: 'user', text: 'q' }] }, '4.4.4.4'));
assert.equal(r.status, 502); assert.match((await r.json()).error, /rephrasing/); ok('chat: handles empty/blocked answers');

reply = { status: 200, body: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } };
let last; for (let i = 0; i < 21; i++) last = await chat.POST(req({ messages: [{ role: 'user', text: 'q' }] }, '9.9.9.9'));
assert.equal(last.status, 429); ok('chat: rate-limits after 20 questions / 10 min per IP');

delete process.env.SUPABASE_URL;
r = await fb.POST(req({ rating: 5 }, '5.5.5.4')); assert.equal(r.status, 503); assert.match((await r.json()).error, /SUPABASE_URL/); ok('feedback: 503 + setup hint when Supabase isn’t configured');
process.env.SUPABASE_URL = 'https://abc.supabase.co/'; process.env.SUPABASE_ANON_KEY = 'anon-key';
reply = { status: 201, body: {} };
r = await fb.POST(req({ name: '  Asha  ', rating: 4.6, category: 'Bug', comment: '  The JOIN step is great  ', page: 'JOINs · step 3', lesson: 'joins', progress: '3/26 lessons' }, '5.5.5.5'));
assert.equal(r.status, 200); assert.equal(sent.url, 'https://abc.supabase.co/rest/v1/feedback'); assert.equal(sent.init.method, 'POST'); assert.equal(sent.init.headers.apikey, 'anon-key');
let e = JSON.parse(sent.init.body);
assert.equal(e.name, 'Asha'); assert.equal(e.rating, 5); assert.equal(e.category, 'Bug'); assert.equal(e.comment, 'The JOIN step is great');
ok('feedback: inserts a cleaned row into Supabase with the anon key');
reply = { status: 200, body: [{ id: 'b' }, { id: 'a' }] };
r = await fb.GET(); assert.deepEqual((await r.json()).feedback.map((x) => x.id), ['b', 'a']); assert.match(sent.url, /\/rest\/v1\/feedback\?select=\*&order=at\.desc&limit=500$/); assert.equal(sent.init.headers.apikey, 'anon-key'); ok('feedback: GET lists newest first');
reply = { status: 404, body: {} };
r = await fb.GET(); assert.equal(r.status, 502); assert.match((await r.json()).error, /feedback\.sql/); ok('feedback: clear error when the table is missing');
assert.equal(fb.PUT, undefined); assert.equal(fb.DELETE, undefined); assert.equal(fb.PATCH, undefined); ok('feedback: no edit/delete handlers');
r = await fb.POST(req({ rating: 0, comment: 'x' }, '6.6.6.6')); assert.equal(r.status, 400); ok('feedback: needs a rating or a real comment');
reply = { status: 201, body: {} };
r = await fb.POST(req({ rating: 3, category: '<script>', comment: 'y'.repeat(5000) }, '6.6.6.7'));
e = JSON.parse(sent.init.body); assert.equal(e.category, 'Other'); assert.equal(e.comment.length, 2000); ok('feedback: unknown category → Other, comment capped at 2000');
reply = { status: 500, body: {} };
r = await fb.POST(req({ rating: 3 }, '7.7.7.7')); assert.equal(r.status, 502); ok('feedback: reports failure when the server refuses');
console.log('\nall API tests passed');
