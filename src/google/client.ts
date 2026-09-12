import type { ParsedItem } from '../ai'
import { getAccessToken } from '../data/auth'
import type { Schedule } from '../optimizer'
import { readEvents } from './events'
import type { PushEvent } from './push'

/**
 * What the browser does about calendars, kept away from what the endpoints do.
 *
 * The browser never sees a Google token. It asks our own endpoint, which holds the refresh
 * token, exchanges it for a short-lived access token and does the reading. That indirection
 * is the whole point: a token in the browser is a token in every extension the student has
 * installed, and in every copy of their session storage.
 */

/** Where the connect flow begins. `?begin=1` is the start half; Google returns to the same
 *  address without it. See `api/google-connect.ts` for why both live in one file. */
export const CONNECT_PATH = '/api/google-connect?begin=1'

/**
 * Sends the student to Google.
 *
 * Two steps rather than one navigation, and the reason is worth stating: a navigation
 * carries no headers, so a single hop would have to put the student's session token in the
 * query string -- where it lands in server logs, browser history and any `Referer` sent
 * onward. So the token goes in a header on a fetch, the endpoint answers with the consent
 * URL, and the browser navigates to that.
 *
 * The navigation itself is a real one rather than a popup: Google's consent screen has to be
 * seen in a genuine address bar, which is what lets somebody check the domain before handing
 * over access to their calendar.
 */
/** What happened, in words a student can be shown (Ruling 63). */
export type ConnectOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: string }

const SIGN_IN_FIRST =
  'Connecting a calendar needs an account — sign in from Settings first, then try again.'
const UNAVAILABLE =
  'I could not reach the calendar service just now. Try again in a moment.'
/** A deployment whose calendar half is not configured, or whose Supabase pair cannot verify
 *  anybody. "Try again in a moment" would be a lie: trying again is not what fixes it. */
const NOT_ON_THIS_DEPLOYMENT =
  'Calendars are not set up on this version of the app, so there is nothing to connect to yet.'

/**
 * Starts the consent flow, and says what happened when it cannot.
 *
 * It used to throw on a refused request and return silently with no session -- and its one
 * caller discarded the promise, so a student pressing Connect either saw nothing happen or
 * got `Uncaught (in promise) Error: could not begin` in a console they will never open.
 * Both were the same failure: the one person who needed to know was the one not told.
 *
 * A 401 is the only failure with a specific answer, so it gets one. "Something went wrong"
 * to somebody who is simply not signed in wastes their time.
 */
export async function beginConnect(): Promise<ConnectOutcome> {
  const token = await getAccessToken()
  if (token === null) return { ok: false, reason: SIGN_IN_FIRST }

  const response = await fetch(CONNECT_PATH, {
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => null)

  if (response === null) return { ok: false, reason: UNAVAILABLE }
  if (response.status === 401) return { ok: false, reason: SIGN_IN_FIRST }
  // 503 is this app's word for "configured nowhere near here" -- the endpoints answer it for
  // a missing Google secret and for a Supabase pair that cannot verify a session, and both
  // are states no student can press their way out of.
  if (response.status === 503) return { ok: false, reason: NOT_ON_THIS_DEPLOYMENT }
  if (!response.ok) return { ok: false, reason: UNAVAILABLE }

  const { url } = (await response.json().catch(() => ({}))) as { url?: unknown }
  if (typeof url !== 'string') return { ok: false, reason: UNAVAILABLE }

  window.location.assign(url)

  return { ok: true }
}

export interface CalendarImport {
  readonly items: readonly ParsedItem[]
  /** How many were outside the fortnight, so the screen can say so rather than leaving a
   *  student wondering where the rest of their calendar went. */
  readonly skipped: number
}

/**
 * Reads the fortnight.
 *
 * Throws on any failure, which the screen turns into one human sentence. The distinctions --
 * a dead network, a grant Google has stopped honouring, an unmigrated database -- are all
 * the same thing to a student and all recoverable by trying again.
 */
export async function readCalendar(schedule: Schedule): Promise<CalendarImport> {
  const token = await getAccessToken()
  if (token === null) throw new Error('not signed in')

  const response = await fetch('/api/google-events', {
    headers: { authorization: `Bearer ${token}` },
  })

  /*
   * The endpoint's own sentence where it has one.
   *
   * Every failure used to be a bare `Error`, and the screen turned it into "try again in a
   * moment" -- right for Google being briefly unwell, wrong for the two failures where
   * trying again is not what fixes it. `api/google-events.ts` names those now; this is what
   * lets the name reach the person who pressed the button rather than dying here.
   *
   * Nothing invented where nothing was offered. A fault that may simply pass keeps the
   * screen's own sentence, which is the honest answer for it.
   */
  if (!response.ok) {
    const said = (await response.json().catch(() => null)) as { message?: unknown } | null

    throw new Error(
      typeof said?.message === 'string' && said.message !== ''
        ? said.message
        : 'could not read calendar',
    )
  }

  const body = (await response.json()) as { events?: unknown }
  const events = Array.isArray(body.events) ? body.events : []

  // Parsed in the browser, deliberately. `readEvents` is pure and unit-tested, and running
  // it here means the endpoint stays a fetch with a credential rather than a second place
  // that decides what a calendar event means.
  const items = readEvents(events, schedule)

  return { items, skipped: Math.max(0, events.length - items.length) }
}

/** Withdraws the grant: revoked at Google, then forgotten here. See
 *  `api/google-disconnect.ts` for why that order. */
export async function disconnectCalendar(): Promise<boolean> {
  const token = await getAccessToken()
  if (token === null) return false

  const response = await fetch('/api/google-disconnect', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })

  return response.ok
}

/** What the push actually did, as counts the week screen can say back in one sentence. */
export interface PushResult {
  readonly created: number
  readonly updated: number
  readonly removed: number
}

const countOf = (value: unknown): number => (typeof value === 'number' ? value : 0)

/**
 * Writes the week to the student's Codenection calendar.
 *
 * The finished events go over the wire, not the week: `plannedEvents` decides what a week
 * means in a calendar, it is pure and tested, and it is the same function that produced the
 * summary the student read before pressing the button. An endpoint that worked it out again
 * would be a second opinion nothing keeps in step.
 *
 * The zone comes from the browser because the browser is the only thing that knows it. The
 * app's model has no timezone in it at all -- a block at 9 means 9 where the student is.
 *
 * Throws on any failure. Reporting a written week that was not written leaves somebody with
 * no reason to look again.
 */
export async function pushCalendar(
  events: readonly PushEvent[],
  timeZone: string,
): Promise<PushResult> {
  const token = await getAccessToken()
  if (token === null) throw new Error('not signed in')

  const response = await fetch('/api/google-push', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ events, timeZone }),
  })

  if (!response.ok) throw new Error('could not write calendar')

  const body = (await response.json()) as Record<string, unknown>

  return {
    created: countOf(body.created),
    updated: countOf(body.updated),
    removed: countOf(body.removed),
  }
}
