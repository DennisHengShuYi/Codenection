import type { JSX } from 'react'
import type { RebalanceOutcome } from '../../domain/rebalanceOutcome'
import { Button } from '../kit/Button'
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
  onApprove,
  onDiscard,
  onBack,
  onClose,
}: {
  readonly proposal: RebalanceOutcome
  readonly onApprove: () => void
  readonly onDiscard: () => void
  /** Ruling 60: one level up, to the week this was proposed for. Discards on the way, like
   *  every other route out of this sheet. */
  readonly onBack: () => void
  readonly onClose: () => void
}): JSX.Element {
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
          </li>
        ))}
      </ul>

      <p className="mt-4 text-sm text-ink-soft">Nothing is saved until you approve.</p>
    </Sheet>
  )
}
