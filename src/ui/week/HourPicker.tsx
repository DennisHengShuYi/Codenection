import { DAY_END_HOUR, WAKE_HOUR } from '../../optimizer'
import { hourLabel } from '../kit/labels'

/**
 * The hour a block starts, as a clock rather than as twenty-four rows.
 *
 * It was a `<select>` of every hour of the day: the control that reads best in markup and
 * worst on a screen, since changing 09:00 to 10:00 meant opening a list of twenty-four
 * near-identical lines and finding the next one. A time input is a thing everybody already
 * knows how to type into, and on a phone it is the platform's own clock.
 *
 * The same choice `DayPicker` made one file over, and for the same reason: where the platform
 * has a control for this exact quantity, a hand-rolled list is worse at it.
 *
 * **Whole hours only, because that is all the model holds.** `startHour` is an integer and
 * the week grid draws on it. `step` asks the browser for hours, which is what turns the
 * spinner into an hour stepper -- but a student can still type 08:30, so minutes are floored
 * here rather than refused. Refusing would leave somebody fighting a field that will not take
 * what they typed; flooring takes the hour and redraws the field to it, so what happened is
 * on screen rather than behind them.
 */
export function HourPicker({
  value,
  onChange,
  optional = false,
  className = '',
  ...rest
}: {
  readonly value: number | null
  readonly onChange: (hour: number | null) => void
  /**
   * Whether "no hour" is an answer, said by leaving the clock blank.
   *
   * `ItemChip`'s time was a `<select>` whose first option was "Any time", and that is a
   * genuine third answer rather than a missing one: an essay due Friday has a day and no
   * hour, and pinning one takes away the freedom the rebalancer needs to place it. A time
   * input can be empty, so it can say that too -- exactly as `DayPicker`'s own `optional`
   * means no day.
   *
   * Off by default, because a block on the week must start somewhere: a form that let its
   * hour be cleared would be offering a state the model cannot hold.
   */
  readonly optional?: boolean
  readonly className?: string
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'step' | 'className'
>) {
  return (
    <input
      type="time"
      // Hours. Without it the spinner steps in minutes and the picker offers times this app
      // cannot hold.
      step={3600}
      /*
       * Fenced to the day the app actually schedules, and that is what shortens the list.
       *
       * The picker is the platform's -- Chrome draws a time input's as a scrolling column --
       * so there is no styling this shorter. There are only fewer hours to show. These are
       * the bounds `gapsOn` already walks: nothing is ever placed before `WAKE_HOUR`, so
       * offering 03:00 was offering an hour the app would not schedule into.
       *
       * A fence rather than a refusal. `value` is not clamped, because a block already at
       * 02:00 -- imported from a calendar, or set before this fence existed -- is a fact
       * about the week, and a field that silently moved it would be lying about the week to
       * tidy its own list.
       */
      min={hourLabel(WAKE_HOUR)}
      max={hourLabel(DAY_END_HOUR - 1)}
      value={value === null ? '' : hourLabel(value)}
      onChange={(event) => {
        /*
         * Matched before it is parsed, and that is not belt and braces.
         *
         * `Number('')` is 0, not NaN -- so a cleared field read as midnight and moved the
         * block there, silently. A browser also blanks the value rather than reporting it
         * when a time is not a time, so "99:00" arrives here as an empty string and would
         * have done the same. An empty or half-typed field is not an hour yet, and guessing
         * one moves a block under somebody mid-keystroke.
         */
        const said = /^(\d{2}):(\d{2})$/.exec(event.target.value)

        if (said === null) {
          // Blank is an answer where the caller allows one, and nothing at all where it does
          // not -- the same fork `DayPicker` makes for a day nobody has chosen.
          if (optional && event.target.value === '') onChange(null)
          return
        }

        const hour = Number(said[1])
        if (hour < 0 || hour > 23) return

        onChange(hour)
      }}
      className={`min-h-11 w-full rounded border border-line bg-surface px-2 py-1 text-sm text-ink ${className}`}
      {...rest}
    />
  )
}
