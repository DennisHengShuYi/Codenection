import { HORIZON_DAYS, type ActivityKind, type LoadType } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { dropCommitmentFor } from './commitments'

const DEFAULT_DEFER_DAYS = 2

/**
 * The first place in the app that edits a week outside the optimizer.
 *
 * §1.3 requires tapping a clutter box to have "real model consequences" rather than only
 * changing the picture, and these are those consequences. Plain functions over a
 * schedule, the same shape the optimizer works in, so the projection recomputes from the
 * edited week with nothing else to keep in step.
 */

/**
 * Everything the student can set about a block by hand.
 *
 * Deliberately NOT every field of a `ScheduledItem`. `intensity` is a modelling number a
 * student has no way to judge; `deadlineDay` comes from what the work actually is;
 * `seriesId` belongs to the recurrence that created it; and `protectedRest` is §5.1's
 * invariant -- nothing a student types may mint protected recovery, which is why `addBlock`
 * below hardcodes it false exactly as `placeItems` does. Editing an existing protected
 * block keeps its protection, and the form says what moving it means.
 */
export interface ItemFields {
  readonly title: string
  readonly type: LoadType
  readonly kind: ActivityKind
  readonly hours: number
  readonly dayIndex: number
  readonly startHour: number
  readonly fixed: boolean
}

const withoutItem = (schedule: Schedule, id: string): Schedule => ({
  ...schedule,
  items: schedule.items.filter((item) => item.id !== id),
})

export function completeItem(schedule: Schedule, id: string): Schedule {
  return withoutItem(schedule, id)
}

/**
 * Pushes an item later.
 *
 * Bounded twice, and both bounds matter. It never crosses the item's deadline, because
 * deferring must not become a way to make a deadline quietly disappear. And it never
 * leaves the horizon, because an item pushed off the end vanishes from the model while
 * still existing in the student's life.
 *
 * §6.4 says deferred load should compound rather than vanish. Rolling debt is not built
 * yet, so this moves the item honestly and the interface says the cost is coming, rather
 * than implying the week just got easier.
 */
export function deferItem(
  schedule: Schedule,
  id: string,
  byDays: number = DEFAULT_DEFER_DAYS,
): Schedule {
  return {
    ...schedule,
    items: schedule.items.map((item) => {
      if (item.id !== id) return item

      const latest = item.deadlineDay ?? HORIZON_DAYS - 1

      return { ...item, dayIndex: Math.min(item.dayIndex + byDays, latest, HORIZON_DAYS - 1) }
    }),
  }
}

/**
 * Writes the student's own version of a block over the app's.
 *
 * Every field outside `ItemFields` survives, which is the point: a protected nap edited to
 * a different hour is still protected, a recurring class edited in one week keeps its
 * series, and a deadline the student was never shown is not silently cleared by a form that
 * never asked about it.
 *
 * An unknown id is a no-op rather than a throw. It happens for real -- the same stale-id
 * case `blockSheet` already handles by closing the sheet.
 */
export function editItem(schedule: Schedule, id: string, fields: ItemFields): Schedule {
  return {
    ...schedule,
    items: schedule.items.map((item) => (item.id === id ? { ...item, ...fields } : item)),
  }
}

/**
 * Takes a block out because it is not happening.
 *
 * Mechanically what `completeItem` does to the week, and deliberately a separate name: "I
 * did it" and "this is off" are different facts about a block, and on the day one of them
 * starts being logged rather than dropped, only one of these two should change. A caller
 * that reached for whichever name was handy would make that change unsafe.
 *
 * Unlike `completeItem` it also retires the provisional acceptance behind the block, where
 * there was one -- a yes with nothing left to point at (§2.3).
 */
export function removeItem(schedule: Schedule, id: string): Schedule {
  return dropCommitmentFor(withoutItem(schedule, id), id)
}

/**
 * Puts a block in the week exactly where the student said.
 *
 * Deliberately NOT `placeItems`, which is the right path for something the app read off a
 * photo or a paragraph and has to find room for. Here the student has already chosen the
 * day and the hour on a grid they were looking at, and auto-placing it somewhere else would
 * be the app overriding a decision it had just asked them to make. Where that choice
 * clashes with something, the form says so before the save -- see `editWarnings`.
 *
 * The id follows `scheduleRecovery`'s pattern: the clock plus the current length, which
 * cannot collide within one week because the length moves with every add.
 */
export function addBlock(schedule: Schedule, fields: ItemFields): Schedule {
  const added: ScheduledItem = {
    ...fields,
    id: `manual-${Date.now()}-${schedule.items.length}`,
    intensity: 1,
    deadlineDay: null,
    // §5.1: nothing a student types may create structurally protected recovery. Only
    // `scheduleRecovery` and the prescription path may, and both are the app's own advice.
    protectedRest: false,
  }

  return { ...schedule, items: [...schedule.items, added] }
}
