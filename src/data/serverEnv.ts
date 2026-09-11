/**
 * What an `api/` endpoint is allowed to believe about its own configuration.
 *
 * This lives under `src/` rather than in `api/` for the reason `google/guard.ts` gives about
 * itself: `api/` is typechecked but the unit suite never sees it, and a rule this load-
 * bearing should not be the untested part.
 */

/** Whitespace around a value is a paste, not a configuration. The browser has always taken
 *  this line (`data/env.ts`); the endpoints never did, which is how a value that works in
 *  the bundle can fail in a function reading the very same variable. */
const clean = (value: string | undefined): string | null => {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

/** A Supabase project address and the public key that opens it -- together, because one
 *  without the other is not a project. */
export interface SupabasePair {
  readonly url: string
  readonly anonKey: string
}

/**
 * The project an endpoint verifies a student's session against.
 *
 * **Both halves come from the same source or neither does.** The endpoints used to read
 * `SUPABASE_URL ?? VITE_SUPABASE_URL` for the address and `VITE_SUPABASE_ANON_KEY` for the
 * key, which quietly allows one project's address to be checked with another project's key.
 * Vercel's own Supabase integration sets `SUPABASE_URL` and `SUPABASE_ANON_KEY` under
 * exactly those names, so a deployment reaches that state by being set up the documented
 * way rather than by anybody making a mistake.
 *
 * What it costs when it happens is out of proportion to how quiet it is: Supabase refuses
 * the token, `auth.getUser()` answers with no user, and the endpoint -- which cannot tell
 * that apart from nobody being signed in -- tells a signed-in student to sign in. Nothing
 * anywhere says the deployment is misconfigured.
 *
 * The server names win when both are present, because a deployment that states them has
 * said which project its functions talk to.
 */
export function readSupabasePair(
  env: Record<string, string | undefined>,
): SupabasePair | null {
  const serverUrl = clean(env.SUPABASE_URL)
  const serverKey = clean(env.SUPABASE_ANON_KEY)

  if (serverUrl !== null && serverKey !== null) return { url: serverUrl, anonKey: serverKey }

  const browserUrl = clean(env.VITE_SUPABASE_URL)
  const browserKey = clean(env.VITE_SUPABASE_ANON_KEY)

  if (browserUrl !== null && browserKey !== null) return { url: browserUrl, anonKey: browserKey }

  return null
}

/**
 * The address the service-role key belongs to.
 *
 * The same project as the pair above, deliberately: the key that reads a student's week and
 * the key that verifies their session must address one project, or a webhook writes where
 * nothing reads. Falls back to the plain URL names for the endpoints that hold only a
 * service-role key and never verify a session at all.
 */
export function readSupabaseUrl(env: Record<string, string | undefined>): string | null {
  return readSupabasePair(env)?.url ?? clean(env.SUPABASE_URL) ?? clean(env.VITE_SUPABASE_URL)
}

/** The key that bypasses row-level security, read through the same trim as everything else:
 *  a wrapped paste puts a newline inside a header value, and a header a runtime refuses to
 *  build fails as a refusal rather than as a fault anybody can see. */
export function readServiceRoleKey(env: Record<string, string | undefined>): string | null {
  return clean(env.SUPABASE_SERVICE_ROLE_KEY)
}
