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

/** Which check refused, for a server log and never for a screen. */
export type StateRefusal =
  /** Not two non-empty dot-separated parts: never something this app produced. */
  | 'malformed'
  /** The HMAC did not verify. Overwhelmingly a `GOOGLE_STATE_SECRET` that differs between
   *  the deployment that signed the link and the one handling the callback -- which no
   *  student can press their way out of, and which looks identical to an expiry on screen. */
  | 'signature'
  /** Verified, but not the JSON we write: our own encoding changed under a half-rolled
   *  deploy. The signature proves we produced it, so this is not an attack. */
  | 'shape'
  /** Past `STATE_LIFETIME_MS`. The only one of the five that a student fixes by pressing
   *  Connect again, which is what the sentence they are shown tells them to do. */
  | 'expired'
  /** Issued after `now`. A clock that disagrees between the two halves of the round trip,
   *  or one that went backwards -- not a link to honour either way. */
  | 'future'

export type StateReading =
  | { readonly ok: true; readonly accountId: string }
  | { readonly ok: false; readonly reason: StateRefusal }

/**
 * The account a state was signed for, and -- when there is none -- which check refused.
 *
 * The reason exists so an operator can tell a misconfigured deployment from a student who
 * left a tab open, because those two produce the same sentence on screen and only one of
 * them is a bug. It must never reach a response body: which part of a defence somebody
 * tripped is information about the defence, and telling them apart is how somebody probing
 * it learns which part to work on. `api/google-connect.ts` logs it and says the same
 * sentence it always said.
 */
export async function inspectState(
  state: string,
  secret: string,
  now: number = Date.now(),
): Promise<StateReading> {
  const refused = (reason: StateRefusal): StateReading => ({ ok: false, reason })

  const parts = state.split('.')
  if (parts.length !== 2) return refused('malformed')

  const [payload, signature] = parts as [string, string]
  if (payload === '' || signature === '') return refused('malformed')

  // Verified before it is read. Parsing first would mean acting on unauthenticated bytes,
  // which is the whole thing this is here to prevent.
  if (!matches(signature, await sign(payload, secret))) return refused('signature')

  try {
    const claim = JSON.parse(fromBase64Url(payload)) as { a?: unknown; t?: unknown }
    if (typeof claim.a !== 'string' || typeof claim.t !== 'number') return refused('shape')

    // Both directions. A clock that has gone backwards must not resurrect an old link, and
    // a link from the future is a signal something is wrong rather than something to honour.
    const age = now - claim.t
    if (age < 0) return refused('future')
    if (age > STATE_LIFETIME_MS) return refused('expired')

    return { ok: true, accountId: claim.a }
  } catch {
    // Anything that is not the JSON we wrote, which -- given the signature verified -- means
    // our own encoding changed rather than an attack.
    return refused('shape')
  }
}

/**
 * The account a state was signed for, or null.
 *
 * Null for every failure, deliberately: the caller says only that the connection could not
 * be completed, and this is the shape that makes saying anything else impossible. Callers
 * that need to *log* which check refused reach for `inspectState` instead, and still show
 * the one sentence.
 */
export async function readState(
  state: string,
  secret: string,
  now: number = Date.now(),
): Promise<string | null> {
  const reading = await inspectState(state, secret, now)

  return reading.ok ? reading.accountId : null
}
