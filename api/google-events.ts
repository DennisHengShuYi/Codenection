import { createClient } from '@supabase/supabase-js'
import { HORIZON_DAYS } from '../src/engine'
import { unseal } from '../src/google/secretBox'
import { readServiceRoleKey, readSupabasePair, readSupabaseUrl } from '../src/data/serverEnv'
import { bearerFrom, callerFrom } from '../src/data/sessionCheck'

/** Declared rather than inferred, matching the other endpoints. */
export const config = { runtime: 'edge' }

/**
 * The student's own calendar events for the fortnight, and nothing else.
 *
 * The browser is never given a Google token. It asks here; this exchanges the stored refresh
 * token for a short-lived access token, fetches, and hands back the raw events. A token in
 * the browser is a token in every extension the student has installed and in every copy of
 * their session storage -- which is the whole reason the credential lives server-side.
 *
 * What an event *means* is decided in `src/google/events.ts`, which is pure and unit-tested.
 * This file only fetches, so there is no second place that could disagree about what a
 * calendar row turns into.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

/** More than a fortnight holds, so a runaway calendar cannot become a runaway response.
 *  Google's own maximum is far higher. */
const MAX_EVENTS = 250

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })

  // Read as a pair, never a URL from one place and a key from another: see
  // `readSupabasePair` for what that mismatch costs -- a signed-in student told to
  // sign in, with nothing anywhere saying the deployment is misconfigured.
  const env = process.env as Record<string, string | undefined>
  const pair = readSupabasePair(env)
  const supabaseUrl = readSupabaseUrl(env)
  const anonKey = pair?.anonKey
  const serviceRoleKey = readServiceRoleKey(env)
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const tokenKey = process.env.GOOGLE_TOKEN_KEY

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !clientId || !clientSecret || !tokenKey) {
    return new Response('Calendar reading is not available here.', { status: 503 })
  }

  // The token, not the header: a global `authorization` does not replace the
  // `Authorization` supabase-js writes for the anon key, so both went out on one line
  // and every session was refused. See `bearerFrom`.
  const sessionToken = bearerFrom(request.headers.get('authorization'))
  if (sessionToken === null) return new Response('Sign in first.', { status: 401 })

  // Verified against Supabase rather than decoded here: a token this endpoint parses itself
  // is one whose signature it also has to check, and getting that subtly wrong is how an
  // endpoint ends up trusting anything anyone mints.
  const asUser = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: who, error: refusal } = await asUser.auth.getUser(sessionToken)

  // Kept rather than discarded: Supabase refuses a bad session and a key that does not
  // belong to this project with the same 401, and only one of those is the student's to
  // fix. See `data/sessionCheck.ts`.
  if (refusal) console.warn('google-events: could not verify a session --', refusal.message)

  const caller = callerFrom(who.user?.id, refusal)
  if (!caller.verifiable) {
    return new Response('Calendar is not available on this deployment.', { status: 503 })
  }
  const accountId = caller.accountId
  if (accountId === null) return new Response('Sign in first.', { status: 401 })

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

  // Unopenable means the key has rotated or the row is corrupt. Either way the connection
  // cannot be used, and the student reconnects -- which is a safe failure and a stated one.
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

  // Google has stopped honouring the grant -- most often because the student revoked it at
  // their end, which they are entitled to do without telling us.
  if (!refreshed.ok) return new Response('Reconnect your calendar.', { status: 409 })

  const { access_token: accessToken } = (await refreshed.json()) as { access_token?: unknown }
  if (typeof accessToken !== 'string') return new Response('Reconnect your calendar.', { status: 409 })

  /**
   * Asked for by date range, rather than fetched wholesale and filtered here.
   *
   * The fortnight is the only part of a calendar this app has any business reading, and
   * asking Google for exactly that means the rest never crosses the network at all. Reading
   * somebody's whole year to throw most of it away would be a worse thing to do even though
   * the visible result is identical.
   */
  const from = new Date()
  const to = new Date(from.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000)

  const events = await fetch(
    `${EVENTS_ENDPOINT}?${new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      // Expanded by Google, so a weekly class arrives as the instances it actually has --
      // no rule to interpret and no chance of interpreting it differently from Google.
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: String(MAX_EVENTS),
    })}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  )

  if (!events.ok) return new Response('Could not read your calendar.', { status: 502 })

  const body = (await events.json()) as { items?: unknown }

  // Handed back raw. `src/google/events.ts` decides what any of it means, and it is pure and
  // tested; deciding here too would be a second opinion nothing keeps in step.
  return new Response(JSON.stringify({ events: Array.isArray(body.items) ? body.items : [] }), {
    headers: { 'content-type': 'application/json' },
  })
}
