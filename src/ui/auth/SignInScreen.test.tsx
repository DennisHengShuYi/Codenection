import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignInScreen } from './SignInScreen'

const auth = { signIn: vi.fn(), register: vi.fn(), signInWithGoogle: vi.fn() }

/** Whether Supabase is configured decides whether the Google button exists at all, so the
 *  tests need to move it. Configured by default; the one test that wants the opposite
 *  sets it back. */
const config = { supabaseUrl: null as string | null, supabaseAnonKey: null as string | null }

vi.mock('../../data', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  signIn: (email: string, password: string) => auth.signIn(email, password),
  register: (email: string, password: string) => auth.register(email, password),
  signInWithGoogle: () => auth.signInWithGoogle(),
  readDataConfig: () => config,
}))

const setup = () => {
  const props = { onSignedIn: vi.fn(), onSkip: vi.fn() }
  render(<SignInScreen {...props} />)
  return props
}

beforeEach(() => {
  auth.signIn.mockReset()
  auth.register.mockReset()
  auth.signInWithGoogle.mockReset()
  auth.signInWithGoogle.mockResolvedValue({ ok: true })
  config.supabaseUrl = 'https://example.supabase.co'
  config.supabaseAnonKey = 'anon-key'
})

describe('SignInScreen', () => {
  it('signs in with what was typed', async () => {
    auth.signIn.mockResolvedValue({ ok: true, session: { userId: 'u1', email: 'a@b.com' } })
    const props = setup()

    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'longenough')
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(auth.signIn).toHaveBeenCalledWith('a@b.com', 'longenough')
    expect(props.onSignedIn).toHaveBeenCalledWith({ userId: 'u1', email: 'a@b.com' })
  })

  it('switches to creating an account', async () => {
    auth.register.mockResolvedValue({ ok: true, session: { userId: 'u1', email: 'a@b.com' } })
    setup()

    await userEvent.click(screen.getByRole('button', { name: /create an account/i }))
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'longenough')
    await userEvent.click(screen.getByRole('button', { name: /^create account$/i }))

    expect(auth.register).toHaveBeenCalledWith('a@b.com', 'longenough')
  })

  /**
   * The whole point of translating Supabase's messages: a person has to be able to tell a
   * wrong password from an unconfirmed address, because the fix is different.
   */
  it('shows what actually went wrong', async () => {
    auth.signIn.mockResolvedValue({ ok: false, message: 'That email or password is not right.' })
    setup()

    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpass')
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/not right/i)
  })

  it('does not call out when the form is empty', async () => {
    setup()

    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(auth.signIn).not.toHaveBeenCalled()
  })

  // §0: a login wall would mean a network problem on judging day is the difference
  // between a demo and no demo.
  it('lets somebody look around without an account', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /look around/i }))

    expect(props.onSkip).toHaveBeenCalledOnce()
  })
})

describe('SignInScreen, signing in with Google', () => {
  it('offers Google when Supabase is configured', () => {
    setup()

    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument()
  })

  // A build with no backend must not offer a door that cannot open. The demo and CI both
  // run in exactly this state.
  it('does not offer Google when there is no backend to sign in with', () => {
    config.supabaseUrl = null
    config.supabaseAnonKey = null
    setup()

    expect(screen.queryByRole('button', { name: /google/i })).not.toBeInTheDocument()
  })

  it('starts a Google sign-in when pressed', async () => {
    setup()

    await userEvent.click(screen.getByRole('button', { name: /google/i }))

    expect(auth.signInWithGoogle).toHaveBeenCalledOnce()
  })

  // The email fields are untouched by this route, so nothing typed into them should be
  // sent anywhere.
  it('does not also try to sign in with an email and password', async () => {
    setup()

    await userEvent.click(screen.getByRole('button', { name: /google/i }))

    expect(auth.signIn).not.toHaveBeenCalled()
    expect(auth.register).not.toHaveBeenCalled()
  })

  /**
   * On success the browser is leaving for Google, so the screen stays busy rather than
   * re-enabling. Two sign-ins running at once is the failure this prevents: the second
   * would land on a screen that has already navigated away.
   */
  it('holds the form while the hand-off to Google is in flight', async () => {
    let release = () => undefined as void
    auth.signInWithGoogle.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ ok: true })
      }),
    )
    setup()

    await userEvent.click(screen.getByRole('button', { name: /google/i }))

    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeDisabled()
    release()
  })

  // The same alert region as an email failure, so a screen reader announces it the same
  // way rather than the Google path failing silently.
  it('reports a refusal where every other failure appears', async () => {
    auth.signInWithGoogle.mockResolvedValue({ ok: false, message: 'Google would not play.' })
    setup()

    await userEvent.click(screen.getByRole('button', { name: /google/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/would not play/i)
  })

  // Failing releases the form, unlike success -- nobody is navigating away, so the student
  // has to be able to try the email route instead.
  it('lets the student try again after a refusal', async () => {
    auth.signInWithGoogle.mockResolvedValue({ ok: false, message: 'Google would not play.' })
    setup()

    await userEvent.click(screen.getByRole('button', { name: /google/i }))
    await screen.findByRole('alert')

    expect(screen.getByRole('button', { name: /^sign in$/i })).not.toBeDisabled()
  })
})
