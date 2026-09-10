-- §26's daily proactive check needs one thing the schema had nowhere to put: what was last
-- said to this chat about where their fortnight stops holding.
--
-- Without it the cron has no way to tell "the answer changed" from "the answer is the same
-- as yesterday", so it would either message every day -- which is how a student mutes a bot
-- inside a week -- or never.
--
-- On telegram_links rather than user_state, deliberately. user_state.settings is the app's
-- own blob, written whole by the browser on every settings change; a cron writing into it
-- would race the app and lose. This is a fact about a chat, and it belongs beside the chat.

alter table telegram_links
  -- Nullable with three meanings, and all three are needed:
  --   NULL and never written  -> nothing has been said to this chat yet, so the first run
  --                              stays silent rather than opening with a crisis message
  --   a day index             -> that is where it stopped holding when we last spoke
  --   notified_holds = true   -> we last told them it holds all the way through
  --
  -- Two columns rather than one sentinel, because "holds" and "never spoken to" are
  -- different states that a single nullable integer cannot tell apart, and collapsing them
  -- is exactly how the first run would greet somebody with bad news.
  add column if not exists notified_deficit_day integer,
  add column if not exists notified_holds boolean not null default false,
  add column if not exists notified_at timestamptz;

comment on column telegram_links.notified_deficit_day is
  'Day index last reported as the deficit crossing, or null when the week held or nothing has been said yet. Read with notified_holds to tell those apart.';

comment on column telegram_links.notified_holds is
  'True once anything has been reported and the fortnight held at the time. False and a null deficit day together mean this chat has never been messaged proactively.';
