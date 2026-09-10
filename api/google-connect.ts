import { createClient } from '@supabase/supabase-js'
import { CALENDAR_SCOPES, consentUrl } from '../src/google/authUrl'
import { checkCallback, checkStart, type GoogleConfig } from '../src/google/guard'
import { seal } from '../src/google/secretBox'
import { readState, signState } from '../src/google/state'

/** Declared rather than inferred, matching the other endpoints: the two runtimes take
 *  different handler signatures and the wrong one fails only once deployed. */
export const config = { runtime: 'edge' }

/**
 * §1.4's optional calendar supplement: both halves of the OAuth round trip.
 *
 * One file rather than two, because the two halves share a configuration and a redirect URI
 * that must match byte for byte on both sides -- splitting them is how those drift apart.
 * `?begin=1` starts the flow; anything else is Google returning with a code.
 *
 * This is the third place in the product that reads a credential, and the only one that
 * reads `GOOGLE_CLIENT_SECRET` or `GOOGLE_TOKEN_KEY`. Nothing under `src/` reads either, so
 * neither can reach the browser bundle even by accident -- the same containment
 * `api/plan.ts` documents for `GROQ_API_KEY`, and the reason none of these carry a `VITE_`
 * prefix.
 *
 * Every decision it makes lives in `src/google/`, where the unit suite can reach it. What is
 * left here is the plumbing: an HTTP exchange and one upsert.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

const settings = (): GoogleConfig => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  tokenKey: process.env.GOOGLE_TOKEN_KEY,
  stateSecret: process.env.GOOGLE_STATE_SECRET,
})

/** Where Google is told to return. Derived from the request rather than configured, so a
 *  phone that began the flow is not sent back to somebody's laptop dev server. */
const redirectUriFor = (request: Request): string =>
  `${new URL(request.url).origin}/api/google-connect`

/**
 * Who is asking, from the Supabase session they present.
 *
 * Verified against Supabase rather than decoded here: a JWT this endpoint parsed itself is a
 * JWT it also has to check the signature of, and getting that subtly wrong is how an
 * endpoint ends up trusting a token anyone can mint.
 */
async function accountFrom(request: Request, supabaseUrl: string, anonKey: string): Promise<string | null> {
  const authorization = request.headers.get('authorization')
  if (authorization === null) return null

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data } = await client.auth.getUser()

  return data.user?.id ?? null
}

/** A page rather than a bare status, because a student lands on this in their browser after
 *  a redirect and a blank 400 tells them nothing about what to do next. */
const say = (message: string, status: number): Response =>
  new Response(
    `<!doctype html><meta charset="utf-8"><title>Calendar</title>` +
      `<p style="font:16px system-ui;margin:3rem auto;max-width:32rem">${message}</p>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )

export default async function handler(request: Request): Promise<Response> {
  const google = settings()
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const url = new URL(request.url)

  // ---- Beginning: send the student to Google, carrying a state we can check on the way back.
  if (url.searchParams.get('begin') === '1') {
    if (!supabaseUrl || !anonKey) return say('Calendar connection is not available here.', 503)

    const accountId = await accountFrom(request, supabaseUrl, anonKey)
    const allowed = checkStart({ method: request.method, accountId }, google)
    if (!allowed.ok) return say(allowed.body, allowed.status)

    const state = await signState(accountId as string, google.stateSecret as string)

    // Answered as JSON rather than a 302, so the caller can reach this with an
    // `Authorization` header. A redirect would mean the browser navigating here directly,
    // and a navigation carries no headers -- which would force the session token into the
    // query string, where it lands in logs, history and any `Referer` sent onward.
    return new Response(
      JSON.stringify({
        url: consentUrl({
          clientId: google.clientId as string,
          redirectUri: redirectUriFor(request),
          state,
        }),
      }),
      { headers: { 'content-type': 'application/json' } },
    )
  }

  // ---- Returning: Google has sent a code back, or said the student declined.
  const allowed = checkCallback(
    {
      method: request.method,
      code: url.searchParams.get('code'),
      error: url.searchParams.get('error'),
    },
    google,
  )
  if (!allowed.ok) return say(allowed.body, allowed.status)

  if (!supabaseUrl || !serviceRoleKey) return say('Calendar connection is not available here.', 503)

  // The account comes from the signed state, never from anything in the query a caller
  // chose. This is what stops somebody completing a connection to *their* Google account
  // against *somebody else's* row.
  const accountId = await readState(
    url.searchParams.get('state') ?? '',
    google.stateSecret as string,
  )
  if (accountId === null) return say('That calendar link has expired. Try connecting again.', 400)

  const exchanged = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: url.searchParams.get('code') as string,
      client_id: google.clientId as string,
      client_secret: google.clientSecret as string,
      redirect_uri: redirectUriFor(request),
      grant_type: 'authorization_code',
    }),
  })

  if (!exchanged.ok) return say('Google would not complete the connection. Try again.', 502)

  const tokens = (await exchanged.json()) as { refresh_token?: unknown; scope?: unknown }

  /**
   * No refresh token means Google granted access only for this hour, which happens when a
   * student has connected before and `prompt=consent` did not take. Storing the row anyway
   * would leave a connection that appears healthy and stops working silently, so this is
   * refused with something the student can act on.
   */
  if (typeof tokens.refresh_token !== 'string') {
    return say(
      'Google did not return a lasting connection. Remove this app at ' +
        'myaccount.google.com/permissions and connect again.',
      502,
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error } = await admin.from('google_credentials').upsert(
    {
      account_id: accountId,
      // Encrypted before it touches the table. See `secretBox.ts` for why the database's
      // own encryption is not enough on its own.
      refresh_token_sealed: await seal(tokens.refresh_token, google.tokenKey as string),
      scopes: typeof tokens.scope === 'string' ? tokens.scope : CALENDAR_SCOPES.join(' '),
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'account_id' },
  )

  // Said rather than swallowed. Migration 0007 is not applied automatically, so on an
  // unmigrated deployment every write here fails -- and a student told "connected" who is
  // not would find out only when the import came back empty.
  if (error) return say('Your calendar could not be saved. Nothing was connected.', 500)

  return Response.redirect(`${url.origin}/add/calendar`, 302)
}
