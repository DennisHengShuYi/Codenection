import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { Sheet } from './Sheet'

const setup = (actions?: React.ReactNode) => {
  const onClose = vi.fn()
  render(
    <Sheet title="FYP meeting" onClose={onClose} actions={actions}>
      <p>14:00–16:00</p>
    </Sheet>,
  )
  return { onClose }
}

describe('Sheet', () => {
  it('is a modal dialog named by its title', () => {
    setup()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('FYP meeting')
  })

  it('takes focus on open, so a keyboard user is not left at the top of the document', () => {
    setup()

    expect(screen.getByRole('dialog')).toHaveFocus()
  })

  it('closes on Escape', async () => {
    const { onClose } = setup()

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ignores keys other than Escape', async () => {
    const { onClose } = setup()

    await userEvent.keyboard('{Enter}')

    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes from the close control', async () => {
    const { onClose } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders actions into the pinned bar rather than into the body', () => {
    setup(<Button>Done</Button>)

    const bar = screen.getByTestId('sheet-actions')
    expect(bar).toContainElement(screen.getByRole('button', { name: 'Done' }))
  })

  it('has no action bar when it is given no actions', () => {
    setup()

    expect(screen.queryByTestId('sheet-actions')).not.toBeInTheDocument()
  })

  it('does not steal focus from a control inside the body when the title changes while mounted', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Sheet title="0 words" onClose={onClose}>
        <input aria-label="notes" />
      </Sheet>,
    )

    screen.getByLabelText('notes').focus()

    // A title that is merely a display string -- e.g. a live word count -- is not a signal
    // that a new sheet has opened. Re-running the focus effect whenever it happens to change
    // would yank focus away from whatever the user is doing inside the body.
    rerender(
      <Sheet title="3 words" onClose={onClose}>
        <input aria-label="notes" />
      </Sheet>,
    )

    expect(screen.getByLabelText('notes')).toHaveFocus()
  })

  it('still moves focus to the panel on a forced remount, even when the title repeats', () => {
    const onClose = vi.fn()
    const outside = document.createElement('button')
    document.body.appendChild(outside)

    // Two different opens can legitimately share a title ("Note", "Note"). A consumer that
    // keeps Sheet in the same JSX position signals a genuinely new open with `key`, not with
    // title -- so a remount via key must still take focus regardless of what title reads.
    const { rerender } = render(
      <Sheet key="a" title="Note" onClose={onClose}>
        <p>first</p>
      </Sheet>,
    )
    outside.focus()

    rerender(
      <Sheet key="b" title="Note" onClose={onClose}>
        <p>second</p>
      </Sheet>,
    )

    expect(screen.getByRole('dialog')).toHaveFocus()
    document.body.removeChild(outside)
  })
})
