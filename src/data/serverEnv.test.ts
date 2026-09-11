import { describe, expect, it } from 'vitest'
import { readServiceRoleKey, readSupabasePair, readSupabaseUrl } from './serverEnv'

/**
 * The pair an endpoint verifies a student's session with, and why it is read as a pair.
 *
 * Every `api/` route used to take the URL from `SUPABASE_URL ?? VITE_SUPABASE_URL` and the
 * key from `VITE_SUPABASE_ANON_KEY` alone. Those are two different sources, and a deployment
 * that has both -- Vercel's own Supabase integration sets `SUPABASE_URL` and
 * `SUPABASE_ANON_KEY` under those exact names -- ends up checking a token against one
 * project's address with another project's key. Supabase refuses it, `getUser` answers with
 * no user, and the endpoint tells a signed-in student to sign in: the one failure the
 * calendar client's own comment says wastes their time.
 *
 * So a URL and a key are chosen together or not at all.
 */
describe('the Supabase pair an endpoint checks a session with', () => {
  it('takes both halves from the server names when both are set', () => {
    expect(
      readSupabasePair({
        SUPABASE_URL: 'https://server.supabase.co',
        SUPABASE_ANON_KEY: 'server-key',
        VITE_SUPABASE_URL: 'https://browser.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'browser-key',
      }),
    ).toEqual({ url: 'https://server.supabase.co', anonKey: 'server-key' })
  })

  it('takes both halves from the browser names when the server ones are absent', () => {
    expect(
      readSupabasePair({
        VITE_SUPABASE_URL: 'https://browser.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'browser-key',
      }),
    ).toEqual({ url: 'https://browser.supabase.co', anonKey: 'browser-key' })
  })

  /** The regression. A half-filled server configuration must not lend its URL to the
   *  browser's key: that is the mismatch that made every calendar connection fail with
   *  "sign in first" for students who were already signed in. */
  it('never pairs a server URL with a browser key', () => {
    expect(
      readSupabasePair({
        SUPABASE_URL: 'https://server.supabase.co',
        VITE_SUPABASE_URL: 'https://browser.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'browser-key',
      }),
    ).toEqual({ url: 'https://browser.supabase.co', anonKey: 'browser-key' })
  })

  it('never pairs a server key with a browser URL', () => {
    expect(
      readSupabasePair({
        SUPABASE_ANON_KEY: 'server-key',
        VITE_SUPABASE_URL: 'https://browser.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'browser-key',
      }),
    ).toEqual({ url: 'https://browser.supabase.co', anonKey: 'browser-key' })
  })

  /** The browser has trimmed since `data/env.ts` was written; the endpoints never did. A
   *  value pasted into a deployment's settings with a stray space or a wrapped newline is
   *  the ordinary way this happens, and it is silent. */
  it('trims what a paste left around the value', () => {
    expect(
      readSupabasePair({
        VITE_SUPABASE_URL: ' https://browser.supabase.co ',
        VITE_SUPABASE_ANON_KEY: '\nbrowser-key\n',
      }),
    ).toEqual({ url: 'https://browser.supabase.co', anonKey: 'browser-key' })
  })

  it('treats a blank value as absent rather than as a configuration', () => {
    expect(
      readSupabasePair({ VITE_SUPABASE_URL: '   ', VITE_SUPABASE_ANON_KEY: 'browser-key' }),
    ).toBeNull()
  })

  it('answers null when neither pair is complete', () => {
    expect(readSupabasePair({ SUPABASE_URL: 'https://server.supabase.co' })).toBeNull()
    expect(readSupabasePair({})).toBeNull()
  })
})

/**
 * The service-role endpoints hold a key that answers to one project and no session to
 * verify, so they need the address alone -- but they must not drift onto a different
 * project from the one sessions are checked against, or the webhook writes where nothing
 * reads.
 */
describe('the address a service-role endpoint writes to', () => {
  it('follows whichever pair was chosen', () => {
    expect(
      readSupabaseUrl({
        SUPABASE_URL: 'https://server.supabase.co',
        SUPABASE_ANON_KEY: 'server-key',
        VITE_SUPABASE_URL: 'https://browser.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'browser-key',
      }),
    ).toBe('https://server.supabase.co')
  })

  it('falls back to a bare URL for an endpoint that verifies no session', () => {
    expect(readSupabaseUrl({ SUPABASE_URL: ' https://server.supabase.co ' })).toBe(
      'https://server.supabase.co',
    )
    expect(readSupabaseUrl({ VITE_SUPABASE_URL: 'https://browser.supabase.co' })).toBe(
      'https://browser.supabase.co',
    )
  })

  it('answers null when no address is configured at all', () => {
    expect(readSupabaseUrl({})).toBeNull()
  })
})

describe('the service-role key', () => {
  it('is trimmed like every other value a deployment is pasted into', () => {
    expect(readServiceRoleKey({ SUPABASE_SERVICE_ROLE_KEY: ' secret\n' })).toBe('secret')
  })

  it('is absent rather than blank when nothing was set', () => {
    expect(readServiceRoleKey({ SUPABASE_SERVICE_ROLE_KEY: '  ' })).toBeNull()
    expect(readServiceRoleKey({})).toBeNull()
  })
})
