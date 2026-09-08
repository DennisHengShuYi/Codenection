import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AccountBar } from './AccountBar'
import { PreviewBanner } from './PreviewBanner'

describe('AccountBar', () => {
  it('shows who is signed in', () => {
    render(<AccountBar email="a@b.com" onSignOut={vi.fn()} />)

    expect(screen.getByText('a@b.com')).toBeVisible()
  })

  it('signs out when asked', async () => {
    const onSignOut = vi.fn()
    render(<AccountBar email="a@b.com" onSignOut={onSignOut} />)

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))

    expect(onSignOut).toHaveBeenCalledOnce()
  })
})

describe('PreviewBanner', () => {
  /**
   * Asserted on the words themselves, because this is exactly the sort of copy that gets
   * softened later into something reassuring and untrue.
   */
  it('says plainly that the week is not being saved', () => {
    render(<PreviewBanner onSignIn={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent(/not being saved/i)
  })

  it('offers a way to keep it', async () => {
    const onSignIn = vi.fn()
    render(<PreviewBanner onSignIn={onSignIn} />)

    await userEvent.click(screen.getByRole('button', { name: /create an account/i }))

    expect(onSignIn).toHaveBeenCalledOnce()
  })
})
