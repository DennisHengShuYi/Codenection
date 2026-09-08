import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from './App'

// No credentials are configured for the test suite, so there is no session to find and
// every case enters the same way a visitor without an account would.
describe('App', () => {
  it('offers a way in before anything else', async () => {
    render(<App />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^sign in$/i })).toBeVisible(),
    )
  })

  // §0: no login wall between a visitor and a working app.
  it('shows a working week to somebody who looks around without an account', async () => {
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /look around/i })).toBeVisible(),
    )

    await userEvent.click(screen.getByRole('button', { name: /look around/i }))

    await waitFor(() =>
      expect(screen.getByTestId('capacity-value')).toHaveTextContent(/^\d{1,3}%$/),
    )
  })

  // The banner's offer has to actually lead somewhere.
  it('returns to the way in when the preview offers to keep the week', async () => {
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /look around/i })).toBeVisible(),
    )
    await userEvent.click(screen.getByRole('button', { name: /look around/i }))
    await waitFor(() => expect(screen.getByRole('status')).toBeVisible())

    await userEvent.click(screen.getByRole('button', { name: /create an account to keep it/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^sign in$/i })).toBeVisible(),
    )
  })

  it('says plainly that a preview week is not being kept', async () => {
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /look around/i })).toBeVisible(),
    )

    await userEvent.click(screen.getByRole('button', { name: /look around/i }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/not being saved/i),
    )
  })
})
