-- §7.9's post-block confirmation: what a student says actually happened.
--
-- NOT APPLIED AUTOMATICALLY. Apply it the same way 0002 and 0003 were applied.
--
-- This table is evidence, not state. Nothing reads it yet: Reality Check (§2.4) needs
-- planned-versus-actual and the carryover matrix (§6.6) needs difficulty, and neither is
-- built. Collecting from the first day the channel exists is the point -- both of those
-- features are worthless on an empty history, and a week of answers is a week they cannot
-- get back later.

create table if not exists public.block_answers (
  account_id uuid not null references auth.users (id) on delete cascade,
  -- The scheduled item this answers. Not a foreign key: a week lives in a jsonb column
  -- rather than in rows, so there is nothing for the database to point at.
  block_id text not null,
  -- §7.9's three answers, not two. "Partly" is the honest answer for most blocks, and
  -- dropping it pushes people into a yes or a no that is not true.
  answer text not null check (answer in ('yes', 'no', 'partly')),
  answered_at timestamptz not null default now(),
  -- One answer per block per student. A second press corrects the first rather than
  -- adding a row, which is what makes a repeated update harmless.
  primary key (account_id, block_id)
);

create index if not exists block_answers_account_idx
  on public.block_answers (account_id, answered_at desc);

-- Row-level security on, with no policies, exactly as 0003 does: the anon key the browser
-- carries can reach none of this, and the service-role key held by api/telegram.ts is the
-- only way in. When §2.4 grows a screen it will need a read policy on auth.uid(); until
-- something reads it, granting one would be widening the surface for nothing.
alter table public.block_answers enable row level security;
