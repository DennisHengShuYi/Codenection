import type { ParsedItem } from '../ai'
import { getAccessToken } from '../data/auth'
import type { Schedule } from '../optimizer'
import { readEvents } from './events'

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
export async function beginConnect(): Promise<void> {
  const token = await getAccessToken()
  if (token === null) return

  const response = await fetch(CONNECT_PATH, { headers: { authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error('could not begin')

  const { url } = (await response.json()) as { url?: unknown }
  if (typeof url !== 'string') throw new Error('could not begin')

  window.location.assign(url)
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

  if (!response.ok) throw new Error('could not read calendar')

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
