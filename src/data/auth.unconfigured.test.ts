import { describe, expect, it, vi } from 'vitest'
import { getSession, onSessionChange, register, signIn, signInWithGoogle } from './auth'

/**
 * What the auth module does when Supabase is not configured at all.
 *
 * That is the state CI runs in and the state the demo runs in, so these paths are
 * reached far more often than the configured ones -- and a crash here would take the
 * whole app down rather than degrading to browser storage.
 */
vi.mock('./env', () => ({
  readDataConfig: () => ({ supabaseUrl: null, supabaseAnonKey: null }),
}))

describe('auth with no Supabase configured', () => {
  it('reports nobody signed in rather than throwing', async () => {
    expect(await getSession()).toBeNull()
  })

  it('rejects registering, since there is nowhere to register with', async () => {
    await expect(register('a@b.com', 'longenough')).rejects.toThrow(/not configured/i)
  })

  it('rejects signing in', async () => {
    await expect(signIn('a@b.com', 'longenough')).rejects.toThrow(/not configured/i)
  })

  // Refused the same way as the two above rather than returning a failure outcome: a
  // missing backend is a build problem, not something the student did wrong. The screen
  // hides the Google button entirely in this state, so nothing reaches this in practice --
  // this test exists so that stays true if the button's condition ever changes.
  it('rejects a Google sign-in, since there is nowhere to sign in with', async () => {
    await expect(signInWithGoogle()).rejects.toThrow(/not configured/i)
  })

  // Subscribing must be safe to call unconditionally -- the app does it on every mount,
  // configured or not.
  it('still returns a working unsubscribe', () => {
    const stop = onSessionChange(() => undefined)

    expect(typeof stop).toBe('function')
    expect(() => stop()).not.toThrow()
  })

  // Checked before any request, so these answer even with nowhere to send them.
  it('still catches an obviously bad password first', async () => {
    expect(await register('a@b.com', 'short')).toEqual({
      ok: false,
      message: expect.stringMatching(/at least/i),
    })
  })
})
