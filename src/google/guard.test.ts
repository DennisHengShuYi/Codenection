import { describe, expect, it } from 'vitest'
import { checkCallback, checkStart, MAX_PUSH_EVENTS, readPushRequest } from './guard'

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

/**
 * The push payload, validated at the boundary before a single write happens.
 *
 * The browser computes the events, which is right -- one pure function decides what a week
 * means in a calendar. But computed by our code and arriving over the network are not the
 * same claim: what reaches this endpoint is whatever was actually posted, by whatever was
 * posting. It is checked here like any other third-party payload, and nothing downstream
 * treats it as already-checked.
 */
describe('readPushRequest', () => {
  const event = () => ({
    blockId: 'b1',
    summary: 'FYP writing',
    startsAt: '2026-09-11T09:00:00',
    endsAt: '2026-09-11T11:00:00',
  })

  it('accepts a well-formed push', () => {
    const read = readPushRequest({ events: [event()], timeZone: 'Asia/Kuala_Lumpur' })

    expect(read.ok).toBe(true)
    expect(read.ok === true && read.events).toEqual([event()])
    expect(read.ok === true && read.timeZone).toBe('Asia/Kuala_Lumpur')
  })

  it('accepts an empty push, which is how a cleared week is written', () => {
    const read = readPushRequest({ events: [], timeZone: 'UTC' })

    expect(read.ok === true && read.events).toEqual([])
  })

  it('refuses a body that is not a push at all', () => {
    expect(readPushRequest(null).ok).toBe(false)
    expect(readPushRequest('events').ok).toBe(false)
    expect(readPushRequest({ timeZone: 'UTC' }).ok).toBe(false)
  })

  it('refuses an event missing any of the four things an event is', () => {
    for (const key of ['blockId', 'summary', 'startsAt', 'endsAt']) {
      const broken = { ...event(), [key]: undefined }

      expect(readPushRequest({ events: [broken], timeZone: 'UTC' }).ok).toBe(false)
    }
  })

  /** Times are written into somebody's real calendar. Google would reject most nonsense,
   *  but a shape check here is what keeps a malformed one from ever being sent. */
  it('refuses a time that is not a local wall clock', () => {
    const wrong = { ...event(), startsAt: '2026-09-11T09:00:00+08:00' }

    expect(readPushRequest({ events: [wrong], timeZone: 'UTC' }).ok).toBe(false)
  })

  it('refuses a zone that is not a zone name', () => {
    expect(readPushRequest({ events: [event()], timeZone: '' }).ok).toBe(false)
    expect(readPushRequest({ events: [event()], timeZone: 7 }).ok).toBe(false)
  })

  /** More than a fortnight can hold. A runaway payload must not become a runaway number of
   *  writes into somebody's calendar. */
  it('refuses more events than a fortnight could contain', () => {
    const many = Array.from({ length: MAX_PUSH_EVENTS + 1 }, () => event())

    expect(readPushRequest({ events: many, timeZone: 'UTC' }).ok).toBe(false)
  })

  /** Nothing beyond the four fields is carried through: an attribute this app never
   *  intended to set cannot ride along into a Google request. */
  it('carries only the fields an event is made of', () => {
    const extra = { ...event(), attendees: [{ email: 'someone@else.com' }] }

    const read = readPushRequest({ events: [extra], timeZone: 'UTC' })

    expect(read.ok === true && read.events[0]).toEqual(event())
  })
})
