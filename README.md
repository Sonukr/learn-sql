# Learn SQL

An interactive, step-by-step MySQL course. Every step has an animated 3D scene and a live SQL editor that runs in your browser.

- **13 modules, 26 lessons**, ordered like the SQL mindmap: DML, DDL, DCL and TCL; aliases, WHERE, ORDER BY, GROUP BY, JOINs, functions and window functions.
- **Animated scenes**: tables, JOIN matches, grouping, query plans, transactions, privileges and stored procedures. Results appear next to the source tables.
- **Runs in the browser**: SQLite through [sql.js](https://sql.js.org) (WebAssembly), with a layer that makes it behave like MySQL. That covers ALTER, SHOW CREATE TABLE, users and GRANT, procedures, EXPLAIN, and MySQL error codes.
- **Challenges** are checked against a model answer.
- **Search**: finds any SQL method and jumps to the step that teaches it.
- **My Data**: import your own `mysqldump` or CSV files (up to 50 MB) and explore them with the same scenes. The data stays in your browser (IndexedDB).
- **AI tutor** (Google Gemini) knows your current step and progress, and recommends what to learn next.
- **Feedback** is stored in Supabase and shown read-only at `#/feedback`.

## Run locally

Needs Node 20+.

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev
```

Open http://localhost:5173. The course works without any keys; only the tutor and feedback need them.

| Variable | Used for | Where to get it |
|---|---|---|
| `GEMINI_API_KEY` | AI tutor | https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | Optional, default `gemini-flash-latest` | |
| `SUPABASE_URL` | Feedback | Supabase → **Connect**, or Project Settings → Data API |
| `SUPABASE_ANON_KEY` | Feedback | Supabase → Project Settings → API Keys → **Publishable** key. Never the secret/service_role key. |


## Feedback setup (Supabase)

1. Create a free project at https://supabase.com.
2. In **SQL Editor**, run [`supabase/feedback.sql`](supabase/feedback.sql).
3. Put the project URL and publishable key in `.env.local` (and in Vercel).

The table only lets visitors **add and read** feedback: row-level security blocks edits and deletes. As the owner, you can manage rows in Supabase → Table Editor → `feedback`.

## Deploy (Vercel)

1. Push to GitHub and import the repo in Vercel. It detects Vite: build command `npm run build`, output folder `dist`.
2. Add the environment variables above for Production and Preview.
3. Deploy. The `api/` folder becomes the `/api/chat` and `/api/feedback` functions. Redeploy after changing variables.

## Analytics (optional)

The app sends learning events to Google Tag Manager's `dataLayer`: `lesson_step_view`, `query_run`, `challenge_result`, `site_search`, `data_import`, `chat_open`, `tutor_question` and `feedback_submit`. Add a GA4 Event tag on them in GTM to see them in Google Analytics. Query text, comments and imported data are never sent.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server, including the `/api` functions |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run test:api` | Tests for `/api/chat` and `/api/feedback` (Google and Supabase are mocked) |

## Project layout

```
api/            Vercel functions: chat.js (Gemini tutor), feedback.js (Supabase)
src/lessons.js  All course content: modules, lessons and steps
src/lib/        sql.js (engine and MySQL layer), admin.js (ALTER, users, procedures…),
                scenes.js (animations), importer.js (dump/CSV import), analytics.js
src/components/ UI: CourseTree, Stage, EditorPane, StepPanel, SearchBox, MyData, ChatWidget, FeedbackList
supabase/       SQL for the feedback table
scripts/        API tests
```

To add a lesson, add an object to `src/lessons.js`. Each step can have `body`, `sql`, a challenge (`expect`, `verify`), a 3D model (`viz`) or a scene override (`scene`).
