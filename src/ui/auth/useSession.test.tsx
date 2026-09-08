import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSession } from './useSession'

const listeners: Array<(session: unknown) => void> = []

vi.mock('../../data', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getSession: () => Promise.resolve(null),
  onSessionChange: (listener: (session: unknown) => void) => {
    listeners.push(listener)
    return () => undefined
  },
}))

function Probe() {
  const { session, loading } = useSession()

  if (loading) return <p>looking</p>
  return <p data-testid="who">{session ? session.email : 'nobody'}</p>
}

describe('useSession', () => {
  it('reports nobody signed in once it has looked', async () => {
    render(<Probe />)

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('nobody'))
  })

  /**
   * Without this, the app renders the signed-out preview for a frame before the stored
   * session resolves -- so a signed-in student sees a flash of "you are not signed in" on
   * every single load.
   */
  it('reports that it is still looking before the answer arrives', () => {
    render(<Probe />)

    expect(screen.getByText('looking')).toBeVisible()
  })

  // Signing out in one tab must not leave another holding a stale session.
  it('follows a sign-in that happened in another tab', async () => {
    render(<Probe />)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('nobody'))

    listeners.forEach((notify) => notify({ userId: 'u1', email: 'a@b.com' }))

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('a@b.com'))
  })
})
