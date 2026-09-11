import type { JSX } from 'react'
import { dateFor, dayIndexFor, dayLabel, isAnchored } from '../../domain/calendar'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'
import { Field } from '../kit/Field'

/**
 * Picking a day from the fortnight.
 *
 * The form offered a `<select>` of all twenty-one days, which on a phone is a scrolling
 * column of dates and on a laptop a popup taller than the sheet it came from. Nobody reads a
 * date that way; they look for it on a calendar.
 *
 * A native `<input type="date">` rather than a drawn month grid. The browser brings a real
 * calendar, keyboard support, an announced field and the platform's own phone picker -- none
 * of which a hand-rolled view gets for free, and all of which it would get subtly wrong.
 * `min` and `max` fence it to the horizon, so a day the model cannot hold is not offerable.
 *
 * The fallback is not an afterthought. A week with no `startedOn` has no dates at all -- the
 * seeded fortnight has never been anchored, which is an ordinary state rather than an error
 * -- so there is nothing to show a calendar of, and the day numbers come back instead. That
 * is `dayLabel`'s own reasoning, applied to the control rather than to the label.
 */
const INPUT =
  'min-h-11 rounded border border-line bg-surface px-2 py-1 text-sm text-ink'

export function DayPicker({
  schedule,
  today,
  value,
  label,
  error,
  optional = false,
  testId,
  onChange,
}: {
  readonly schedule: Schedule
  /** For naming the days on the fallback list: "Today" and "Tomorrow" are not recoverable
   *  from a date alone, and they are the two most likely to be picked. */
  readonly today: number
  readonly value: number | null
  readonly label: string
  readonly error?: string
  /** Whether "nothing chosen" is an answer. A scheduled day is required; a deadline is not,
   *  and most of what a student types in is not due on any particular day. */
  readonly optional?: boolean
  readonly testId?: string
  readonly onChange: (dayIndex: number | null) => void
}): JSX.Element {
  const days = Array.from({ length: HORIZON_DAYS }, (_, dayIndex) => dayIndex)

  if (!isAnchored(schedule)) {
    return (
      <Field label={label} error={error}>
        <select
          data-testid={testId}
          value={value === null ? '' : String(value)}
          onChange={(event) =>
            onChange(event.target.value === '' ? null : Number(event.target.value))
          }
          className={INPUT}
        >
          {optional && <option value="">Not set</option>}
          {days.map((dayIndex) => (
            <option key={dayIndex} value={dayIndex}>
              {dayLabel(schedule, dayIndex, today)}
            </option>
          ))}
        </select>
      </Field>
    )
  }

  return (
    <Field label={label} error={error}>
      <input
        type="date"
        data-testid={testId}
        value={(value === null ? null : dateFor(schedule, value)) ?? ''}
        min={dateFor(schedule, 0) ?? undefined}
        max={dateFor(schedule, HORIZON_DAYS - 1) ?? undefined}
        onChange={(event) => {
          // A date outside the fortnight has no day index to become. The field fences it,
          // and this is the second half of the same fence: a typed date, or one from a
          // browser that ignores `min`, is dropped rather than clamped into a day the
          // student did not choose.
          const picked = event.target.value === '' ? null : dayIndexFor(schedule, event.target.value)

          if (event.target.value !== '' && picked === null) return

          onChange(picked)
        }}
        className={INPUT}
      />
    </Field>
  )
}
