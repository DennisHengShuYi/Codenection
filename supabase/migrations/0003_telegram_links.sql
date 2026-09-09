-- The chat channel (§13): linking a Telegram chat to an account, and holding a parsed
-- brain dump until the student confirms it.
--
-- NOT APPLIED AUTOMATICALLY. Apply it the same way 0002 was applied.
--
-- Read these tables only through api/telegram.ts, which holds the service-role key. The
-- browser never touches them: every policy below denies the anon role outright, so even if
-- the client tried, row-level security would refuse.

-- A code the app hands a signed-in student, spent once by /start in the chat.
--
-- The account is recorded when the code is issued, so claiming it later needs no trust in
-- anything the chat said. issued_at drives expiry, which the endpoint enforces.
create table if not exists public.telegram_link_codes (
  code text primary key,
  account_id uuid not null references auth.users (id) on delete cascade,
  issued_at timestamptz not null default now()
);

-- One chat, one account. The primary key is the chat id because a chat can be linked to
-- exactly one account at a time -- linking again replaces rather than accumulates, so a
-- shared phone cannot end up able to write to two students' weeks.
create table if not exists public.telegram_links (
  chat_id bigint primary key,
  account_id uuid not null references auth.users (id) on delete cascade,
  linked_at timestamptz not null default now()
);

-- A parse waiting for its button.
--
-- answered_at is what makes a repeat harmless: Telegram re-sends an update it was not
-- acknowledged for, and a student can press a button twice. Written before the week is,
-- so a retry cannot double a week.
create table if not exists public.telegram_pending (
  id uuid primary key,
  account_id uuid not null references auth.users (id) on delete cascade,
  items jsonb not null,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

-- Finding a student's open dumps, which is the only lookup that is not by primary key.
create index if not exists telegram_pending_account_idx
  on public.telegram_pending (account_id);

-- Row-level security on, with no policies at all.
--
-- That is deliberate rather than unfinished. With RLS enabled and nothing granted, the anon
-- key the browser carries can read and write none of these tables. The service-role key
-- bypasses RLS entirely and is the only way in, which is exactly the boundary §13 asks for:
-- the bot acts on these tables, the browser never does.
--
-- The one thing the app needs -- asking for a link code -- goes through the function below
-- rather than through a policy, so the app can create a code for itself and nothing else.
alter table public.telegram_link_codes enable row level security;
alter table public.telegram_links enable row level security;
alter table public.telegram_pending enable row level security;

-- Issuing a code, for the signed-in student and no one else.
--
-- security definer so it may write to a table the caller cannot touch, and it takes no
-- account argument on purpose: it uses auth.uid(), so a caller cannot mint a code that
-- links a chat to somebody else's account. That is the whole reason this is a function and
-- not an insert policy.
create or replace function public.issue_telegram_link_code(new_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  -- One open code per student. A new request replaces the last, so an abandoned code
  -- cannot be spent later by somebody who saw it over a shoulder.
  delete from public.telegram_link_codes where account_id = auth.uid();

  insert into public.telegram_link_codes (code, account_id)
  values (upper(new_code), auth.uid());
end;
$$;

-- Unlinking, likewise scoped to the caller by auth.uid() rather than by argument.
create or replace function public.unlink_telegram()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  delete from public.telegram_links where account_id = auth.uid();
  delete from public.telegram_link_codes where account_id = auth.uid();
end;
$$;

-- Whether this student has a chat linked, so the app can show the right state. Returns a
-- boolean rather than the chat id: the app has no use for the id, and not returning it
-- keeps it out of the browser.
create or replace function public.has_telegram_link()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.telegram_links where account_id = auth.uid());
$$;

revoke all on function public.issue_telegram_link_code(text) from public;
revoke all on function public.unlink_telegram() from public;
revoke all on function public.has_telegram_link() from public;

grant execute on function public.issue_telegram_link_code(text) to authenticated;
grant execute on function public.unlink_telegram() to authenticated;
grant execute on function public.has_telegram_link() to authenticated;
