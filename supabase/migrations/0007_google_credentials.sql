-- Google Calendar (§1.4's optional supplement): where a student's calendar grant is kept.
--
-- NOT APPLIED AUTOMATICALLY. Apply it the same way 0002 was applied.
--
-- This table holds the single most dangerous value in the product. A Google refresh token is
-- standing access to somebody's calendar until they revoke it -- not a session, not
-- something that lapses on its own. Everything below follows from that.
--
-- Three defences, deliberately stacked, because any one of them can fail:
--
--   1. The token is encrypted before it arrives (src/google/secretBox.ts, AES-GCM under
--      GOOGLE_TOKEN_KEY). Supabase encrypts its disks, which defends against a stolen disk
--      and not against anything that can already run a `select` -- a leaked service key, an
--      injection, a backup copied somewhere careless. A dump of this table is a column of
--      noise unless the key leaked too, and the key lives in the deployment environment
--      rather than the database.
--   2. Row-level security with NO policy for anon or authenticated, so the browser cannot
--      read it even holding a valid session. Only the service-role key reaches these rows,
--      and that key exists in exactly one file (api/).
--   3. The app is never told the token exists as a value -- only whether one is present,
--      through has_google_calendar() below, the same shape has_telegram_link() already uses.

create table if not exists public.google_credentials (
  -- One grant per account. Connecting again replaces rather than accumulates, so a student
  -- who reconnects cannot leave an older token behind that nothing will ever revoke.
  account_id uuid primary key references auth.users (id) on delete cascade,

  -- Encrypted. Never the raw token, and never readable by the client -- see the note above.
  refresh_token_sealed text not null,

  -- What they actually agreed to, recorded at the moment they agreed. If the app later asks
  -- for more, this is what says an existing grant predates the request and cannot be assumed
  -- to cover it.
  scopes text not null,

  -- The calendar this app created to write into, once it has created one. Null until the
  -- first push. Held so a second push updates that calendar rather than making another, and
  -- so disconnecting knows exactly what it may remove.
  app_calendar_id text,

  connected_at timestamptz not null default now(),
  -- Bumped on every successful refresh, so a grant Google has silently stopped honouring is
  -- visible as one that has not worked for a while.
  refreshed_at timestamptz
);

alter table public.google_credentials enable row level security;

-- Deliberately no policies. With row-level security on and nothing granted, every client
-- role is refused, and only the service-role key -- which bypasses RLS entirely and lives in
-- api/ alone -- can read or write these rows. An empty policy list here is the security
-- property, not an oversight, so nothing should be added without a reason written down.

revoke all on table public.google_credentials from anon, authenticated;

-- Whether this student has a calendar connected, so the app can show the right state.
--
-- A boolean, exactly as has_telegram_link() returns one: the app needs to know whether to
-- offer "Connect" or "Disconnect", and has no use whatever for the token, the scopes or the
-- calendar id. Not returning them keeps them out of the browser by construction rather than
-- by everyone remembering not to select them.
create or replace function public.has_google_calendar()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.google_credentials where account_id = auth.uid());
$$;

-- Withdrawing consent from inside the app, without needing the service key.
--
-- This deletes our copy. It does NOT revoke the grant at Google -- only api/google-disconnect
-- can do that, because revocation needs the client secret. The endpoint calls Google first
-- and this second, so a failed revoke leaves the row in place rather than leaving us with a
-- live grant we have forgotten we hold. This function exists for the case where the row must
-- go regardless: an account being deleted, or a student who wants it gone now.
create or replace function public.forget_google_calendar()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.google_credentials where account_id = auth.uid();
$$;

revoke all on function public.has_google_calendar() from public;
revoke all on function public.forget_google_calendar() from public;

grant execute on function public.has_google_calendar() to authenticated;
grant execute on function public.forget_google_calendar() to authenticated;
