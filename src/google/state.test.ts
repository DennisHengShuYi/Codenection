import { describe, expect, it } from 'vitest'
import { readState, signState, STATE_LIFETIME_MS } from './state'

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
