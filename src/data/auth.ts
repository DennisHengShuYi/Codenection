import type { SupabaseClient, User } from '@supabase/supabase-js'
import { readDataConfig } from './env'
import { getSharedClient } from './supabaseClient'
import {
  explainAuthError,
  MIN_PASSWORD_LENGTH,
  type AuthOutcome,
  type Session,
} from './session'

/**
 * Exported so that every module needing the *signed-in* client shares this one.
 *
 * The construction itself lives in supabaseClient, and deliberately not here: a memo per
 * module is not the same thing as one client. Storage keeps its own module, but it talks to
 * the same project and therefore the same `sb-<ref>-auth-token` key, and two clients on one
 * key is exactly what the browser warns about -- "Multiple GoTrueClient instances detected
 * in the same browser context" -- however tidily each was memoised.
 *
 * The configuration is read here rather than passed in because authentication has no caller
 * that would know it; the repository does, so it supplies its own.
 */
export function getClient(): Promise<SupabaseClient> {
  const { supabaseUrl, supabaseAnonKey } = readDataConfig()

  if (supabaseUrl === null || supabaseAnonKey === null) {
    return Promise.reject(new Error('Supabase is not configured'))
  }

  return getSharedClient(supabaseUrl, supabaseAnonKey)
}

/** Blank and non-string metadata are both treated as absent. An empty name would render as
 *  a gap where a name should be, which reads as a bug rather than as an account without
 *  one. */
const text = (value: unknown): string | undefined => {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed === '' ? undefined : trimmed
}

type AuthUser = Pick<User, 'id' | 'email'> & { user_metadata?: Record<string, unknown> }

/**
 * The single place a Session is built, so whatever it reads here is what every route in
 * gets -- email and password, Google, or a session restored on a later visit.
 *
 * Two keys are checked for each of the name and the picture. Supabase normalises most
 * providers into `full_name` and `avatar_url`, but `name` and `picture` are the raw OAuth
 * claims some send instead, and assuming one is how an avatar silently disappears.
 */
const toSession = (user: AuthUser | null | undefined): Session | null =>
  user
    ? {
        userId: user.id,
        email: user.email ?? '',
        name: text(user.user_metadata?.full_name) ?? text(user.user_metadata?.name),
        avatarUrl: text(user.user_metadata?.avatar_url) ?? text(user.user_metadata?.picture),
      }
    : null

/** Checked before the round trip, so an obvious mistake is answered instantly rather than
 *  after a network wait. */
function validate(email: string, password: string): string | null {
  if (!email.includes('@') || email.trim().length < 3) {
    return 'That does not look like an email address.'
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Your password needs to be at least ${MIN_PASSWORD_LENGTH} characters.`
  }

  return null
}

export async function register(email: string, password: string): Promise<AuthOutcome> {
  const invalid = validate(email, password)
  if (invalid !== null) return { ok: false, message: invalid }

  const client = await getClient()
  const { data, error } = await client.auth.signUp({ email, password })

  if (error) return { ok: false, message: explainAuthError(error.message) }

  // Supabase returns a user but no session when email confirmation is switched on.
  // Reporting that as success would drop somebody onto a sign-in screen that rejects the
  // account they just made, with no clue why.
  if (!data.session) {
    return {
      ok: false,
      message: 'Account created. Check your inbox to confirm your email address, then sign in.',
    }
  }

  const session = toSession(data.user)
  return session ? { ok: true, session } : { ok: false, message: 'Could not create the account.' }
}

export async function signIn(email: string, password: string): Promise<AuthOutcome> {
  const invalid = validate(email, password)
  if (invalid !== null) return { ok: false, message: invalid }

  const client = await getClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })

  if (error) return { ok: false, message: explainAuthError(error.message) }

  const session = toSession(data.user)
  return session ? { ok: true, session } : { ok: false, message: 'Could not sign in.' }
}

/**
 * Starts a Google sign-in.
 *
 * There is no session to return: on success the browser leaves for Google's consent page
 * and the student comes back through the redirect, where `onSessionChange` picks the new
 * session up. So this reports only whether the hand-off began.
 *
 * A missing configuration rejects rather than returning a failure, exactly as `signIn` and
 * `register` do -- that is a build without a backend, not something a student did wrong,
 * and the screen hides the button entirely in that state.
 */
export async function signInWithGoogle(): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = await getClient()

  try {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      // Read from wherever the app is actually running. Hard-coding it would send a phone
      // that started the sign-in back to a laptop's development server.
      options: { redirectTo: `${window.location.origin}/` },
    })

    if (error) return { ok: false, message: explainAuthError(error.message) }

    return { ok: true }
  } catch {
    // A thrown error here must not escape into the screen as an unhandled rejection: the
    // button would spin forever with nothing said about why.
    return {
      ok: false,
      message: 'Could not reach Google sign-in. Check your connection and try again.',
    }
  }
}

export async function signOut(): Promise<void> {
  const client = await getClient()
  await client.auth.signOut()
}

/**
 * Null rather than throwing on failure.
 *
 * A deliberate, arguable trade: a blip reading the session must not crash the app, but it
 * does mean a signed-in student could momentarily be shown the preview. The alternative
 * -- an error screen on every flaky connection -- is worse.
 */
export async function getSession(): Promise<Session | null> {
  try {
    const client = await getClient()
    const { data, error } = await client.auth.getSession()

    if (error) return null
    return toSession(data.session?.user)
  } catch {
    return null
  }
}

/** Sign-ins and sign-outs that happen in another tab. Without this, signing out in one
 *  place leaves another tab holding a stale session and writing to a store it no longer
 *  has access to. */
export function onSessionChange(listener: (session: Session | null) => void): () => void {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  void getClient()
    .then((client) => {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(toSession(session?.user))
      })

      if (cancelled) data.subscription.unsubscribe()
      else unsubscribe = () => data.subscription.unsubscribe()
    })
    .catch(() => undefined)

  return () => {
    cancelled = true
    unsubscribe?.()
  }
}
