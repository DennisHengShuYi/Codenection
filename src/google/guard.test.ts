import { describe, expect, it } from 'vitest'
import { checkCallback, checkStart } from './guard'

const configured = {
  clientId: 'client-123',
  clientSecret: 'secret',
  tokenKey: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  stateSecret: 'state-secret',
}

/**
 * What the two connect endpoints check before they do anything.
 *
 * Here rather than in `api/` for the reason `telegram/guard.ts` gives about itself: `api/`
 * is typechecked and the unit suite never sees it, and these are the guards on the surface
 * this feature exposes to the internet. They are exactly the code that should not be the
 * untested part.
 */
describe('checkStart', () => {
  it('lets a signed-in student begin', () => {
    expect(checkStart({ method: 'GET', accountId: 'account-1' }, configured).ok).toBe(true)
  })

  /** Nothing about an account happens for a request that has not proved who it is. Without
   *  this, anyone could start a connection that ends up storing tokens against a row. */
  it('refuses a request with nobody behind it', () => {
    const result = checkStart({ method: 'GET', accountId: null }, configured)

    expect(result).toEqual({ ok: false, status: 401, body: expect.any(String) })
  })

  it('refuses a method it does not serve', () => {
    expect(checkStart({ method: 'DELETE', accountId: 'account-1' }, configured).ok).toBe(false)
  })

  /**
   * 503 rather than a throw, and the same everywhere in this codebase: an unset variable is
   * a deployment before its secrets are filled in, plus CI and local dev, which are ordinary
   * states rather than something a student did wrong.
   */
  it.each(['clientId', 'clientSecret', 'tokenKey', 'stateSecret'] as const)(
    'answers 503 rather than throwing when %s is unset',
    (missing) => {
      const result = checkStart(
        { method: 'GET', accountId: 'account-1' },
        { ...configured, [missing]: undefined },
      )

      expect(result).toEqual({ ok: false, status: 503, body: expect.any(String) })
    },
  )

  /** A half-filled configuration is a misconfiguration, exactly as `data/env.ts` treats the
   *  Supabase pair -- it must not start a flow it cannot finish. */
  it('refuses a configuration that is only half there', () => {
    const result = checkStart(
      { method: 'GET', accountId: 'account-1' },
      { ...configured, clientSecret: undefined },
    )

    expect(result.ok).toBe(false)
  })
})

describe('checkCallback', () => {
  const arriving = { method: 'GET', code: 'auth-code', error: null }

  it('lets a well-formed return through', () => {
    expect(checkCallback(arriving, configured).ok).toBe(true)
  })

  /**
   * A student who presses "Cancel" at Google's consent screen is not an error condition --
   * they changed their mind, which is a thing they are allowed to do. It must not read as a
   * failure or leave anything half-connected.
   */
  it('treats a refused consent as a decision rather than a fault', () => {
    const result = checkCallback({ ...arriving, code: null, error: 'access_denied' }, configured)

    expect(result).toEqual({ ok: false, status: 400, body: expect.stringMatching(/not connected/i) })
  })

  it('refuses a return with no code at all', () => {
    expect(checkCallback({ ...arriving, code: null }, configured).ok).toBe(false)
  })

  it('refuses a method it does not serve', () => {
    expect(checkCallback({ ...arriving, method: 'POST' }, configured).ok).toBe(false)
  })

  it('answers 503 when it is not configured to finish the exchange', () => {
    const result = checkCallback(arriving, { ...configured, clientSecret: undefined })

    expect(result).toEqual({ ok: false, status: 503, body: expect.any(String) })
  })

  /**
   * Nothing here names which check failed. Which part of a defence somebody tripped is
   * information about the defence, and it is how they learn what to work on next.
   */
  it('says nothing about which check refused it', () => {
    const refusals = [
      checkCallback({ ...arriving, code: null }, configured),
      checkCallback({ ...arriving, method: 'POST' }, configured),
    ]

    for (const refusal of refusals) {
      expect(refusal.ok).toBe(false)
      if (!refusal.ok) expect(refusal.body).not.toMatch(/state|signature|secret|code/i)
    }
  })
})
