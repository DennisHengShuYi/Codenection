-- One row per user, holding the whole week as JSON.
--
-- Deliberately not normalised: the schedule's shape changes with every plan in this
-- project, and a relational schema would have to change with it for no benefit while
-- there is exactly one reader.
--
-- NOT APPLIED AUTOMATICALLY. Applying this to a real project is a human action -- see
-- .claude/CLAUDE.md on irreversible and outward-facing operations.
create table if not exists public.user_state (
  id          text primary key,
  week        jsonb,
  settings    jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.user_state enable row level security;

-- DEMO ONLY. The anon key is public by design -- it ships inside the browser bundle --
-- so this policy lets any visitor read and write the singleton row. That is acceptable
-- for a single-user demo with no real data in it and unacceptable the moment it holds
-- more than one student's week.
--
-- Before that happens: add Supabase auth, replace the literal 'me' with auth.uid(), and
-- drop the anon grant.
create policy "demo singleton access"
  on public.user_state
  for all
  using (id = 'me')
  with check (id = 'me');
