import type { JSX } from 'react'
import type { RestBlock, RestGain, RestPlan } from '../../domain/restNow'
import { Button } from '../kit/Button'
import { Sheet } from '../kit/Sheet'

/**
 * §5's Rest button, shown before it happens.
 *
 * One sheet with four faces, one per rung of `planRest`'s ladder. Every path previews before
 * it applies — including the one where nothing of the student's moves and there is, strictly,
 * nothing to consent to. That is a deliberate choice for consistency: one screen and one
 * mental model beats a button that sometimes acts instantly and sometimes asks.
 *
 * One sentence and two numbers, in the register the retired recovery card used. `RestGain`
 * computes rather more
 * than this shows — the fortnight's floor either side, the deficit-day shift, the deepest
 * lift anywhere on the horizon — and most of it is deliberately withheld. §5.2's rule about
 * menus is really a rule about load: somebody who has just pressed a button because they are
 * flat cannot read a dashboard, and a screen that makes them try is a screen they close.
 */

/**
 * How long, in words.
 *
 * The half-hour case is its own line rather than falling through to "N and a half hours",
 * which renders `0.5` as "0 and a half hours". That is reachable: `MIN_GAP_HOURS` is half an
 * hour, so it is exactly what a nearly-full day offers.
 */
const hoursLabel = (hours: number): string => {
  if (hours === 0.5) return 'Half an hour'
  if (hours === 1) return '1 hour'

  return hours % 1 === 0 ? `${hours} hours` : `${Math.floor(hours)} and a half hours`
}

const clockLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`

/**
 * When, in the terms the student is actually in.
 *
 * Counted from today rather than named as a weekday, which needs the schedule's anchor and
 * degrades to "day 14" without one. "In three days" is true whether or not the fortnight
 * knows what date it started.
 */
function whenLabel(block: RestBlock, today: number): string {
  const away = block.dayIndex - today

  if (away <= 0) return `starting at ${clockLabel(block.startHour)}`
  if (away === 1) return `tomorrow at ${clockLabel(block.startHour)}`

  return `in ${away} days, at ${clockLabel(block.startHour)}`
}

const worthLabel = (gain: RestGain): string =>
  gain.dayAfter > gain.dayBefore
    ? ` Takes you from ${gain.dayBefore} to ${gain.dayAfter}.`
    : ''

const summaryOf = (block: RestBlock, gain: RestGain, today: number): string =>
  `${hoursLabel(block.hours)} off, ${whenLabel(block, today)}.${worthLabel(gain)}`

export function RestPreview({
  plan,
  today,
  onApprove,
  onDiscard,
  onClose,
}: {
  readonly plan: RestPlan
  /** Supplied rather than read, the same way every other day figure in this app is. */
  readonly today: number
  readonly onApprove: () => void
  readonly onDiscard: () => void
  readonly onClose: () => void
}): JSX.Element {
  const takeable = plan.kind !== 'refused'

  return (
    <Sheet
      title="Stopping for a bit"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" data-testid="discard-rest" onClick={onDiscard}>
            {takeable ? 'Not now' : 'Close'}
          </Button>
          {/* Absent on a refusal rather than disabled. A primary button that cannot do
              anything is worse than no button: it invites a press and then does nothing,
              which reads as the app being broken rather than as an honest no. */}
          {takeable && (
            <Button data-testid="approve-rest" onClick={onApprove}>
              Put it in my week
            </Button>
          )}
        </>
      }
    >
      {plan.kind === 'refused' ? (
        <p data-testid="rest-why" className="text-sm text-ink">
          {plan.why}
        </p>
      ) : (
        <>
          <p data-testid="rest-summary" className="text-base text-ink">
            {summaryOf(plan.block, plan.gain, today)}
          </p>

          {/* Named individually, never merely counted. §2.1's rule that a change you cannot
              see is a change you cannot consent to applies with more force here, because
              this move is being made to buy the student time off rather than to fix their
              week -- so they had better be able to see what it costs. */}
          {plan.kind === 'needsMove' && (
            <p data-testid="rest-move" className="mt-2 text-sm text-ink">
              To make room: {plan.move.move.description}
            </p>
          )}
        </>
      )}
    </Sheet>
  )
}
