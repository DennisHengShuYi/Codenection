/**
 * The `state` parameter carried through the OAuth round trip, and checked on the way back.
 *
 * This is the whole CSRF defence on the connect flow. Without it, anyone can hand a student
 * a link that completes a connection to the *attacker's* Google account: the student's week
 * then reads a stranger's calendar, which looks indistinguishable from the feature working.
 *
 * Signed rather than stored. A table of pending nonces would need writing, reading, expiring
 * and cleaning up, and every half-finished attempt would leave a row behind. A signature
 * carries the account and the moment inside itself, so the callback verifies without a
 * lookup and there is nothing to collect afterwards.
 *
 * In `src/` rather than `api/` for the reason `telegram/guard.ts` states about itself: `api/`
 * is typechecked and the unit suite never sees it, and this is the guard on the most exposed
 * surface this feature adds.
 */

/**
 * How long a consent link stays valid.
 *
 * A signed state is a live credential for as long as it verifies, so it does not stay live.
 * Ten minutes is far longer than anyone takes at a Google consent screen, and short enough
 * that one recovered from a browser history or a shared screenshot is already dead.
 */
export const STATE_LIFETIME_MS = 10 * 60 * 1000

const encoder = new TextEncoder()

/** Base64url: the value travels in a query string, where `+`, `/` and `=` do not survive. */
const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fromBase64Url = (text: string): string =>
  atob(text.replace(/-/g, '+').replace(/_/g, '/'))

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))

  return toBase64Url(new Uint8Array(signature))
}

/**
 * Constant-time comparison, for the same reason `telegram/guard.ts` has one.
 *
 * A plain `!==` returns as soon as two strings differ, so how long it takes leaks how much
 * of a forged signature was right, and enough attempts recover a valid one a character at a
 * time.
 */
function matches(given: string, expected: string): boolean {
  let difference = given.length ^ expected.length

  for (let index = 0; index < expected.length; index += 1) {
    difference |= (given.charCodeAt(index) || 0) ^ expected.charCodeAt(index)
  }

  return difference === 0
}

/** A nonce, so two attempts by the same student in the same millisecond differ. One live
 *  consent link must never be another's. */
const nonce = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(9)))

export async function signState(
  accountId: string,
  secret: string,
  now: number = Date.now(),
): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify({ a: accountId, t: now, n: nonce() })))

  return `${payload}.${await sign(payload, secret)}`
}

/**
 * The account a state was signed for, or null.
 *
 * Null for every failure, deliberately, and the caller says only that the connection could
 * not be completed. Which check failed -- a bad signature, an expired link, a malformed
 * value -- is information about the defence, and telling somebody probing it apart is how
 * they learn which part to work on.
 */
export async function readState(
  state: string,
  secret: string,
  now: number = Date.now(),
): Promise<string | null> {
  const parts = state.split('.')
  if (parts.length !== 2) return null

  const [payload, signature] = parts as [string, string]
  if (payload === '' || signature === '') return null

  // Verified before it is read. Parsing first would mean acting on unauthenticated bytes,
  // which is the whole thing this is here to prevent.
  if (!matches(signature, await sign(payload, secret))) return null

  try {
    const claim = JSON.parse(fromBase64Url(payload)) as { a?: unknown; t?: unknown }
    if (typeof claim.a !== 'string' || typeof claim.t !== 'number') return null

    // Both directions. A clock that has gone backwards must not resurrect an old link, and
    // a link from the future is a signal something is wrong rather than something to honour.
    const age = now - claim.t
    if (age < 0 || age > STATE_LIFETIME_MS) return null

    return claim.a
  } catch {
    // Anything that is not the JSON we wrote, which -- given the signature verified -- means
    // our own encoding changed rather than an attack. Still nothing to act on.
    return null
  }
}
