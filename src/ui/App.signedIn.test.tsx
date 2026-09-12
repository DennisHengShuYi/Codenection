import { render, screen, waitFor, within } from '@testing-library/react'
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

describe('App, signed in', () => {
  it('goes straight to the week rather than asking for a sign-in', async () => {
    render(<App />)

    await waitFor(() =>
      expect(screen.getByTestId('room-scene')).toBeVisible(),
    )
    expect(screen.queryByRole('button', { name: /^sign in$/i })).toBeNull()
  })

  it('shows who is signed in', async () => {
    render(<App />)

    // Who you are lives in settings now.
    await waitFor(() => expect(screen.getByTestId('open-settings')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-settings'))
    await waitFor(() => expect(screen.getByText('student@um.edu.my')).toBeVisible())
  })

  /**
   * Who you are sits in the pinned bar, on the same line as Sign out.
   *
   * It used to float in the scrolling body between the interface radios and the Telegram
   * card, where it read as another setting rather than as a label on the action beside it --
   * and on a short sheet it could scroll out of view while the button that signs that very
   * account out stayed pinned. The two belong together: one says who, the other acts on them.
   */
  it('puts who is signed in on the same row as sign out', async () => {
    render(<App />)

    await waitFor(() => expect(screen.getByTestId('open-settings')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-settings'))

    const bar = await screen.findByTestId('sheet-actions')

    expect(within(bar).getByText('student@um.edu.my')).toBeVisible()
    expect(within(bar).getByTestId('avatar')).toBeVisible()
    expect(within(bar).getByRole('button', { name: /sign out/i })).toBeVisible()
  })

  // The preview label must not appear for somebody whose week genuinely is being kept.
  it('does not claim the week is unsaved', async () => {
    render(<App />)

    // Who you are lives in settings now.
    await waitFor(() => expect(screen.getByTestId('open-settings')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-settings'))
    await waitFor(() => expect(screen.getByText('student@um.edu.my')).toBeVisible())
    expect(screen.queryByText(/not being saved/i)).toBeNull()
  })

  it('signs out and returns to the way in', async () => {
    render(<App />)
    // Who you are lives in settings now.
    await waitFor(() => expect(screen.getByTestId('open-settings')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-settings'))
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

describe('signing in', () => {
  // The room renders for a signed-in account. It does *not* inherit the preview: since the
  // carry-over was removed, browser storage and the account are separate stores, and what
  // this proves is that the account still resolves to a usable week of its own.
  it('opens on the room, on the account own week', async () => {
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
    // Who you are lives in settings now.
    await waitFor(() => expect(screen.getByTestId('open-settings')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-settings'))
    await waitFor(() => expect(screen.getByText('student@um.edu.my')).toBeVisible())

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() => expect(unlinkTelegram).toHaveBeenCalledOnce())
  })

  // Being unable to tidy up must not trap somebody in an account they asked to leave.
  it('still signs out when unlinking fails', async () => {
    currentSession = { userId: 'u1', email: 'student@um.edu.my' }
    unlinkTelegram.mockClear().mockRejectedValue(new Error('network down'))
    render(<App />)
    // Who you are lives in settings now.
    await waitFor(() => expect(screen.getByTestId('open-settings')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-settings'))
    await waitFor(() => expect(screen.getByText('student@um.edu.my')).toBeVisible())

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^sign in$/i })).toBeVisible(),
    )
  })
})
