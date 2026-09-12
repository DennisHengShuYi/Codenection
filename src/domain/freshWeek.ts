import {
  DEFAULT_SLEEP_HOURS,
  FULL_RESERVE,
  HORIZON_DAYS,
  LOAD_TYPES,
  type Reserves,
} from '../engine'
import type { Schedule } from '../optimizer'

/**
 * The fortnight a real, signed-in student starts from.
 *
 * The counterpart to `umCrunchWeek`, and the distinction is the whole point of this module.
 * That fixture is a demo: it carries a UM timetable, three invented assignments and
 * `CRUNCH_START`'s 41/44/32/55, all chosen so a visitor with no account sees a week worth
 * looking at (Ruling 14 step 0). `useProfile` already refuses to hand a signed-in account the
 * matching fabricated profile and block log -- "a real signed-in account is a real student,
 * not a preview" -- but the week itself had no such gate, so a student's first screen showed
 * somebody else's classes over a gauge reporting somebody else's depletion.
 *
 * Full reserve rather than a plausible mid-semester figure, and that is the honest choice
 * rather than the flattering one. On day 0 `roomModel` reads `schedule.start` straight onto
 * the dial and the five bars, because there is no prior day to project from -- so whatever
 * sits here is stated to the student as a measurement. The app has seen nothing that could
 * have drained them, so it claims nothing: the gauge opens at 100% and falls as real
 * commitments arrive, which also makes the first drain visible instead of lost in a number
 * that was already low.
 *
 * Unanchored on purpose. `RoomShell` stamps day 0 with the student's own date on first
 * render (§9 puts that decision at UTC+8), and a week that anchored itself here would date
 * the student from whenever this function happened to run.
 */
export function freshWeek(): Schedule {
  const start = Object.fromEntries(
    LOAD_TYPES.map((type) => [type, FULL_RESERVE]),
  ) as unknown as Reserves

  return {
    items: [],
    start,
    horizonDays: HORIZON_DAYS,
    // `DEFAULT_SLEEP_HOURS` rather than a figure of its own: this file's original comment
    // recorded that an unedited week and an unedited day must agree rather than each guessing
    // separately, and held the two in step by hand. Imported, that invariant cannot drift.
    sleepByDay: Array.from({ length: HORIZON_DAYS }, () => DEFAULT_SLEEP_HOURS),
  }
}
