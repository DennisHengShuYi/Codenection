import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'

/**
 * The signed-in half of the app.
 *
 * A separate file because the session has to be stubbed for the whole module, and
 * App.test.tsx deliberately covers the opposite case -- a visitor with no account.
 */
const signOut = vi.fn(() => Promise.resolve())
let currentSession: { userId: string; email: string } | null = {
  userId: 'u1',
  email: 'student@um.edu.my',
}

const signIn = vi.fn()
const unlinkTelegram = vi.fn(() => Promise.resolve({ ok: true }))
/** Captured so a test can fire the SIGNED_IN that Supabase really does emit after a
 *  successful sign-in -- which is what would carry the preview week across a second time
 *  if the app and the hook each did the copying. */
const listeners: Array<(session: unknown) => void> = []

vi.mock('../data', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    getSession: () => Promise.resolve(currentSession),
    onSessionChange: (listener: (session: unknown) => void) => {
      listeners.push(listener)
      return () => undefined
    },
    signOut: () => signOut(),
    signIn: (email: string, password: string) => signIn(email, password),
    unlinkTelegram: () => unlinkTelegram(),
    hasTelegramLink: () => Promise.resolve(false),
    requestLinkCode: () => Promise.resolve({ ok: false, message: 'no' }),
  }
})

const carryOverWeek = vi.fn()
vi.mock('../data/carryOver', () => ({
  carryOverWeek: (from: unknown, to: unknown) => {
    carryOverWeek(from, to)
    return Promise.resolve()
  },
}))

describe('App, signed in', () => {
  it('goes straight to the week rather than asking for a sign-in', async () => {
    render(<App />)

    await waitFor(() =>
      expect(screen.getByTestId('capacity-value')).toHaveTextContent(/^\d{1,3}%$/),
    )
    expect(screen.queryByRole('button', { name: /^sign in$/i })).toBeNull()
  })

  it('shows who is signed in', async () => {
    render(<App />)

    await waitFor(() => expect(screen.getByText('student@um.edu.my')).toBeVisible())
  })

  // The preview label must not appear for somebody whose week genuinely is being kept.
  it('does not claim the week is unsaved', async () => {
    render(<App />)

    await waitFor(() => expect(screen.getByText('student@um.edu.my')).toBeVisible())
    expect(screen.queryByText(/not being saved/i)).toBeNull()
  })

  it('signs out and returns to the way in', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('student@um.edu.my')).toBeVisible())

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))

    // Awaited rather than asserted immediately: signing out now unlinks the chat first,
    // while there is still a session to authorise it, so signOut happens a tick later.
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^sign in$/i })).toBeVisible(),
    )
  })
})

describe('signing in through the form', () => {
  /**
   * The copying used to live in the sign-in screen's callback. It now lives in the session
   * hook, so that a Google redirect -- which never touches that screen -- gets it too. The
   * risk that creates is the opposite one: the form path going through both and copying
   * twice, which would put a preview over real data on the second pass.
   */
  it('carries the preview week across exactly once, even though Supabase also announces the sign-in', async () => {
    currentSession = null
    carryOverWeek.mockReset()
    listeners.length = 0
    signIn.mockResolvedValue({ ok: true, session: { userId: 'u1', email: 'student@um.edu.my' } })

    render(<App />)
    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeVisible())

    await userEvent.type(screen.getByLabelText(/email/i), 'student@um.edu.my')
    await userEvent.type(screen.getByLabelText(/password/i), 'longenough')
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => expect(carryOverWeek).toHaveBeenCalledOnce())

    // What Supabase does a moment later, every time.
    listeners.forEach((notify) => notify({ userId: 'u1', email: 'student@um.edu.my' }))

    expect(carryOverWeek).toHaveBeenCalledOnce()
  })
})

describe('signing in', () => {
  it('carries a preview week into the account and shows the room', async () => {
    currentSession = null
    const { unmount } = render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /look around/i })).toBeVisible(),
    )
    unmount()

    // Back with a session, as it would be after a successful sign-in.
    currentSession = { userId: 'u1', email: 'student@um.edu.my' }
    render(<App />)

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
  })
})

/**
 * Signing out unlinks any linked chat.
 *
 * Without it, a chat stays able to read and write a week for an account nobody is signed
 * into -- which on a shared or lost phone is exactly the case the link was meant to be
 * revocable for.
 */
describe('signing out', () => {
  it('unlinks the chat', async () => {
    currentSession = { userId: 'u1', email: 'student@um.edu.my' }
    unlinkTelegram.mockClear().mockResolvedValue({ ok: true })
    render(<App />)
    await waitFor(() => expect(screen.getByText('student@um.edu.my')).toBeVisible())

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() => expect(unlinkTelegram).toHaveBeenCalledOnce())
  })

  // Being unable to tidy up must not trap somebody in an account they asked to leave.
  it('still signs out when unlinking fails', async () => {
    currentSession = { userId: 'u1', email: 'student@um.edu.my' }
    unlinkTelegram.mockClear().mockRejectedValue(new Error('network down'))
    render(<App />)
    await waitFor(() => expect(screen.getByText('student@um.edu.my')).toBeVisible())

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^sign in$/i })).toBeVisible(),
    )
  })
})
