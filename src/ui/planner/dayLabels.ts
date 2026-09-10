import type { Calendar } from '../../ai'
import { dateFor } from '../../domain/calendar'
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
  return Array.from({ length: HORIZON_DAYS }, (_, dayIndex) => {
    const relative =
      dayIndex === today ? 'Today' : dayIndex === today + 1 ? 'Tomorrow' : null

    const date = dateFor(schedule, dayIndex)
    if (date === null) {
      const numbered = `Day ${dayIndex + 1}`
      return relative === null ? numbered : `${relative}, ${numbered}`
    }

    // UTC throughout, matching `dateFor`: the date is an ISO day, and reading it back in a
    // local timezone west of Greenwich would name the day before.
    const named = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })

    return relative === null ? named : `${relative}, ${named}`
  })
}

/**
 * §44: which real day the horizon's day 0 is, for the two readers rather than the screen.
 *
 * Both of them needed this and neither had it. The rules parser worked out a named weekday
 * from `today % 7`, which is only right if day 0 is a Sunday; the model was told
 * "deadlineDay is a day index from 0 (today)" and never told what today was, so a stated
 * "thursday" could only be guessed at. Either way "gym thursday 7pm" landed on a day chosen
 * by arithmetic rather than by the student, and §43's Day select is what finally showed it.
 *
 * `todayLabel` is absent for a week that has never been dated. There is nothing true to
 * say there, and a made-up date would send the model a confident wrong answer -- the rules
 * fall back to their old behaviour instead, which is what that week has always had.
 */
export function calendarFor(schedule: Schedule, today: number): Calendar {
  const startDate = dateFor(schedule, 0)
  const todayDate = dateFor(schedule, today)

  // UTC throughout, matching `dateFor`: read in a local timezone west of Greenwich, an ISO
  // day names the day before, and a weekday off by one is the whole bug this fixes.
  const startWeekday =
    startDate === null ? 0 : new Date(`${startDate}T00:00:00Z`).getUTCDay()

  const todayLabel =
    todayDate === null
      ? undefined
      : new Date(`${todayDate}T00:00:00Z`).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        })

  return { today, startWeekday, ...(todayLabel === undefined ? {} : { todayLabel }) }
}
