-- §8b: make block_answers readable, and make it carry enough to compute an outcome.
--
-- ============================================================================
-- DEPLOY GATE. THIS MIGRATION MUST BE APPLIED BEFORE THIS BRANCH IS DEPLOYED.
-- ============================================================================
--
-- NOT APPLIED AUTOMATICALLY, and nothing in this repository applies it. Apply it by hand,
-- the way 0002, 0003 and 0004 were applied, and do it BEFORE the code that reads these
-- columns is serving anyone.
--
-- What depends on it, and what breaks without it:
--   * src/data/supabaseRepository.ts  -- loadBlockLog / recordBlockAnswer / clear
--   * api/telegram.ts (createStore)   -- recordBlockAnswer, loadBlockLog
-- Both reject rather than swallowing the failure, on purpose (Ruling 42): a signed-in
-- student on an unmigrated database is told the answer could not be saved and that a
-- request cannot be priced, instead of being told "Noted." while nothing is written and
-- being quoted a price computed as though they had answered nothing.
--
-- So the failure is loud, but it is still a failure: until this is applied, §2.4's Reality
-- Check, §6.5's missing-data pessimism and §7.3's calibration have no evidence to run on.
--
-- 0004 stored an answer and nothing else, which is why nothing could read it: a week lives
-- in a jsonb column, so `block_id` has nothing to join against and the type and planned
-- hours Reality Check compares were nowhere to be found.

alter table public.block_answers
  add column if not exists load_type text,
  add column if not exists planned_hours numeric,
  add column if not exists day_index integer;

-- 0004 allowed yes/no/partly, which answers "did you do it". Reality Check asks "how long
-- did it take", and the two were being multiplied together as though they were one axis.
-- Existing rows stay valid and keep their old meaning; nothing reads them yet, so there is
-- nothing to migrate.
alter table public.block_answers
  drop constraint if exists block_answers_answer_check;

alter table public.block_answers
  add constraint block_answers_answer_check
  check (answer in ('yes', 'no', 'partly', 'didnt', 'less', 'right', 'longer'));

-- 0004 enabled RLS with no policies at all, on the reasoning that nothing read the table
-- and granting access would widen the surface for nothing. Something reads it now, so it
-- gets the same four auth.uid() policies 0002 established for user_state: select, insert,
-- update, and delete. All four, not three -- a delete with no matching policy does not
-- fail, it silently removes zero rows, which would let `clear()` report success while
-- leaving every block answer in place for the next `loadBlockLog()` to feed straight back
-- into `outcomesFrom` and `checkedInDays`.
create policy "read own answers"
  on public.block_answers for select
  using (auth.uid() = account_id);

create policy "insert own answers"
  on public.block_answers for insert
  with check (auth.uid() = account_id);

create policy "update own answers"
  on public.block_answers for update
  using (auth.uid() = account_id)
  with check (auth.uid() = account_id);

create policy "delete own answers"
  on public.block_answers for delete
  using (auth.uid() = account_id);
