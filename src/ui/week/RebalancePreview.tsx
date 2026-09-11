import type { JSX } from 'react'
import type { RebalanceOutcome } from '../../domain/rebalanceOutcome'
import { shortDayLabel } from '../../domain/calendar'
import { Button } from '../kit/Button'
import { hourLabel } from '../kit/labels'
import { Sheet } from '../kit/Sheet'

/**
 * §2.1's reshuffle, shown before it happens.
 *
 * The solver used to write the week and then say what it had done, which left a student who
 * disagreed with one of twenty moves nothing to do about it. The result already carried
 * everything needed to ask first -- the schedule it started from, the schedule it reached,
 * and a sentence per move -- and nothing had ever displayed the list.
 *
 * Every move is named individually rather than only counted. The count is the headline and
 * the list is the evidence: "I'd move 20 things" is not something a student can agree or
 * disagree with, and §2.1's rule that the app never says "optimised" is about exactly this.
 * A change you cannot see is a change you cannot consent to.
 *
 * Discard rather than Cancel, and it is what Back and the close control do too. There is no
 * third answer here: leaving without approving means the week is unchanged, and a control
 * that meant something else would be the ambiguity Ruling 60 removed.
 */
export function RebalancePreview({
  proposal,
  today,
  onApprove,
  onDiscard,
  onBack,
  onClose,
}: {
  readonly proposal: RebalanceOutcome
  /**
   * The day the student is on, so each move can say which day it lands on.
   *
   * The descriptions come from `src/optimizer`, which is pure and has no calendar -- it can
   * say "moved 2 days later" but not which day that is, and it used to print "on day 0" for an
   * insertion, which is the model's own zero-based counting reaching the student. The day is
   * named here, from the schedule the proposal would produce, through the one module allowed
   * to turn an index into a date.
   */
  readonly today: number
  readonly onApprove: () => void
  readonly onDiscard: () => void
  /** Ruling 60: one level up, to the week this was proposed for. Discards on the way, like
   *  every other route out of this sheet. */
  readonly onBack: () => void
  readonly onClose: () => void
}): JSX.Element {
  /** Where the block ends up, read off the week this proposal would produce. Null for a move
   *  whose block is not in it -- nothing today produces that, and a sentence about a block
   *  that is not there would be worse than no sentence. */
  const landsOn = (itemId: string): string | null => {
    const item = proposal.schedule.items.find((entry) => entry.id === itemId)
    if (item === undefined) return null

    // The day and the hours on it. Where in the day a block lands is the half the solver
    // chose and the student did not, which makes it the half worth stating before they
    // approve it.
    const when = `${hourLabel(item.startHour)}–${hourLabel(item.startHour + item.hours)}`
    return `${shortDayLabel(proposal.schedule, item.dayIndex, today)}, ${when}`
  }

  return (
    <Sheet
      title="What I'd change"
      onClose={onClose}
      onBack={onBack}
      actions={
        <>
          <Button variant="secondary" data-testid="discard-rebalance" onClick={onDiscard}>
            Discard
          </Button>
          <Button data-testid="approve-rebalance" onClick={onApprove}>
            Approve
          </Button>
        </>
      }
    >
      <p data-testid="proposal-summary" className="text-sm text-ink">
        {proposal.proposal}
      </p>

      <ul data-testid="proposal-moves" className="mt-4 flex flex-col gap-2">
        {proposal.moves.map((move, index) => (
          /* Indexed because one kind can act on one block twice in a single solve -- two
             shifts of the same errand is a legal path through the neighbourhood -- so kind
             and id together are not unique. The list is rendered once and never reordered,
             which is the condition that makes an index key safe. */
          <li
            key={`${move.kind}-${move.itemId}-${index}`}
            className="break-words rounded-lg border border-line bg-surface p-3 text-sm text-ink"
          >
            {move.description}
            {landsOn(move.itemId) !== null && (
              <span className="text-ink-soft"> — {landsOn(move.itemId)}</span>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-sm text-ink-soft">Nothing is saved until you approve.</p>
    </Sheet>
  )
}
