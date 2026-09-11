import { describe, expect, it } from 'vitest'
import { inspectState, readState, signState, STATE_LIFETIME_MS } from './state'

const SECRET = 'a-server-side-signing-secret'
const NOW = 1_800_000_000_000

/**
 * The `state` parameter, which is the whole of the CSRF defence on this flow.
 *
 * Without it, anyone can send a student a link that finishes an OAuth connection to the
 * *attacker's* Google account. The student's week then quietly reads a stranger's calendar
 * -- and it looks exactly like the feature working, which is what makes it worth defending
 * properly rather than with a random string nobody checks.
 *
 * Signed rather than stored. A table of pending nonces would need writing, reading, expiring
 * and cleaning up; a signature carries the account and the expiry inside itself, so the
 * callback needs no lookup and there is no half-finished row to leak or collect.
 */
describe('signState and readState', () => {
  it('reads back the account it was signed for', async () => {
    const state = await signState('account-1', SECRET, NOW)

    expect(await readState(state, SECRET, NOW)).toBe('account-1')
  })

  it('refuses a state signed with a different secret', async () => {
    const state = await signState('account-1', SECRET, NOW)

    expect(await readState(state, 'not-the-secret', NOW)).toBeNull()
  })

  /**
   * The attack this exists to stop: swap the account for somebody else's and keep the
   * signature, so the callback stores an attacker's tokens against a victim's row.
   *
   * The payload has to be decoded, edited and re-encoded to do it -- a plain string replace
   * finds nothing, because the account is not sitting in the state in the clear. That is
   * worth doing properly here rather than asserting against a no-op that would pass however
   * broken the verification was.
   */
  it('refuses a state whose account has been tampered with', async () => {
    const state = await signState('account-1', SECRET, NOW)
    const [payload, signature] = state.split('.') as [string, string]

    const claim = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      a: string
    }
    const forged = btoa(JSON.stringify({ ...claim, a: 'account-2' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    expect(await readState(`${forged}.${signature}`, SECRET, NOW)).toBeNull()
  })

  it('refuses a state whose signature has been tampered with', async () => {
    const state = await signState('account-1', SECRET, NOW)
    const [payload] = state.split('.')

    expect(await readState(`${payload}.deadbeef`, SECRET, NOW)).toBeNull()
  })

  /**
   * A consent link is a live credential for as long as it verifies, so it does not stay
   * live. Ten minutes is longer than any real student takes at a Google consent screen and
   * short enough that a link found in a browser history or a shared screenshot is already
   * dead.
   */
  it('refuses a state that has expired', async () => {
    const state = await signState('account-1', SECRET, NOW)

    expect(await readState(state, SECRET, NOW + STATE_LIFETIME_MS + 1)).toBeNull()
  })

  it('accepts one that is still inside its lifetime', async () => {
    const state = await signState('account-1', SECRET, NOW)

    expect(await readState(state, SECRET, NOW + STATE_LIFETIME_MS - 1)).toBe('account-1')
  })

  /** A clock that has gone backwards must not resurrect an old link either. */
  it('refuses a state issued in the future', async () => {
    const state = await signState('account-1', SECRET, NOW)

    expect(await readState(state, SECRET, NOW - 60_000)).toBeNull()
  })

  it.each([
    ['nothing at all', ''],
    ['no signature', 'account-1'],
    ['not base64', '!!!.!!!'],
    ['too many parts', 'a.b.c'],
  ])('refuses a state that is %s', async (_name, given) => {
    expect(await readState(given, SECRET, NOW)).toBeNull()
  })

  /** Two attempts must not produce the same string, or one student's live consent link is
   *  another's. */
  it('signs a distinct state each time', async () => {
    const first = await signState('account-1', SECRET, NOW)
    const second = await signState('account-1', SECRET, NOW)

    expect(first).not.toBe(second)
  })

  it('survives an account id with characters a URL cares about', async () => {
    const awkward = 'account/with+odd=chars'
    const state = await signState(awkward, SECRET, NOW)

    expect(await readState(state, SECRET, NOW)).toBe(awkward)
  })
})

/**
 * Why a refusal happened, for the server log only.
 *
 * `readState` answers null to four genuinely different failures -- a forged signature, a
 * link past its ten minutes, a clock that disagrees, and bytes that are not the payload we
 * wrote -- and `api/google-connect.ts` shows the student one sentence for all four. That is
 * the right thing to show: which part of a defence somebody tripped is information about
 * the defence, and a student cannot act on it anyway.
 *
 * It is the wrong thing to *know* only at the screen. A deployment whose signing secret
 * differs between the two halves of the round trip and a student who left the consent tab
 * open over lunch produce the identical sentence, and the first is a misconfiguration
 * nobody can press their way out of. So the reason is separated from the answer: the
 * caller logs it where an operator can read it, and still says the same thing out loud.
 */
describe('inspectState', () => {
  it('carries the account when the state is good', async () => {
    const state = await signState('account-1', SECRET, NOW)

    expect(await inspectState(state, SECRET, NOW)).toEqual({ ok: true, accountId: 'account-1' })
  })

  it('names a wrong signing secret as a signature failure, not an expiry', async () => {
    const state = await signState('account-1', SECRET, NOW)

    expect(await inspectState(state, 'not-the-secret', NOW)).toEqual({
      ok: false,
      reason: 'signature',
    })
  })

  it('tells a link past its lifetime apart from one from the future', async () => {
    const state = await signState('account-1', SECRET, NOW)

    expect(await inspectState(state, SECRET, NOW + STATE_LIFETIME_MS + 1)).toEqual({
      ok: false,
      reason: 'expired',
    })
    expect(await inspectState(state, SECRET, NOW - 60_000)).toEqual({
      ok: false,
      reason: 'future',
    })
  })

  it.each([
    ['nothing at all', ''],
    ['no signature', 'account-1'],
    ['too many parts', 'a.b.c'],
  ])('calls a state that is %s malformed', async (_name, given) => {
    expect(await inspectState(given, SECRET, NOW)).toEqual({ ok: false, reason: 'malformed' })
  })

  /**
   * A payload that verifies but is not the JSON we write means our own encoding changed,
   * not an attack -- the signature proves we produced it. Worth its own word, because an
   * operator seeing this in a log is looking at a deploy that half-rolled, and no amount of
   * reconnecting will clear it.
   *
   * Signed here with the same algorithm rather than by exporting the module's own `sign`:
   * the point is to reach the shape check with the signature check genuinely satisfied, and
   * widening the module's surface to test it would be the tail wagging the dog.
   */
  it('calls a verifying payload that is not our shape a shape failure', async () => {
    const toBase64Url = (bytes: Uint8Array): string =>
      btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

    const encoder = new TextEncoder()
    const payload = toBase64Url(encoder.encode(JSON.stringify({ a: 42, t: 'soon' })))

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const signature = toBase64Url(
      new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload))),
    )

    expect(await inspectState(`${payload}.${signature}`, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'shape',
    })
  })

  /** The sentence a student is shown must not vary with any of this. */
  it('leaves readState answering exactly null for every refusal', async () => {
    const state = await signState('account-1', SECRET, NOW)

    expect(await readState(state, 'not-the-secret', NOW)).toBeNull()
    expect(await readState(state, SECRET, NOW + STATE_LIFETIME_MS + 1)).toBeNull()
    expect(await readState(state, SECRET, NOW)).toBe('account-1')
  })
})
