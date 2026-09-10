import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'

const PROBLEM = 'I could not save that answer, so it may not be here next time you open the app.'

/**
 * `useBlockLog` is stubbed rather than driven, because what this file exists to prove is
 * the *wiring*: that a failure the hook reports actually reaches the screen. Driving a real
 * write failure through the week screen would test the hook again -- which
 * `useBlockLog.test.tsx` already does -- and would still leave the one thing that has gone
 * wrong four times on this branch unchecked: a value computed, tested, and never rendered.
 */
vi.mock('./useBlockLog', () => ({
  useBlockLog: () => ({ blockLog: [], recordAnswer: vi.fn(), problem: PROBLEM, retry: vi.fn() }),
}))

describe('App when a block answer cannot be written', () => {
  it('tells the student rather than swallowing it', async () => {
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /look around/i })).toBeVisible(),
    )
    await userEvent.click(screen.getByRole('button', { name: /look around/i }))
    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

    expect(screen.getByTestId('block-log-problem')).toHaveTextContent(/could not save/i)
  })
})
