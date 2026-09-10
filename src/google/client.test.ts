import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { beginConnect, disconnectCalendar, readCalendar } from './client'

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

  it('goes nowhere when the endpoint cannot start the flow', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    await expect(beginConnect()).rejects.toThrow()
    expect(assign).not.toHaveBeenCalled()
  })

  /** A reply without a URL must not become a navigation to `undefined`. */
  it('goes nowhere when the endpoint answers without a destination', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))

    await expect(beginConnect()).rejects.toThrow()
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
