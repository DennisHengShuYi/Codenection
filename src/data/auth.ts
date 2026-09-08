import type { SupabaseClient, User } from '@supabase/supabase-js'
import { readDataConfig } from './env'
import {
  explainAuthError,
  MIN_PASSWORD_LENGTH,
  type AuthOutcome,
  type Session,
} from './session'

/** Lazily imported and memoised for the same reason as the repository's client: it is
 *  ~220KB, and a signed-out visitor running on browser storage never needs it. */
let clientPromise: Promise<SupabaseClient> | null = null

function getClient(): Promise<SupabaseClient> {
  const { supabaseUrl, supabaseAnonKey } = readDataConfig()

  if (supabaseUrl === null || supabaseAnonKey === null) {
    return Promise.reject(new Error('Supabase is not configured'))
  }

  clientPromise ??= import('@supabase/supabase-js').then((module) =>
    module.createClient(supabaseUrl, supabaseAnonKey),
  )

  return clientPromise
}

const toSession = (user: Pick<User, 'id' | 'email'> | null | undefined): Session | null =>
  user ? { userId: user.id, email: user.email ?? '' } : null

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
