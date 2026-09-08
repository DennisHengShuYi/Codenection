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

vi.mock('../data', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    getSession: () => Promise.resolve(currentSession),
    onSessionChange: () => () => undefined,
    signOut: () => signOut(),
  }
})

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

    expect(signOut).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^sign in$/i })).toBeVisible(),
    )
  })
})
