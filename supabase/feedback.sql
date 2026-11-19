-- Learn SQL feedback table.
-- Visitors (the "anon" role) can add and read feedback, but can't edit or delete it:

create table public.feedback (
  id       uuid primary key default gen_random_uuid(),
  at       timestamptz not null default now(),
  name     text not null default '' check (length(name) <= 80),
  rating   smallint check (rating between 1 and 5),
  category text not null default 'Other' check (category in ('Idea', 'Bug', 'Content', 'Other')),
  comment  text not null default '' check (length(comment) <= 2000),
  page     text not null default '' check (length(page) <= 200),
  lesson   text not null default '' check (length(lesson) <= 100),
  progress text not null default '' check (length(progress) <= 100),
  check (rating is not null or length(comment) >= 3)
);

alter table public.feedback enable row level security;
create policy "anyone can add feedback"  on public.feedback for insert to anon with check (true);
create policy "anyone can read feedback" on public.feedback for select to anon using (true);
-- New Supabase projects don't grant table access by default: allow only adding and reading.
grant select, insert on public.feedback to anon;
revoke update, delete, truncate on public.feedback from anon, authenticated;

