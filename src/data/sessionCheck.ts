/**
 * Who an `api/` endpoint is talking to, and whether it could find out at all.
 *
 * Under `src/` rather than in `api/` for the reason `google/guard.ts` gives: `api/` is
 * typechecked but the unit suite never sees it, and this decides what a student is told.
 */

/** What `auth.getUser()` said, once it has been read honestly. */
export interface Caller {
  readonly accountId: string | null
  /** False when the refusal was about this deployment rather than about the student --
   *  then "sign in first" is a lie and 401 is the wrong answer. */
  readonly verifiable: boolean
}

/**
 * Failures that are the deployment's, not the student's.
 *
 * Supabase answers 401 both for a session it will not accept and for an API key that does
 * not belong to the project being addressed, so the status cannot separate them and the
 * message is all there is. A transport failure -- no network from the function, a URL that
 * resolves nowhere -- is the same kind of thing: nobody signed in or out made it happen.
 */
const NOT_THE_STUDENT = /api key|apikey|failed to fetch|network|fetch failed|timeout/i

/**
 * Reads a `getUser` result without throwing away the half that says why.
 *
 * Every endpoint used to keep `data.user` and discard `error`, which collapses three
 * different situations into one answer: nobody is signed in, this session is no longer
 * good, and this deployment cannot verify a session at all. Only the first two are the
 * student's to act on.
 */
export function callerFrom(
  userId: string | null | undefined,
  error: { message?: string } | null | undefined,
): Caller {
  if (error) {
    return { accountId: null, verifiable: !NOT_THE_STUDENT.test(error.message ?? '') }
  }

  return { accountId: userId ?? null, verifiable: true }
}

/**
 * The token out of an `Authorization` header, without the scheme.
 *
 * Why this exists rather than the header being passed straight through: supabase-js builds
 * its auth client with `Authorization: Bearer <anon key>` and then spreads the caller's
 * global headers over it. `Authorization` and `authorization` are different object keys, so
 * a lowercase one does not replace the default -- both survive, and the request goes out as
 *
 *     Authorization: Bearer <anon key>, Bearer <user JWT>
 *
 * which Supabase refuses. That is a 401 for every student on every deployment, indistinguish-
 * able from being signed out, and it is what made connecting a calendar impossible.
 *
 * `auth.getUser(jwt)` takes the token as an argument and writes the header itself, which is
 * the documented way to check somebody else's session and the only one that cannot drift on
 * a header-name's capitalisation.
 */
export function bearerFrom(header: string | null | undefined): string | null {
  const match = /^bearer\s+(.+)$/i.exec(header?.trim() ?? '')
  const token = match?.[1]?.trim() ?? ''

  return token === '' ? null : token
}
