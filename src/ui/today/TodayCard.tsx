import type { JSX } from 'react'
import type { BlockAnswer } from '../../domain/blockLog'
import type { BlockOutcome } from '../../domain/calibration'
import { biasLine } from '../../domain/realityCheck'
import type { ScheduledItem } from '../../optimizer'
import { Button } from '../kit/Button'
import { Card } from '../kit/Card'
import { SLEEP_HOURS, type SleepBucket } from './checkIn'

/** §7.5: ask relative, not absolute. Nobody knows their energy as a number, and §8.1's
 *  scale is fixed -- taken from `EnergyCheckIn` verbatim, not renumbered or relabelled. */
const ENERGY_BANDS = [
  { label: 'Running on empty', value: 10 },
  { label: 'Low', value: 30 },
  { label: 'Getting by', value: 50 },
  { label: 'Pretty good', value: 70 },
  { label: 'Full of it', value: 90 },
] as const

const SLEEP_LABELS: Record<SleepBucket, string> = {
  under5: 'Under 5',
  six: '6',
  seven: '7',
  eightPlus: '8+',
}

/** Order matters only for display -- all four render with the same variant (Ruling 22). */
const BLOCK_ANSWERS: readonly { answer: BlockAnswer; label: string }[] = [
  { answer: 'didnt', label: "Didn't happen" },
  { answer: 'less', label: 'Took less' },
  { answer: 'right', label: 'About right' },
  { answer: 'longer', label: 'Took longer' },
]

/**
 * §8: the whole daily check-in, three taps.
 *
 * Replaces asking two questions about every block -- four blocks meant eight taps, which is
 * why it never happened, and the accuracy figure it feeds would have read "not enough data"
 * forever. This asks one energy reading, one night's sleep, and about the single block
 * `blockToAsk` (Task 9) picked as least-sampled.
 *
 * Ruling 22: the four block answers carry no primary variant. A reviewer flagged their
 * visual equality as a possible defect -- it is deliberate. They feed the estimate bias the
 * app's published accuracy figure is measured against, so making one primary would nudge
 * reporting toward it and skew the measurement.
 *
 * Ruling 23, as it now stands: the constraint that chose this copy is GONE. `blockToAsk`
 * took a `nowHour` in 37eaf52 (Ruling 36) and will no longer select a block on today that
 * has not finished, so its output can no longer be something that has not happened.
 *
 * The copy stays neutral anyway, for a reason that survives the fix: this component takes
 * whatever `block` it is handed and has no way to know it came from `blockToAsk`. "How much
 * of it happened" is true of a finished block and of one that is not, and nothing is gained
 * by making it presuppose an ending it cannot verify.
 */
export function TodayCard(props: {
  readonly block: ScheduledItem | null
  readonly askEnergy: boolean
  readonly askSleep: boolean
  /**
   * §2.4's history, for the Reality Check line only.
   *
   * Defaulted rather than required, because §0 forbids a cold start: a student on day one
   * has no outcomes, and the card still has to render.
   */
  readonly outcomes?: readonly BlockOutcome[]
  readonly onEnergy: (energy: number) => void
  readonly onSleep: (bucket: SleepBucket) => void
  readonly onBlock: (itemId: string, answer: BlockAnswer) => void
  readonly onDismiss: () => void
}): JSX.Element | null {
  const { block, askEnergy, askSleep, outcomes = [], onEnergy, onSleep, onBlock, onDismiss } = props
  const askBlock = block !== null

  // §7.6, and only for the block actually on the card: a bias quoted about some other load
  // type is one the student cannot connect to anything in front of them. Null when there
  // is nothing measured worth saying, which is most of the first week.
  const bias = block === null ? null : biasLine(outcomes, block.type)

  if (!askEnergy && !askSleep && !askBlock) {
    return null
  }

  return (
    <Card role="region" aria-label="Today's check-in" className="flex flex-col gap-4">
      {askEnergy && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-base font-medium">How is your energy today?</legend>
          <p className="text-sm text-ink-soft">
            One tap. It is how the app checks whether its predictions are any good.
          </p>
          <div className="flex flex-wrap gap-2">
            {ENERGY_BANDS.map((band) => (
              <Button
                key={band.value}
                size="sm"
                variant="secondary"
                data-testid={`energy-${band.value}`}
                onClick={() => onEnergy(band.value)}
              >
                {band.label}
              </Button>
            ))}
          </div>
        </fieldset>
      )}

      {askEnergy && (askSleep || askBlock) && <hr className="border-line" />}

      {askSleep && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-base font-medium">How much sleep last night?</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SLEEP_HOURS) as SleepBucket[]).map((bucket) => (
              <Button
                key={bucket}
                size="sm"
                variant="secondary"
                data-testid={`sleep-${bucket}`}
                onClick={() => onSleep(bucket)}
              >
                {SLEEP_LABELS[bucket]}
              </Button>
            ))}
          </div>
        </fieldset>
      )}

      {askSleep && askBlock && <hr className="border-line" />}

      {askBlock && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-base font-medium">
            {block.title} — you planned {block.hours}h
          </legend>
          <p className="text-sm text-ink-soft">How much of it happened?</p>
          <div className="flex flex-wrap gap-2">
            {BLOCK_ANSWERS.map(({ answer, label }) => (
              <Button
                key={answer}
                size="sm"
                variant="secondary"
                data-testid={`answer-${answer}`}
                onClick={() => onBlock(block.id, answer)}
              >
                {label}
              </Button>
            ))}
          </div>

          {/* §7.6's Reality Check. Placed under the answers rather than above them so it
              reads as the app explaining itself after the question, not as a nudge toward
              a particular answer -- Ruling 22 keeps these four buttons visually equal for
              exactly that reason, and a line arguing "you always overrun" sitting above
              them would undo it. */}
          {bias !== null && (
            <p data-testid="bias-line" className="text-xs text-ink-soft">
              {bias}
            </p>
          )}
        </fieldset>
      )}

      <Button variant="quiet" size="sm" className="self-start" onClick={onDismiss}>
        Not now
      </Button>
    </Card>
  )
}
