import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignInScreen } from './SignInScreen'

const auth = { signIn: vi.fn(), register: vi.fn() }

vi.mock('../../data', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  signIn: (email: string, password: string) => auth.signIn(email, password),
  register: (email: string, password: string) => auth.register(email, password),
}))

const setup = () => {
  const props = { onSignedIn: vi.fn(), onSkip: vi.fn() }
  render(<SignInScreen {...props} />)
  return props
}

beforeEach(() => {
  auth.signIn.mockReset()
  auth.register.mockReset()
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
