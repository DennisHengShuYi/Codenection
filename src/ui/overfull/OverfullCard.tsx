import { withdrawalFor } from '../../domain/withdrawal'
import type { ScheduledItem } from '../../optimizer'
import { Button } from '../kit/Button'
import { Card } from '../kit/Card'
import { Field } from '../kit/Field'

/**
 * §2.2's other answer: the day that does not fit, and what is standing on it.
 *
 * This is the one card in the app that asks a student to give something up, so what it does
 * NOT do is the load-bearing part. It offers no recommendation, highlights nothing, and
 * ranks nothing. Not out of delicacy -- because the app genuinely cannot tell. Nothing in a
 * `ScheduledItem` records how much something matters, and a ranking invented out of hours
 * and kind would be exactly the confidently wrong number this project holds to be worse than
 * an admitted gap. It can say which day fails, what is on it and how big each thing is. The
 * choosing is the student's, and the card is built so that it reads that way.
 *
 * Ruling 22's rule about the check-in's three answers applies here word for word: no primary
 * variant among the options, because a highlighted button is a nudge and the whole value of
 * this decision is that the student made it.
 *
 * `attention` rather than an alarm colour, matching every other card that wants something:
 * this is a fortnight that needs a decision, not an emergency.
 */
export function OverfullCard({
  dayLabel,
  candidates,
  droppedTitle,
  onDrop,
  onDismiss,
}: {
  /** Already in words, from `domain/calendar.dayLabel`. This component never turns a day
   *  index into a date -- §9 keeps that in one place and this is not it. */
  readonly dayLabel: string
  readonly candidates: readonly ScheduledItem[]
  /**
   * What was just dropped, when it was something the student had only provisionally said yes
   * to. Null otherwise, and null is much the commoner case.
   *
   * The title rather than a flag, because it is the title the withdrawal message needs.
   */
  readonly droppedTitle: string | null
  readonly onDrop: (itemId: string) => void
  readonly onDismiss: () => void
}) {
  // Nothing to offer is not a quieter version of this card, it is no card: naming a problem
  // and then presenting an empty list would leave the student worse off than silence.
  if (candidates.length === 0) return null

  return (
    <Card
      data-testid="overfull"
      role="region"
      aria-label="A day that does not fit"
      tone="attention"
      className="flex flex-col gap-3"
    >
      <div>
        <h2 className="text-base font-medium">{dayLabel} does not fit</h2>
        <p className="text-sm text-ink-soft">
          Moving things around will not fix this one — there is more here than the day holds.
          Something has to come out, and you are the one who knows which.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {candidates.map((item) => (
          <li key={item.id} className="flex items-baseline justify-between gap-3">
            <span className="text-sm">{item.title}</span>

            <span className="flex shrink-0 items-baseline gap-2">
              <span className="text-xs tabular-nums text-ink-soft">{item.hours}h</span>
              {/* `secondary` on every one of them, never `primary` on any. See the note
                  above: the app has no basis for pointing at one of these. */}
              <Button
                size="sm"
                variant="secondary"
                data-testid={`drop-${item.id}`}
                onClick={() => onDrop(item.id)}
              >
                Drop it
              </Button>
            </span>
          </li>
        ))}
      </ul>

      {/* §2.3's surviving half. The block is already out of the week by the time this shows,
          which is the whole mechanism: the decision is made and only the words are left,
          because the words were always the hard part rather than the decision. */}
      {droppedTitle !== null && (
        <Field label="Withdrawal message" hideLabel>
          <textarea
            data-testid="withdrawal"
            defaultValue={withdrawalFor(droppedTitle)}
            rows={3}
            className="w-full rounded border border-line p-2 text-sm"
          />
        </Field>
      )}

      {/* Keeping the week exactly as it is has to be a real option, said in those words.
          A student who decides nothing should come out has answered the card. */}
      <Button variant="quiet" size="sm" className="self-start" data-testid="overfull-dismiss" onClick={onDismiss}>
        Keep them all
      </Button>
    </Card>
  )
}
