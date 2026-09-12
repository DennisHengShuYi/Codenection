import { useState, type JSX } from 'react'
import { isRealSleepHours, MAX_SLEEP_HOURS } from '../../domain/sleepPlan'
import { Field } from '../kit/Field'
import { hourLabel } from '../kit/labels'
import { Sheet } from '../kit/Sheet'

/**
 * Ruling 66: a page rather than a card, and that is the whole point of it. §8's check-in asks
 * "how much sleep last night?" once a day and then disappears -- it is CHECKING, about a night
 * that already happened, and the answer teaches the model. This is PLANNING: what the student
 * intends, reachable whenever they want it. The two write to different places for that reason,
 * and `domain/sleepReality` is what compares them.
 *
 * Two fields, and that is the design rather than a simplification.
 *
 * It offered four: a target and the next three nights, each typed. The three were asking for
 * something a student cannot answer -- nobody knows on Saturday what they will sleep on
 * Monday. Those nights matter enormously to the model, which projects three weeks from them,
 * but the answer belongs to the student's own history (`sleepReality`) rather than to a form.
 * What the page owes them instead is the ASSUMPTION the app is making, which was invisible
 * while four fields asked them to fill it in by hand.
 *
 * Every commit is owned by the parent -- `RestPreview`'s division, and the established one
 * here. What this component owns is the half-typed state of a field, which is nobody else's
 * business: a draft of "1" on the way to "12" must not reach the week.
 */

const INPUT =
  'min-h-11 w-24 rounded border border-line bg-surface px-2 py-1 text-sm tabular-nums text-ink'

/** Every clock hour, for the wake-time picker. The same shape the edit form uses for a start
 *  hour -- a clock hour is one of twenty-four, not a number to be validated. */
const HOURS_OF_DAY = Array.from({ length: 24 }, (_, hour) => hour)

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
  tonightHours,
  realityLine,
  enoughLine,
  forecasts,
  wakeHour,
  tonightWindow,
  onSetTarget,
  onSetWakeHour,
  onSetTonight,
  onClose,
}: {
  readonly targetHours: number
  /** `sleepByDay[today]`, which under §6.1 is the night at the END of today -- tonight. */
  readonly tonightHours: number
  /**
   * §7.6's line about the gap between what is planned and what is actually slept, or null.
   *
   * Null both when nothing has been measured -- fewer than three reported nights -- and when
   * low-energy mode is withholding it, because a measured statement about the student's own
   * habits is exactly what that mode exists to hold back. This component does not need to
   * know which reason applies.
   */
  readonly realityLine: string | null
  /**
   * What this student's own nights say about how much sleep is enough for them, or nothing.
   *
   * Separate from `realityLine` rather than folded into it. That one compares the plan with
   * what happened; this one is a claim about the student, and the two are measured from
   * different evidence and go quiet independently. One merged sentence would have to wait for
   * both.
   */
  readonly enoughLine: string | null
  /** Days whose load will come out of a night, each sentence already naming its own day, so
   *  this component derives nothing and cannot disagree with the room about a date. */
  readonly forecasts: readonly string[]
  /** The clock hour the student gets up, which anchors the night -- see `domain/nightWindow`
   *  for why the morning is stored and the bedtime counted back from it. */
  readonly wakeHour: number
  /** Tonight's window in words, counted back from waking by the caller. Handed over already
   *  said, the way every other figure on this page is, so this component derives nothing. */
  readonly tonightWindow: string
  readonly onSetTarget: (hours: number) => void
  readonly onSetWakeHour: (hour: number) => void
  readonly onSetTonight: (hours: number) => void
  readonly onClose: () => void
}): JSX.Element {
  /**
   * What is in each field, which is not the same as what the week holds.
   *
   * A field is only in here while the student is editing it; otherwise it reads its value
   * from the week, so a change made anywhere else still shows up.
   */
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [problems, setProblems] = useState<Record<string, string>>({})

  const forget = (key: string, from: Record<string, string>): Record<string, string> => {
    const { [key]: _gone, ...rest } = from
    return rest
  }

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

    setProblems((current) => forget(key, current))
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

    setDrafts((current) => forget(key, current))
    if (read.hours !== stored) commit(read.hours)
  }

  const hoursField = (
    key: string,
    label: string,
    stored: number,
    commit: (hours: number) => void,
  ) => (
    <>
      <Field label={label} error={problems[key]}>
        <input
          type="number"
          data-testid={`sleep-${key}`}
          min={0}
          max={MAX_SLEEP_HOURS}
          step={0.5}
          value={drafts[key] ?? stored}
          onChange={(event) => typing(key, event.target.value)}
          onBlur={() => finished(key, stored, commit)}
          className={INPUT}
        />
      </Field>

      {/* `Field` renders the error itself for screen readers; this is the same sentence under
          a testid, so a test asserts what a student sees rather than a class name. */}
      {problems[key] !== undefined && (
        <p data-testid={`sleep-${key}-error`} className="sr-only">
          {problems[key]}
        </p>
      )}
    </>
  )

  return (
    <Sheet title="Sleep" onClose={onClose}>
      {hoursField('target', 'Hours a night you are aiming for', targetHours, onSetTarget)}

      {/* Under the field rather than above it, mirroring where `TodayCard` puts its own bias
          line and for that line's stated reason: above, it colours the figure being chosen
          rather than informing it. */}
      {realityLine !== null && (
        <p data-testid="sleep-reality" className="mt-3 text-sm text-ink-soft">
          {realityLine}
        </p>
      )}

      {/* Under the target field for the same reason the line above it is: a claim about how
          much sleep this student needs, sitting above the field, would colour the figure being
          chosen rather than inform it. */}
      {enoughLine !== null && (
        <p data-testid="sleep-enough" className="mt-2 text-sm text-ink-soft">
          {enoughLine}
        </p>
      )}

      <hr className="my-3 border-line" />

      <Field label="Up at">
        <select
          data-testid="sleep-wake"
          value={wakeHour}
          onChange={(event) => onSetWakeHour(Number(event.target.value))}
          className={INPUT}
        >
          {HOURS_OF_DAY.map((hour) => (
            <option key={hour} value={hour}>
              {hourLabel(hour)}
            </option>
          ))}
        </select>
      </Field>

      <hr className="my-3 border-line" />

      {hoursField('tonight', 'Tonight', tonightHours, onSetTonight)}

      {/* What tonight actually covers, on a clock. A night is the boundary between two days
          rather than something inside one, which is why this is a window and not a row on the
          week's hour grid -- see `domain/nightWindow`. */}
      <p data-testid="sleep-window" className="mt-1 text-sm tabular-nums text-ink-soft">
        {tonightWindow}
      </p>

      {forecasts.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {forecasts.map((sentence) => (
            <li
              key={sentence}
              data-testid="sleep-forecast"
              className="text-xs font-medium text-ink"
            >
              {sentence}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}
