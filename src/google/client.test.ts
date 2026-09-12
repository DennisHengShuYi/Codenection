import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { beginConnect, disconnectCalendar, pushCalendar, readCalendar } from './client'

const token = vi.fn<() => Promise<string | null>>()

vi.mock('../data/auth', () => ({ getAccessToken: () => token() }))

const week = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  startedOn: '2026-09-07',
})

const event = () => ({
  id: 'evt-1',
  summary: 'WIA3001 lecture',
  start: { dateTime: '2026-09-09T09:00:00+08:00' },
  end: { dateTime: '2026-09-09T11:00:00+08:00' },
})

const assign = vi.fn()

beforeEach(() => {
  token.mockResolvedValue('session-token')
  assign.mockReset()
  vi.stubGlobal('location', { assign })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/**
 * What the browser does about calendars.
 *
 * The property worth testing hardest is a negative one: the browser is never handed a Google
 * token. It asks our own endpoint, which holds the credential. A token in the browser is a
 * token in every extension the student has installed.
 */
describe('beginConnect', () => {
  it('sends the student to the consent screen the endpoint named', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' }),
      }),
    )

    await beginConnect()

    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1')
  })

  /**
   * The session token goes in a header, never the query string -- where it would land in
   * server logs, browser history and any `Referer` sent onward. That is the whole reason
   * this is a fetch followed by a navigation rather than one hop.
   */
  it('carries the session token in a header rather than the address', async () => {
    const fetched = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://x.test' }) })
    vi.stubGlobal('fetch', fetched)

    await beginConnect()

    const [url, options] = fetched.mock.calls[0] as [string, RequestInit]
    expect(url).not.toContain('session-token')
    expect((options.headers as Record<string, string>).authorization).toBe('Bearer session-token')
  })

  it('does nothing at all for somebody who is not signed in', async () => {
    token.mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn())

    await beginConnect()

    expect(assign).not.toHaveBeenCalled()
  })

  /** A deployment that cannot connect a calendar at all must not read as a bad moment, and
   *  must never read as the student's fault: the 503 our endpoints answer for an unset
   *  secret or an unverifiable session says so in words nobody will retry against. */
  it('says so plainly when this deployment has no calendar to connect to', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))

    const outcome = await beginConnect()

    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.reason).toMatch(/not set up/i)
    expect(outcome.ok === false && outcome.reason).not.toMatch(/sign in/i)
    expect(assign).not.toHaveBeenCalled()
  })

  /** Ruling 63 turned the throw into an answer: it still goes nowhere, and now it also
   *  says why instead of surfacing in a console the student will never open. */
  it('goes nowhere when the endpoint cannot start the flow', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    await expect(beginConnect()).resolves.toEqual({ ok: false, reason: expect.any(String) })
    expect(assign).not.toHaveBeenCalled()
  })

  /** A reply without a URL must not become a navigation to `undefined`. */
  it('goes nowhere when the endpoint answers without a destination', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))

    await expect(beginConnect()).resolves.toEqual({ ok: false, reason: expect.any(String) })
    expect(assign).not.toHaveBeenCalled()
  })
})

describe('readCalendar', () => {
  it('turns what the endpoint returns into chips', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [event()] }) }),
    )

    const { items } = await readCalendar(week())

    expect(items).toHaveLength(1)
    expect(items[0]?.title).toBe('WIA3001 lecture')
  })

  /**
   * Counted rather than silently dropped. A student seeing three rows from a calendar
   * holding thirty needs to know the rest were out of range, not misread.
   */
  it('reports how many were outside the fortnight', async () => {
    const distant = { ...event(), start: { dateTime: '2027-01-01T09:00:00+08:00' }, end: { dateTime: '2027-01-01T10:00:00+08:00' } }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [event(), distant] }) }),
    )

    const { items, skipped } = await readCalendar(week())

    expect(items).toHaveLength(1)
    expect(skipped).toBe(1)
  })

  it('never asks Google directly, only this app', async () => {
    const fetched = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) })
    vi.stubGlobal('fetch', fetched)

    await readCalendar(week())

    const [url] = fetched.mock.calls[0] as [string]
    expect(url).not.toMatch(/googleapis|google\.com/)
    expect(url).toBe('/api/google-events')
  })

  it('refuses for somebody who is not signed in', async () => {
    token.mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn())

    await expect(readCalendar(week())).rejects.toThrow()
  })

  it('throws when the calendar could not be read, so the screen can say one plain thing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    await expect(readCalendar(week())).rejects.toThrow()
  })

  it('treats a reply with no events as an empty calendar rather than a failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))

    await expect(readCalendar(week())).resolves.toEqual({ items: [], skipped: 0 })
  })
})

describe('disconnectCalendar', () => {
  it('asks the endpoint to withdraw the grant', async () => {
    const fetched = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetched)

    expect(await disconnectCalendar()).toBe(true)

    const [url, options] = fetched.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/google-disconnect')
    // A write, so it must not be something a link or a prefetch can trigger.
    expect(options.method).toBe('POST')
  })

  it('reports failure rather than claiming a disconnection that did not happen', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    expect(await disconnectCalendar()).toBe(false)
  })

  it('does nothing for somebody who is not signed in', async () => {
    token.mockResolvedValue(null)
    const fetched = vi.fn()
    vi.stubGlobal('fetch', fetched)

    expect(await disconnectCalendar()).toBe(false)
    expect(fetched).not.toHaveBeenCalled()
  })
})

/**
 * The outward write, from the browser's side.
 *
 * What goes over the wire is the finished list of events, computed here by `plannedEvents`,
 * rather than the week for the endpoint to interpret. One place decides what a week means
 * in a calendar, it is pure, and it is the same function whose output the student was shown
 * before pressing the button.
 */
describe('pushCalendar', () => {
  const events = [
    {
      blockId: 'b1',
      summary: 'FYP writing',
      startsAt: '2026-09-11T09:00:00',
      endsAt: '2026-09-11T11:00:00',
    },
  ]

  it('sends the events and the zone they are meant in', async () => {
    const fetched = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ created: 1, updated: 0, removed: 0 }),
    })
    vi.stubGlobal('fetch', fetched)

    expect(await pushCalendar(events, 'Asia/Kuala_Lumpur')).toEqual({
      created: 1,
      updated: 0,
      removed: 0,
    })

    const [url, options] = fetched.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/google-push')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body as string)).toEqual({
      events,
      timeZone: 'Asia/Kuala_Lumpur',
    })
  })

  it('never asks Google directly, only this app', async () => {
    const fetched = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetched)

    await pushCalendar(events, 'UTC')

    const [url] = fetched.mock.calls[0] as [string]
    expect(url).not.toMatch(/googleapis|google\.com/)
  })

  /** A failed write must not report a written week. Somebody told their calendar is up to
   *  date, whose calendar is not, has no reason to look again. */
  it('throws rather than claiming a week was written', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    await expect(pushCalendar(events, 'UTC')).rejects.toThrow()
  })

  it('refuses for somebody who is not signed in', async () => {
    token.mockResolvedValue(null)
    const fetched = vi.fn()
    vi.stubGlobal('fetch', fetched)

    await expect(pushCalendar(events, 'UTC')).rejects.toThrow()
    expect(fetched).not.toHaveBeenCalled()
  })

  /** Counts absent from the reply read as nothing done, rather than as `undefined` reaching
   *  a sentence the student is shown. */
  it('reads a reply with no counts as nothing written', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))

    expect(await pushCalendar(events, 'UTC')).toEqual({ created: 0, updated: 0, removed: 0 })
  })
})

/**
 * Ruling 63: connecting a calendar has to say what happened.
 *
 * `beginConnect` threw on a refused request and returned silently when there was no token,
 * and `AddSheet` called it as `void beginConnect()` -- so a student pressing Connect either
 * saw nothing happen at all, or got `Uncaught (in promise) Error: could not begin` in a
 * console they will never open. Both are the same failure: the one person who needs to know
 * is the one not told.
 */
describe('what beginConnect says when it cannot', () => {
  it('says so rather than throwing when the endpoint refuses', async () => {
    token.mockResolvedValue('a-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))

    const outcome = await beginConnect()

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason.length).toBeGreaterThan(0)
    expect(assign).not.toHaveBeenCalled()
  })

  /** A 401 is the one failure with a specific answer: sign in. Saying "something went
   *  wrong" to somebody who simply is not signed in wastes their time. */
  it('names signing in when that is the actual problem', async () => {
    token.mockResolvedValue('a-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))

    const outcome = await beginConnect()

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toMatch(/sign in/i)
  })

  /** Signed out, the fetch never happens -- and that silence was the worse bug, because
   *  nothing at all appeared to occur. */
  it('says to sign in when there is no session to ask with', async () => {
    token.mockResolvedValue(null)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const outcome = await beginConnect()

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toMatch(/sign in/i)
    expect(fetchSpy, 'nothing to ask with, so nothing was asked').not.toHaveBeenCalled()
  })

  it('says so when the endpoint answers without a destination', async () => {
    token.mockResolvedValue('a-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))

    const outcome = await beginConnect()

    expect(outcome.ok).toBe(false)
    expect(assign).not.toHaveBeenCalled()
  })

  it('reports success when it is sending the student onward', async () => {
    token.mockResolvedValue('a-token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://accounts.google.com/x' }) }),
    )

    const outcome = await beginConnect()

    expect(outcome.ok).toBe(true)
  })
})

/**
 * A refusal the student can act on, rather than one sentence for every failure.
 *
 * `readCalendar` threw a bare Error on any non-ok response and the screen turned it into "I
 * could not read your calendar just now. Try again in a moment." That is right for Google
 * being briefly unwell and wrong for the two failures where trying again is not what fixes
 * it: a grant that does not carry the scope, and a deployment whose Calendar API was never
 * switched on. The endpoint names those now, and the name has to survive the trip.
 */
describe('what readCalendar says when it cannot read', () => {
  it('carries the endpoint sentence through to the caller', async () => {
    token.mockResolvedValue('session-token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ message: 'Disconnect it in Settings and connect it again.' }),
      }),
    )

    await expect(readCalendar(week())).rejects.toThrow(
      'Disconnect it in Settings and connect it again.',
    )
  })

  /** No sentence means the fault may simply pass, and the screen's own "try again in a
   *  moment" is the truth. Inventing a specific reason here would be worse than silence. */
  it('says nothing specific when the endpoint offered nothing', async () => {
    token.mockResolvedValue('session-token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) }),
    )

    await expect(readCalendar(week())).rejects.toThrow('could not read calendar')
  })

  /** A body that is not JSON at all -- an HTML error page from something in front of the
   *  function -- must not become the error the student reads. */
  it('survives a response that is not JSON', async () => {
    token.mockResolvedValue('session-token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('not json')
        },
      }),
    )

    await expect(readCalendar(week())).rejects.toThrow('could not read calendar')
  })
})
