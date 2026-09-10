import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PreviewBanner } from './PreviewBanner'

/**
 * §0's one non-furniture warning: a student browsing signed out must be told their week is
 * not being saved before they discover an object, not after. Batch B changed this component
 * (its colour utilities moved onto `CARD_TONES`), and nothing here proved the warning still
 * renders, the button still works, or that it is still announced the way `role="status"`
 * promises.
 */
describe('PreviewBanner', () => {
  it('warns that the week is not being saved', () => {
    render(<PreviewBanner onSignIn={vi.fn()} />)

    expect(
      screen.getByText(/you are looking at a preview.*not being saved/i),
    ).toBeVisible()
  })

  it('carries an accessible status role, so assistive tech announces it unprompted', () => {
    render(<PreviewBanner onSignIn={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent(/not being saved/i)
  })

  it('reaches onSignIn when the button is pressed', async () => {
    const onSignIn = vi.fn()
    render(<PreviewBanner onSignIn={onSignIn} />)

    await userEvent.click(screen.getByRole('button', { name: /create an account/i }))

    expect(onSignIn).toHaveBeenCalledOnce()
  })
})
