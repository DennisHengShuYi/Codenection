import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Commitment } from '../../optimizer'
import { LapsedNotice } from './LapsedNotice'

const commitment = (over: Partial<Commitment> = {}): Commitment => ({
  id: 'c1',
  title: 'FYP presentation help',
  reviewDay: 7,
  itemId: 'added-1',
  ...over,
})

const setup = (commitments: Commitment[]) => {
  const props = { commitments, onDismiss: vi.fn() }
  render(<LapsedNotice {...props} />)
  return props
}

/**
 * §2.3's provisional yes, at the surface. The point is that leaving happens by itself and
 * staying in takes an act — so this has to be impossible to miss and easy to act on.
 */
describe('LapsedNotice', () => {
  it('renders nothing when nothing has lapsed', () => {
    const { container } = render(<LapsedNotice commitments={[]} onDismiss={vi.fn()} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('names what lapsed, rather than just announcing that something did', () => {
    setup([commitment()])

    expect(screen.getByTestId('lapsed-notice')).toHaveTextContent('FYP presentation help')
  })

  it('says why it lapsed', () => {
    setup([commitment()])

    expect(screen.getByTestId('lapsed-notice').textContent).toMatch(
      /no longer hold|cannot hold|no longer fits/i,
    )
  })

  it('lists every one that lapsed', () => {
    setup([commitment(), commitment({ id: 'c2', title: 'Committee meeting' })])

    expect(screen.getAllByTestId(/^lapsed-item-/)).toHaveLength(2)
  })

  // The app drafted the withdrawal; the student still sends it.
  it('offers the drafted withdrawal', () => {
    setup([commitment()])

    expect(screen.getByTestId('withdrawal-c1')).toBeVisible()
  })

  it('names what is being withdrawn from in the draft itself', () => {
    setup([commitment({ title: 'covering Saturday' })])

    expect((screen.getByTestId('withdrawal-c1') as HTMLTextAreaElement).value).toContain(
      'covering Saturday',
    )
  })

  it('can be dismissed', async () => {
    const props = setup([commitment()])

    await userEvent.click(screen.getByRole('button', { name: /dismiss|got it/i }))

    expect(props.onDismiss).toHaveBeenCalledOnce()
  })

  it('offers no way to send anything', () => {
    setup([commitment()])

    expect(screen.queryByRole('button', { name: /^send|email/i })).toBeNull()
  })
})
