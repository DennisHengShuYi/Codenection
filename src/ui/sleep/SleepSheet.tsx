import { useState, type JSX } from 'react'
import { isRealSleepHours, MAX_SLEEP_HOURS } from '../../domain/sleepPlan'
import { Field } from '../kit/Field'
import { Sheet } from '../kit/Sheet'

/**
 * Ruling 66: a page rather than a card, and that is the whole point of it. §8's check-in asks
 * "how much sleep last night?" once a day and then disappears -- it is CHECKING, about a night
 * that already happened, and the answer teaches the model. This is PLANNING: what the student
 * intends, reachable whenever they want it. The two write to different places for that reason,
 * and `domain/sleepReality` is what compares them.
 *
 * Typed, not chosen. It offered four fixed figures first, which made a tidy row of buttons and
 * a dishonest instrument: a student who sleeps five and a half hours had no way to say so, and
 * the page put sixteen buttons on a narrow sheet to offer twelve figures nobody asked for. A
 * number field says anything, in less space.
 *
 * Every commit is still owned by the parent -- `RestPreview`'s division, and the established
 * one here. What this component owns is the half-typed state of a field, which is nobody
 * else's business: a draft of "1" on the way to "12" must not reach the week.
 */

/** One night as the page shows it: already labelled, already carrying its own forecast, so
 *  this component derives nothing and cannot disagree with the room about a date. */
export interface PlannedNight {
  readonly dayIndex: number
  readonly label: string
  readonly hours: number
  /** Null when the day fits, which renders no element at all rather than an empty one. */
  readonly forecast: string | null
}

const INPUT =
  'min-h-11 w-24 rounded border border-line bg-surface px-2 py-1 text-sm tabular-nums text-ink'

/**
 * What a typed field is worth, and what to say when it is worth nothing.
 *
 * Emptiness is caught before the numeric check rather than by it, because `Number('')` is 0
 * and not `NaN` -- so an emptied field would otherwise commit a zero-hour night on the way to
 * typing "10". Zero itself is a real answer: an all-nighter is a night a student really has,
 * and it has to be tellable from a field nobody has filled in.
 */
function readHours(text: string): { hours: number } | { problem: string } {
  if (text.trim() === '') return { problem: 'How many hours? A rough number is fine.' }

  const hours = Number(text)
  if (!isRealSleepHours(hours)) {
    return { problem: `Somewhere between none at all and ${MAX_SLEEP_HOURS} hours.` }
  }

  return { hours }
}

export function SleepSheet({
  targetHours,
  nights,
  realityLine,
  onSetTarget,
  onSetNight,
  onClose,
}: {
  readonly targetHours: number
  readonly nights: readonly PlannedNight[]
  /**
   * §7.6's line, or null.
   *
   * Null both when nothing has been measured and when low-energy mode is withholding it: a
   * measured statement about the student's own habits is exactly what that mode exists to
   * hold back, and this component does not need to know which reason applies.
   */
  readonly realityLine: string | null
  readonly onSetTarget: (hours: number) => void
  readonly onSetNight: (dayIndex: number, hours: number) => void
  readonly onClose: () => void
}): JSX.Element {
  /**
   * What is in each field, which is not the same as what the week holds.
   *
   * Keyed by day index, with `null` for the target. A field is only in here while the student
   * is editing it; everything else reads its value from the week, so a change made anywhere
   * else still shows up.
   */
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [problems, setProblems] = useState<Record<string, string>>({})

  const valueOf = (key: string, stored: number): string | number =>
    drafts[key] ?? stored

  const clearProblem = (key: string) =>
    setProblems((current) => {
      const { [key]: _gone, ...rest } = current
      return rest
    })

  /**
   * While typing: hold the text, say whether it can be used, and write nothing.
   *
   * Nothing, because a half-typed number is a whole valid one. "3" on the way to "30" would
   * otherwise commit a three-hour night -- persisted, re-projected, and then left standing
   * while the field on screen said "30" beside an error. The model would be holding a figure
   * the student never meant, which is the class of silent write this project has a rule
   * against.
   */
  const typing = (key: string, text: string) => {
    setDrafts((current) => ({ ...current, [key]: text }))

    const read = readHours(text)
    if ('problem' in read) {
      setProblems((current) => ({ ...current, [key]: read.problem }))
      return
    }

    clearProblem(key)
  }

  /**
   * On leaving the field: commit it, if it can be committed.
   *
   * The draft is dropped on a good value so the field goes back to reading the week -- which
   * is what makes a change from anywhere else show up here. A bad value keeps its draft and
   * its error rather than being reverted: silently replacing what somebody typed with the old
   * figure tells them nothing about why.
   */
  const finished = (key: string, stored: number, commit: (hours: number) => void) => {
    const text = drafts[key]
    if (text === undefined) return

    const read = readHours(text)
    if ('problem' in read) return

    setDrafts((current) => {
      const { [key]: _gone, ...rest } = current
      return rest
    })

    if (read.hours !== stored) commit(read.hours)
  }

  return (
    <Sheet title="Sleep" onClose={onClose}>
      <Field label="Hours a night you are aiming for" error={problems.target}>
        <input
          type="number"
          data-testid="sleep-target"
          min={0}
          max={MAX_SLEEP_HOURS}
          step={0.5}
          value={valueOf('target', targetHours)}
          onChange={(event) => typing('target', event.target.value)}
          onBlur={() => finished('target', targetHours, onSetTarget)}
          className={INPUT}
        />
      </Field>

      {/* `Field` renders the error itself for screen readers; this is the same sentence under
          a testid, so a test asserts what a student sees rather than a class name. */}
      {problems.target !== undefined && (
        <p data-testid="sleep-target-error" className="sr-only">
          {problems.target}
        </p>
      )}

      {/* Under the field rather than above it, mirroring where `TodayCard` puts its own bias
          line and for that line's stated reason: above, it colours the choice being made
          rather than informing it. */}
      {realityLine !== null && (
        <p data-testid="sleep-reality" className="mt-3 text-sm text-ink-soft">
          {realityLine}
        </p>
      )}

      <hr className="my-3 border-line" />

      <ul className="flex flex-col gap-3">
        {nights.map((night) => (
          <li key={night.dayIndex} data-testid={`sleep-night-${night.dayIndex}`}>
            <Field label={night.label} error={problems[String(night.dayIndex)]}>
              <input
                type="number"
                data-testid={`sleep-night-${night.dayIndex}-hours`}
                min={0}
                max={MAX_SLEEP_HOURS}
                step={0.5}
                value={valueOf(String(night.dayIndex), night.hours)}
                onChange={(event) => typing(String(night.dayIndex), event.target.value)}
                onBlur={() =>
                  finished(String(night.dayIndex), night.hours, (hours) =>
                    onSetNight(night.dayIndex, hours),
                  )
                }
                className={INPUT}
              />
            </Field>

            {problems[String(night.dayIndex)] !== undefined && (
              <p data-testid={`sleep-night-${night.dayIndex}-error`} className="sr-only">
                {problems[String(night.dayIndex)]}
              </p>
            )}

            {night.forecast !== null && (
              <p
                data-testid={`sleep-forecast-${night.dayIndex}`}
                className="mt-1 text-xs font-medium text-ink"
              >
                {night.forecast}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
