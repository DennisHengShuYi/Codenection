import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RebalanceOutcome } from '../../domain/rebalanceOutcome'
import { HORIZON_DAYS } from '../../engine'
import type { Move, MoveKind, Schedule } from '../../optimizer'
import { RebalancePreview } from './RebalancePreview'

/**
 * The outcome is built by hand rather than solved for.
 *
 * What is under test is what the student is shown and what the two answers do, not the
 * search that produced the offer -- so the moves are stated directly. Driving this through
 * the real solver would make the assertions depend on the hill climb's current
 * neighbourhood, which is a different thing entirely.
 */
const week = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const move = (kind: MoveKind, description: string): Move => ({
  kind,
  itemId: description,
  description,
  apply: (schedule) => schedule,
})

const outcome = (over: Partial<RebalanceOutcome> = {}): RebalanceOutcome => ({
  schedule: week(),
  before: week(),
  moves: [move('shiftDay', 'move the essay from Friday to Wednesday')],
  report: 'I moved 1 thing.',
  proposal: "I'd move 1 thing.",
  fallback: null,
  ...over,
})

const setup = (over: Partial<RebalanceOutcome> = {}) => {
  const onApprove = vi.fn()
  const onDiscard = vi.fn()
  const onBack = vi.fn()
  const onClose = vi.fn()

  render(
    <RebalancePreview
      today={0}
      proposal={outcome(over)}
      onApprove={onApprove}
      onDiscard={onDiscard}
      onBack={onBack}
      onClose={onClose}
    />,
  )

  return { onApprove, onDiscard, onBack, onClose }
}

describe('the rebalance, before it happens', () => {
  it('opens as a dialog named for what it is asking', () => {
    setup()

    expect(screen.getByRole('dialog', { name: /what i'd change/i })).toBeVisible()
  })

  /**
   * The count is the headline and the list is the evidence. "I'd move 20 things" is not
   * something a student can agree or disagree with -- §2.1's rule that a reshuffle they
   * cannot see is one they will not act on is about exactly this, and it matters more when
   * they are being asked to consent to it than when they are being told it happened.
   */
  it('names every move it wants to make, one at a time', () => {
    setup({
      moves: [
        move('shiftDay', 'move the essay from Friday to Wednesday'),
        move('batchErrands', 'batch three errands onto Tuesday'),
      ],
    })

    const list = screen.getByTestId('proposal-moves')

    expect(within(list).getByText('move the essay from Friday to Wednesday')).toBeVisible()
    expect(within(list).getByText('batch three errands onto Tuesday')).toBeVisible()
  })

  it('says what the change buys, in the conditional', () => {
    setup({ proposal: "I'd move 20 things. That is 7 days less underwater." })

    expect(screen.getByTestId('proposal-summary')).toHaveTextContent(
      "I'd move 20 things. That is 7 days less underwater.",
    )
  })

  // The premise of the whole sheet, stated rather than left to be inferred from the fact
  // that there is an Approve button.
  it('says plainly that nothing is saved yet', () => {
    setup()

    expect(screen.getByText(/nothing is saved until you approve/i)).toBeVisible()
  })

  it('adopts the week when approved', async () => {
    const { onApprove, onDiscard } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onDiscard).not.toHaveBeenCalled()
  })

  it('throws the proposal away when discarded', async () => {
    const { onApprove, onDiscard } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))

    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(onApprove).not.toHaveBeenCalled()
  })
})
