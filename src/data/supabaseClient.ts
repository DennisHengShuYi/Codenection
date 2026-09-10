import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The one place a Supabase client is constructed, for every module that needs one.
 *
 * A module-level memo *per module* is the trap this file exists to close. Storage and
 * authentication are separate concerns and belong in separate modules, but they are not
 * separate clients: both talk to the same project, so both land on the same
 * `sb-<ref>-auth-token` key in local storage. Two clients on one key is the condition the
 * browser warns about -- "Multiple GoTrueClient instances detected in the same browser
 * context" -- and it is reached just as easily by two correct-looking memos as by none.
 *
 * The bug that made this non-negotiable took the whole app down. `createRepository` runs
 * inside a `useMemo` keyed on the session, so a new session object produced a new
 * repository. With the client memoised inside each repository, that meant a new client per
 * render; a second client announces itself to the first, which arrives as an auth change,
 * which builds a fresh session object, which makes another repository -- until the browser
 * ran out of sockets and every request failed with ERR_INSUFFICIENT_RESOURCES.
 *
 * Keyed by url and key rather than held in a single variable, so a test, or a future second
 * project, still gets its own.
 */
const clients = new Map<string, Promise<SupabaseClient>>()

/**
 * Loaded on first use rather than imported at the top of the file.
 *
 * The client is around 220KB of JavaScript, and a static import puts it in the main bundle
 * for *every* visitor -- including the demo, which runs on browser storage and never
 * touches Supabase at all. §11 asks for something a student installs on a phone, so
 * doubling the download for a path most sessions never take is the wrong trade.
 */
export function getSharedClient(url: string, anonKey: string): Promise<SupabaseClient> {
  const key = `${url} ${anonKey}`

  const existing = clients.get(key)
  if (existing !== undefined) return existing

  const created = import('@supabase/supabase-js').then((module) =>
    module.createClient(url, anonKey),
  )
  clients.set(key, created)
  return created
}
