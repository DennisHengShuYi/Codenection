import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'

const DEFAULT_DEFER_DAYS = 2

/**
 * The first place in the app that edits a week outside the optimizer.
 *
 * §1.3 requires tapping a clutter box to have "real model consequences" rather than only
 * changing the picture, and these are those consequences. Plain functions over a
 * schedule, the same shape the optimizer works in, so the projection recomputes from the
 * edited week with nothing else to keep in step.
 */
export function completeItem(schedule: Schedule, id: string): Schedule {
  return { ...schedule, items: schedule.items.filter((item) => item.id !== id) }
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
