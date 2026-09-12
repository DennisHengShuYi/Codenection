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
  className = '',
  ...rest
}: {
  readonly value: number
  readonly onChange: (hour: number) => void
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
      value={hourLabel(value)}
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
        if (said === null) return

        const hour = Number(said[1])
        if (hour < 0 || hour > 23) return

        onChange(hour)
      }}
      className={`min-h-11 w-full rounded border border-line bg-surface px-2 py-1 text-sm text-ink ${className}`}
      {...rest}
    />
  )
}
