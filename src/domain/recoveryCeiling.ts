import type { Schedule } from '../optimizer'

/**
 * §5.1: recovery has a ceiling as well as a floor.
 *
 * The engine already holds one, and it holds it per *block*: `recoveryForDay` credits at
 * most `USEFUL_REST_HOURS` from any single rest block, deliberately, "so that three separate
 * hours of rest still pay out three hours' worth. It is the single unbroken twelve-hour
 * block that is suspect."
 *
 * That leaves a day-shaped hole, and it is a real one. Five rest blocks credit fifteen
 * hours. Worse, `constraints.isWork` excludes rest from the daily hours cap — correctly, it
 * is not what the cap is capping — so nothing anywhere counts how much of one day has been
 * given over to recovery. A day can be filled with protected rest that no check ever sees.
 *
 * The consequence is concrete rather than theoretical: `placeItems` places work anyway when
 * nothing fits, that work lands on top of protected rest, and `violations` then reports an
 * overlap with protected rest. The week is invalid, and the search can only walk it back by
 * moving *work*, because rest is `fixed` and `protectedRest` both.
 */

/**
 * Hours of rest one day may be credited with before the model stops believing it.
 *
 * Twice `USEFUL_REST_HOURS`. Past two full useful blocks in a single day, a student is not
 * recovering on a schedule — something has gone wrong with the week, and crediting more
 * would let the model report a collapsing fortnight as an unusually restful one.
 *
 * Deliberately generous. This is a backstop against flooding, not an opinion about how much
 * rest is enough, and §5.3's "the app refuses to help you work" stance is the app being
 * firm about resting more, never less.
 */
export const DAILY_RECOVERY_CEILING = 6

/**
 * Rest already scheduled on a day.
 *
 * Counts every rest block, protected or not, because `recoveryForDay` does not ask either
 * before it pays out. A ceiling that only saw protected rest would be trivially walked
 * past by the manual event form.
 */
export function restHoursOn(schedule: Schedule, dayIndex: number, excludeId?: string): number {
  let hours = 0

  for (const item of schedule.items) {
    if (item.dayIndex !== dayIndex) continue
    if (item.kind !== 'rest') continue
    if (excludeId !== undefined && item.id === excludeId) continue

    hours += item.hours
  }

  return hours
}

/**
 * How much more rest this day can hold.
 *
 * Never negative. A day already over the ceiling is reachable — a week restored from before
 * this existed, or one edited by hand — and reporting a negative figure would turn "no room"
 * into arithmetic every caller had to remember to clamp.
 */
export function roomForRest(schedule: Schedule, dayIndex: number, excludeId?: string): number {
  return Math.max(0, DAILY_RECOVERY_CEILING - restHoursOn(schedule, dayIndex, excludeId))
}
