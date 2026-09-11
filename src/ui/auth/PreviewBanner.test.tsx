import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PreviewBanner } from './PreviewBanner'

/**
 * §0's one non-furniture warning: a student browsing signed out must be told the limit of
 * what they are getting before they discover it, not after.
 *
 * The limit is the device and the account, not persistence. This used to assert the banner
 * said the week was "not being saved", which was false -- `createLocalRepository` writes it
 * to IndexedDB, and `carryOverWeek` later copies that store into a new account *because* it
 * was saved. A student who closed the tab found their fortnight intact, having just been
 * told it was gone. Batch B changed this component
 * (its colour utilities moved onto `CARD_TONES`), and nothing here proved the warning still
 * renders, the button still works, or that it is still announced the way `role="status"`
 * promises.
 */
describe('PreviewBanner', () => {
  it('says the week is kept on this device only', () => {
    render(<PreviewBanner onSignIn={vi.fn()} />)

    expect(screen.getByText(/saved on this device only/i)).toBeVisible()
  })

  /**
   * The second half of the truth, and the half that changed.
   *
   * "Sign in to keep it everywhere" was accurate only while `carryOverWeek` existed to move
   * the preview into the new account. That copy is gone, because it could not tell a week a
   * student had built from the demo one the app seeds -- so an account now starts empty, and
   * a banner still promising otherwise would be the same lie the old "not being saved"
   * wording was, pointing the other way.
   */
  it('does not promise the preview follows them into an account', () => {
    render(<PreviewBanner onSignIn={vi.fn()} />)

    expect(screen.queryByText(/keep it everywhere/i)).toBeNull()
    expect(screen.getByText(/starts a fresh week/i)).toBeVisible()
  })

  /** The old wording is the defect, so it is asserted gone rather than merely replaced. */
  it('does not claim the week is unsaved', () => {
    render(<PreviewBanner onSignIn={vi.fn()} />)

    expect(screen.queryByText(/not being saved/i)).toBeNull()
  })

  it('carries an accessible status role, so assistive tech announces it unprompted', () => {
    render(<PreviewBanner onSignIn={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent(/this device only/i)
  })

  it('reaches onSignIn when the button is pressed', async () => {
    const onSignIn = vi.fn()
    render(<PreviewBanner onSignIn={onSignIn} />)

    await userEvent.click(screen.getByRole('button', { name: /create an account/i }))

    expect(onSignIn).toHaveBeenCalledOnce()
  })
})
