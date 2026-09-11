-- §2.4: give a block answer enough to be evidence about *this work*, not only about an area
-- of life.
--
-- ============================================================================
-- DEPLOY GATE. THIS MIGRATION MUST BE APPLIED BEFORE THIS BRANCH IS DEPLOYED.
-- ============================================================================
--
-- NOT APPLIED AUTOMATICALLY, and nothing in this repository applies it. Apply it by hand,
-- the way 0002 through 0007 were applied, and do it BEFORE the code that writes these
-- columns is serving anyone.
--
-- Unlike 0005, nothing *breaks* without it. Both columns are optional the whole way up:
-- `BlockRecord.kind` and `.title` are optional fields, `outcomesFrom` carries them only when
-- present, and `paddingForItem` falls through to the rungs that do not need them. On an
-- unmigrated database the writes below would fail, so this is still a gate -- but the
-- failure mode of the *feature* is the behaviour this branch replaced, not an error.
--
-- What depends on it:
--   * src/data/supabaseRepository.ts  -- recordBlockAnswer / loadBlockLog
--   * api/telegram.ts (createStore)   -- recordBlockAnswer, loadBlockLog
--
-- Why a title and not a category id.
--
-- Reality Check now learns on a ladder: this exact work, then this kind of activity, then
-- this area of life. The narrowest rung needs to know which answers are about the same work,
-- and the only thing a student reliably gives is what they called it.
--
-- The grouping is derived from the title on read (`src/domain/taskKey.ts`) rather than
-- written here as a bucket. People name by instance -- "Lab report 3", "Lab report 4" -- so
-- the rules that collapse those into one family are guesses, and guesses get sharpened. A
-- bucket stored at answer time would freeze every grouping decision at the moment it was
-- made; a title stored instead means a better rule regroups a whole semester of past answers
-- the next time the app reads them.
--
-- That is also why there is no categories table and no foreign key: there is no vocabulary
-- to keep, only the words the student already typed.

alter table public.block_answers
  add column if not exists activity_kind text,
  add column if not exists title text;

-- No backfill. Rows written before this have no title and no kind, and that is the honest
-- state: nothing recorded what they were. They go on counting at the area-of-life rung,
-- which is the only rung they ever fed.
