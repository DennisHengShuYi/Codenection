import { dayLabel } from '../../domain/calendar'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'

/**
 * §43: the horizon's days, named the way a student recognises them.
 *
 * The chip now asks which day an item lands on, and the answer it stores is a day index --
 * the domain's own number. A `<select>` offering "Day 0" through "Day 20" would be asking
 * the student to think in the model's terms about their own week, so the index is
 * translated here, once, where the week that anchors it is in hand.
 *
 * "Today" and "Tomorrow" are named rather than dated because that is how someone refers to
 * the two days they are most likely to be adding something to, and neither is recoverable
 * from a date on its own.
 *
 * A week with no `startedOn` is an ordinary state, not an error: the seeded fortnight has
 * never been dated. Day numbers are a poorer label than a date and a far better one than a
 * select that cannot render, so the question can still be asked.
 */
export function dayLabelsFor(schedule: Schedule, today: number): readonly string[] {
  return Array.from({ length: HORIZON_DAYS }, (_, dayIndex) =>
    dayLabel(schedule, dayIndex, today),
  )
}
