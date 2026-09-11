import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAccessToken,
  getSession,
  onSessionChange,
  register,
  signIn,
  signInWithGoogle,
  signOut,
} from './auth'

const stub = {
  signUpResult: {} as Record<string, unknown>,
  signInResult: {} as Record<string, unknown>,
  sessionResult: {} as Record<string, unknown>,
  oauthResult: {} as Record<string, unknown>,
  /** Nothing navigates in a test. What is recorded is the argument, so the assertions can
   *  ask whether the right provider and the right return address were requested. */
  oauthCalls: [] as Array<Record<string, unknown>>,
  oauthThrows: false,
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
      signInWithOAuth: (options: Record<string, unknown>) => {
        stub.oauthCalls.push(options)
        if (stub.oauthThrows) return Promise.reject(new Error('network down'))
        return Promise.resolve(stub.oauthResult)
      },
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
  stub.oauthResult = { data: { provider: 'google', url: 'https://accounts.google.com/...' }, error: null }
  stub.oauthCalls = []
  stub.oauthThrows = false
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

describe('signInWithGoogle', () => {
  it('asks Supabase for Google, and reports that the hand-off started', async () => {
    const result = await signInWithGoogle()

    expect(result).toEqual({ ok: true })
    expect(stub.oauthCalls).toHaveLength(1)
    expect(stub.oauthCalls[0]?.provider).toBe('google')
  })

  /**
   * The return address is read from wherever the app is actually running. Hard-coding it
   * would send a phone that started the sign-in back to a laptop's development server --
   * the student would approve at Google and land nowhere.
   */
  it('sends the student back to the address they started from', async () => {
    await signInWithGoogle()

    const options = stub.oauthCalls[0]?.options as { redirectTo?: string }
    expect(options.redirectTo).toBe(window.location.origin + '/')
  })

  it('reports a refusal in words a student can act on', async () => {
    stub.oauthResult = { data: {}, error: { message: 'Invalid login credentials' } }

    const result = await signInWithGoogle()

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/email or password/i)
  })

  // A thrown error must not escape into the screen as an unhandled rejection: the button
  // would spin forever with nothing said about why.
  it('reports a failure rather than throwing when the call itself blows up', async () => {
    stub.oauthThrows = true

    const result = await signInWithGoogle()

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message.length).toBeGreaterThan(0)
  })
})

/**
 * `toSession` is the single place a Session is built, so what it reads is what every route
 * in gets. These drive it through signIn, which is the shortest way to reach it.
 */
describe('the session that is built from a signed-in user', () => {
  it('carries the name and picture Google supplies', async () => {
    stub.signInResult = {
      data: {
        user: {
          ...user,
          user_metadata: { full_name: 'Ada Lovelace', avatar_url: 'https://pic/ada.jpg' },
        },
      },
      error: null,
    }

    const result = await signIn('a@b.com', 'longenough')

    expect(result.ok === true && result.session).toEqual({
      userId: 'user-1',
      email: 'a@b.com',
      name: 'Ada Lovelace',
      avatarUrl: 'https://pic/ada.jpg',
    })
  })

  // Providers disagree on the key. Supabase normalises most into avatar_url, but the raw
  // OAuth claim is `picture`, and assuming one is how an avatar silently disappears.
  it('finds the picture under the raw provider claim too', async () => {
    stub.signInResult = {
      data: { user: { ...user, user_metadata: { picture: 'https://pic/raw.jpg' } } },
      error: null,
    }

    const result = await signIn('a@b.com', 'longenough')

    expect(result.ok === true && result.session.avatarUrl).toBe('https://pic/raw.jpg')
  })

  it('leaves an email and password account without a name or picture', async () => {
    const result = await signIn('a@b.com', 'longenough')

    expect(result.ok === true && result.session.name).toBeUndefined()
    expect(result.ok === true && result.session.avatarUrl).toBeUndefined()
    expect(result.ok === true && result.session.email).toBe('a@b.com')
  })

  // An empty string would render as a blank space where a name should be, which reads as
  // a bug rather than as an account without a name.
  it('treats empty metadata as having no name or picture', async () => {
    stub.signInResult = {
      data: { user: { ...user, user_metadata: { full_name: '', avatar_url: '' } } },
      error: null,
    }

    const result = await signIn('a@b.com', 'longenough')

    expect(result.ok === true && result.session.name).toBeUndefined()
    expect(result.ok === true && result.session.avatarUrl).toBeUndefined()
  })

  it('still falls back to an empty address when there is no email', async () => {
    stub.signInResult = { data: { user: { id: 'user-1' } }, error: null }

    const result = await signIn('a@b.com', 'longenough')

    expect(result.ok === true && result.session.email).toBe('')
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

/**
 * The session token this app's own endpoints are called with.
 *
 * Never a Google token, and that distinction is the point: the Google credential lives
 * server-side and the browser is deliberately never given it. This is the ordinary Supabase
 * token every authenticated request already carries, exposed so `src/google/client.ts` can
 * put it in a header rather than reaching into Supabase's storage itself.
 */
describe('getAccessToken', () => {
  it('hands back the signed-in session token', async () => {
    stub.sessionResult = { data: { session: { access_token: 'token-abc', user: { id: 'u1' } } } }

    expect(await getAccessToken()).toBe('token-abc')
  })

  /** Nobody signed in is an ordinary state, not a failure: the calendar way in is simply
   *  hidden, because there would be nowhere to store a grant. */
  it('hands back nothing when nobody is signed in', async () => {
    stub.sessionResult = { data: { session: null } }

    expect(await getAccessToken()).toBeNull()
  })

  it('hands back nothing when the session carries no token', async () => {
    stub.sessionResult = { data: { session: { user: { id: 'u1' } } } }

    expect(await getAccessToken()).toBeNull()
  })
})
