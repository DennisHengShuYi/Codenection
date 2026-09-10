import { createClient } from '@supabase/supabase-js'
import { readPushRequest } from '../src/google/guard'
import {
  BLOCK_MARKER,
  CALENDAR_NAME,
  calendarEventBody,
  ourCalendarId,
  pushPlan,
  type ExistingEvent,
  type PushEvent,
} from '../src/google/push'
import { unseal } from '../src/google/secretBox'

/** Declared rather than inferred, matching the other endpoints. */
export const config = { runtime: 'edge' }

/**
 * The week, written out to the student's own Codenection calendar.
 *
 * The safeguard the whole file rests on is that it writes only to a secondary calendar this
 * app created and named itself. It never touches the primary calendar, never touches a
 * shared work or family calendar, and never modifies an event it did not write -- every
 * event it writes carries a marker, and anything without that marker is left alone even
 * inside our own calendar. Switching the feature off is one deletion of one calendar.
 *
 * What to write is decided in `src/google/push.ts`, which is pure and unit-tested, and the
 * payload is validated in `src/google/guard.ts` before any of it is sent. This file does the
 * fetching and nothing else, so there is no second place that could disagree about what a
 * week means in a calendar.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const CALENDARS = 'https://www.googleapis.com/calendar/v3/calendars'
const CALENDAR_LIST = 'https://www.googleapis.com/calendar/v3/users/me/calendarList'

/** More than a fortnight in one calendar holds. Google's own maximum is far higher. */
const MAX_EXISTING = 500

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

/** The dedicated calendar, made if it is not there yet. Null when Google refused, which the
 *  caller turns into one plain sentence rather than a distinction nobody can act on. */
async function findOrCreateCalendar(accessToken: string): Promise<string | null> {
  const listed = await fetch(`${CALENDAR_LIST}?maxResults=250`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })

  if (!listed.ok) return null

  const body = (await listed.json()) as { items?: unknown }
  const found = ourCalendarId(body.items)
  if (found !== null) return found

  const made = await fetch(CALENDARS, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ summary: CALENDAR_NAME }),
  })

  if (!made.ok) return null

  const { id } = (await made.json()) as { id?: unknown }

  return typeof id === 'string' ? id : null
}

/** What we have already written there, each with the block it says it came from. Anything
 *  without our marker comes back with a null block, and is never touched. */
async function readExisting(accessToken: string, calendarId: string): Promise<ExistingEvent[]> {
  const response = await fetch(
    `${CALENDARS}/${encodeURIComponent(calendarId)}/events?${new URLSearchParams({
      maxResults: String(MAX_EXISTING),
      singleEvents: 'true',
    })}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  )

  if (!response.ok) return []

  const body = (await response.json()) as { items?: unknown }
  if (!Array.isArray(body.items)) return []

  return body.items.flatMap((raw): ExistingEvent[] => {
    if (typeof raw !== 'object' || raw === null) return []

    const item = raw as { id?: unknown; extendedProperties?: { private?: Record<string, unknown> } }
    if (typeof item.id !== 'string') return []

    const marked = item.extendedProperties?.private?.[BLOCK_MARKER]

    return [{ id: item.id, blockId: typeof marked === 'string' ? marked : null }]
  })
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const tokenKey = process.env.GOOGLE_TOKEN_KEY

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !clientId || !clientSecret || !tokenKey) {
    return new Response('Calendar writing is not available here.', { status: 503 })
  }

  const authorization = request.headers.get('authorization')
  if (authorization === null) return new Response('Sign in first.', { status: 401 })

  // Checked before the credential is even looked up: an unreadable body is not a reason to
  // go and fetch somebody's Google token.
  const posted = readPushRequest(await request.json().catch(() => null))
  if (!posted.ok) return new Response(posted.body, { status: posted.status })

  // Verified against Supabase rather than decoded here, as `api/google-events.ts` explains.
  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: who } = await asUser.auth.getUser()
  const accountId = who.user?.id
  if (accountId === undefined) return new Response('Sign in first.', { status: 401 })

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: row } = await admin
    .from('google_credentials')
    .select('refresh_token_sealed')
    .eq('account_id', accountId)
    .maybeSingle()

  if (!row) return new Response('No calendar connected.', { status: 409 })

  const refreshToken = await unseal(row.refresh_token_sealed as string, tokenKey)
  if (refreshToken === null) return new Response('Reconnect your calendar.', { status: 409 })

  const refreshed = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  // The student revoked the grant at Google's end, which they are entitled to do without
  // telling us.
  if (!refreshed.ok) return new Response('Reconnect your calendar.', { status: 409 })

  const { access_token: accessToken } = (await refreshed.json()) as { access_token?: unknown }
  if (typeof accessToken !== 'string') {
    return new Response('Reconnect your calendar.', { status: 409 })
  }

  const calendarId = await findOrCreateCalendar(accessToken)
  if (calendarId === null) return new Response('Could not write to your calendar.', { status: 502 })

  const events = posted.events as readonly PushEvent[]
  const plan = pushPlan(events, await readExisting(accessToken, calendarId))

  const at = `${CALENDARS}/${encodeURIComponent(calendarId)}/events`
  const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }

  /**
   * Counted from what actually succeeded, not from what was planned.
   *
   * A partial write is a real outcome -- a rate limit halfway through, a dropped
   * connection -- and reporting the plan's numbers would tell a student their week is in
   * their calendar when a third of it is not.
   */
  let created = 0
  let updated = 0
  let removed = 0

  for (const event of plan.create) {
    const response = await fetch(at, {
      method: 'POST',
      headers,
      body: JSON.stringify(calendarEventBody(event, posted.timeZone)),
    })
    if (response.ok) created += 1
  }

  for (const { id, event } of plan.update) {
    const response = await fetch(`${at}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(calendarEventBody(event, posted.timeZone)),
    })
    if (response.ok) updated += 1
  }

  for (const id of plan.remove) {
    const response = await fetch(`${at}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    // 410 is Google saying it was already gone, which is the outcome asked for.
    if (response.ok || response.status === 410) removed += 1
  }

  return json({ created, updated, removed })
}
