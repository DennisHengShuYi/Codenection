-- Tighten the demo policy from a shared row to one row per student.
--
-- 0001 keyed everything to the literal id 'me' and allowed anyone to read or write it.
-- That was acceptable while the table held nothing, and stops being acceptable the
-- moment it holds a real fortnight: the anon key ships inside the browser bundle by
-- design, so "any visitor" meant any visitor to the deployed app, not just the owner.
--
-- The app now signs in anonymously and keys each row to that identity, so the database
-- can enforce the boundary rather than trusting the client to send the right id.
--
-- NOT APPLIED AUTOMATICALLY, and it needs one dashboard change alongside it:
--
--   1. Enable anonymous sign-ins: Authentication -> Providers -> Anonymous.
--      Without this the app cannot get an identity, falls back to browser storage, and
--      logs one warning saying so.
--   2. Apply this migration.
--
-- Until both are done the app keeps working on browser storage, so a half-finished
-- setup costs sync rather than data.

-- The old shared row cannot belong to anyone under the new policy, and it only ever
-- held demo data. Removing it avoids leaving an orphan no one can read or clean up.
delete from public.user_state where id = 'me';

drop policy if exists "demo singleton access" on public.user_state;

-- Read your own row.
create policy "read own row"
  on public.user_state
  for select
  using (auth.uid()::text = id);

-- Create your own row, and only your own.
create policy "insert own row"
  on public.user_state
  for insert
  with check (auth.uid()::text = id);

-- Update your own row. Both clauses are needed: `using` decides which rows you may
-- target, `with check` stops you rewriting one to belong to somebody else.
create policy "update own row"
  on public.user_state
  for update
  using (auth.uid()::text = id)
  with check (auth.uid()::text = id);

-- Delete your own row.
create policy "delete own row"
  on public.user_state
  for delete
  using (auth.uid()::text = id);
