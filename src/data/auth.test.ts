import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSession, onSessionChange, register, signIn, signOut } from './auth'

const stub = {
  signUpResult: {} as Record<string, unknown>,
  signInResult: {} as Record<string, unknown>,
  sessionResult: {} as Record<string, unknown>,
  signOuts: 0,
  listeners: [] as Array<(event: string, session: unknown) => void>,
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signUp: () => Promise.resolve(stub.signUpResult),
      signInWithPassword: () => Promise.resolve(stub.signInResult),
      signOut: () => {
        stub.signOuts += 1
        return Promise.resolve({ error: null })
      },
      getSession: () => Promise.resolve(stub.sessionResult),
      onAuthStateChange: (listener: (event: string, session: unknown) => void) => {
        stub.listeners.push(listener)
        return { data: { subscription: { unsubscribe: () => undefined } } }
      },
    },
  }),
}))

// The auth module reads its configuration from the environment, which the test config
// blanks. Supplied here so these tests exercise the real code path rather than the
// "not configured" short circuit.
vi.mock('./env', () => ({
  readDataConfig: () => ({
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon-key',
  }),
}))

const user = { id: 'user-1', email: 'a@b.com' }

beforeEach(() => {
  stub.signUpResult = { data: { user, session: { user } }, error: null }
  stub.signInResult = { data: { user, session: { user } }, error: null }
  stub.sessionResult = { data: { session: null }, error: null }
  stub.signOuts = 0
  stub.listeners = []
})

describe('register', () => {
  it('returns the new session on success', async () => {
    expect(await register('a@b.com', 'longenough')).toEqual({
      ok: true,
      session: { userId: 'user-1', email: 'a@b.com' },
    })
  })

  /**
   * Supabase returns a user but no session when email confirmation is switched on.
   * Reporting that as success would drop somebody onto a sign-in screen that rejects the
   * account they just made, with no clue why.
   */
  it('explains that the address needs confirming when no session comes back', async () => {
    stub.signUpResult = { data: { user, session: null }, error: null }

    const result = await register('a@b.com', 'longenough')

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/confirm/i)
  })

  it('reports an address that already has an account', async () => {
    stub.signUpResult = { data: {}, error: { message: 'User already registered' } }

    const result = await register('a@b.com', 'longenough')

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/already/i)
  })

  // Caught before the request goes out, so an obvious mistake is answered instantly
  // rather than after a network wait.
  it('rejects a password that is too short without calling out', async () => {
    const result = await register('a@b.com', 'short')

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/at least/i)
  })

  it('rejects something that is not an email address', async () => {
    const result = await register('not-an-email', 'longenough')

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/email/i)
  })
})

describe('signIn', () => {
  it('returns the session on success', async () => {
    expect(await signIn('a@b.com', 'longenough')).toEqual({
      ok: true,
      session: { userId: 'user-1', email: 'a@b.com' },
    })
  })

  /**
   * A wrong password and an unconfirmed address need different actions -- "try again"
   * versus "go and check your email" -- so they must not collapse into one message.
   */
  it('reports wrong credentials in words a person can act on', async () => {
    stub.signInResult = { data: {}, error: { message: 'Invalid login credentials' } }

    const result = await signIn('a@b.com', 'wrongpass')

    expect(result.ok === false && result.message).toMatch(/email or password/i)
  })

  it('reports an unconfirmed address distinctly from a wrong password', async () => {
    stub.signInResult = { data: {}, error: { message: 'Email not confirmed' } }

    const result = await signIn('a@b.com', 'longenough')

    expect(result.ok === false && result.message).toMatch(/confirm/i)
  })
})

describe('getSession', () => {
  it('returns null when nobody is signed in', async () => {
    expect(await getSession()).toBeNull()
  })

  it('returns the stored session when there is one', async () => {
    stub.sessionResult = { data: { session: { user } }, error: null }

    expect(await getSession()).toEqual({ userId: 'user-1', email: 'a@b.com' })
  })

  // A blip must not crash the app. The cost is that a signed-in student could be shown
  // the preview for a moment, which is better than an error screen on a flaky
  // connection.
  it('returns null rather than throwing when the lookup fails', async () => {
    stub.sessionResult = { data: { session: null }, error: { message: 'network down' } }

    expect(await getSession()).toBeNull()
  })
})

describe('signOut', () => {
  it('signs out', async () => {
    await signOut()

    expect(stub.signOuts).toBe(1)
  })
})

describe('onSessionChange', () => {
  // Signing out in one tab must not leave another holding a stale session and writing to
  // a store it no longer has access to.
  it('reports a sign-in that happened elsewhere', async () => {
    const seen: Array<{ userId: string; email: string } | null> = []
    onSessionChange((session) => seen.push(session))
    await Promise.resolve()

    stub.listeners.forEach((notify) => notify('SIGNED_IN', { user }))

    expect(seen).toEqual([{ userId: 'user-1', email: 'a@b.com' }])
  })

  it('reports a sign-out that happened elsewhere', async () => {
    const seen: Array<unknown> = []
    onSessionChange((session) => seen.push(session))
    await Promise.resolve()

    stub.listeners.forEach((notify) => notify('SIGNED_OUT', null))

    expect(seen).toEqual([null])
  })

  it('returns a function that stops listening', () => {
    expect(typeof onSessionChange(() => undefined)).toBe('function')
  })
})
