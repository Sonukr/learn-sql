import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Serves api/*.js (the same files Vercel deploys) during `npm run dev`, so the API functions work locally.
// Keys come from .env.local and stay server-side: only VITE_-prefixed variables ever reach the browser.
function devApi() {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${req.url.slice(5).split('?')[0]}.js`);
          const handler = mod[req.method];
          if (!handler) { res.statusCode = 405; return res.end(); }
          const body = await new Promise((resolve) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => resolve(b)); });
          const response = await handler(new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers: { 'content-type': req.headers['content-type'] || 'application/json', 'x-forwarded-for': req.socket.remoteAddress || 'local' },
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
          }));
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(await response.text());
        } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return { plugins: [react(), devApi()] };
});
