import type { EngineParams } from '../engine'
import type { Schedule, ScheduledItem } from './types'

/**
 * Whether two blocks occupy any of the same hours on the same day.
 *
 * Exported because the manual edit form asks the same question `violations` does, about a
 * block that is not in the schedule yet. Two definitions of "overlap" -- one here, one in
 * the form -- would eventually disagree about a half-hour boundary, and the one the student
 * saw would be the wrong one.
 *
 * Note this is the raw geometry only. Whether an overlap is a *violation* is a separate
 * judgement, and one `violations` below and the edit form deliberately make differently:
 * the solver tolerates two movable blocks on top of each other, and a student who has just
 * put them there does not want that tolerated silently.
 */
export const overlaps = (a: ScheduledItem, b: ScheduledItem): boolean =>
  a.dayIndex === b.dayIndex &&
  a.startHour < b.startHour + b.hours &&
  b.startHour < a.startHour + a.hours

/**
 * Whether a block counts against the daily hours cap.
 *
 * Exported alongside `overlaps` and for the same reason: the edit form asks the same
 * question when it warns a student that a day will not hold, and a second copy of "what
 * counts as work" would let the warning and the constraint drift apart.
 *
 * Sleep enters through `Schedule.sleepByDay` rather than as a block, and rest is what
 * recovers from the load -- neither is what the cap is capping.
 */
export const isWork = (item: ScheduledItem): boolean =>
  item.kind !== 'rest' && item.kind !== 'sleep'

/**
 * §2.1's hard constraints.
 *
 * These are constraints, not penalty terms. A schedule that breaks one is rejected
 * outright rather than scored badly, so no amount of gain elsewhere can buy its way past
 * them.
 *
 * That distinction matters most for protected rest. §5.1 calls making recovery
 * structurally protected the most important design decision in the app -- and a rest
 * block the solver could move for a good enough score is a rest block that is optional
 * again, which is the exact thing the app exists to prevent.
 *
 * Two movable blocks overlapping is deliberately *not* a violation: neither is pinned,
 * so the search can still separate them, and rejecting that state would cut off legal
 * paths through the neighbourhood.
 */
export function violations(schedule: Schedule, params: EngineParams): string[] {
  const found: string[] = []

  for (const item of schedule.items) {
    if (item.deadlineDay !== null && item.dayIndex > item.deadlineDay) {
      found.push(`${item.title} is scheduled past its deadline`)
    }
  }

  // Bucketed by day before the pairwise comparison. Two blocks can only overlap if they
  // share a day, so comparing every item against every other is quadratic in the whole
  // schedule to answer a question that is quadratic in a single day. On a real
  // three-week schedule that is the difference between ~1,300 comparisons and ~60 -- and
  // this function runs for every candidate the search considers, thousands of times per
  // solve, so it is squarely on the path §2.1 budgets at under 100ms.
  const byDay = new Map<number, ScheduledItem[]>()
  for (const item of schedule.items) {
    const bucket = byDay.get(item.dayIndex)
    if (bucket) bucket.push(item)
    else byDay.set(item.dayIndex, [item])
  }

  for (const items of byDay.values()) {
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i]!
        const b = items[j]!
        if (!overlaps(a, b)) continue

        if (a.protectedRest || b.protectedRest) {
          found.push(`${a.title} and ${b.title} overlap protected rest`)
        } else if (a.fixed || b.fixed) {
          found.push(`${a.title} and ${b.title} overlap a fixed block`)
        }
      }
    }
  }

  // §2.1: daily hours capped so the solver cannot solve a week with a 14-hour Sunday.
  for (const [day, items] of byDay) {
    let hours = 0
    for (const item of items) if (isWork(item)) hours += item.hours

    if (hours > params.dailyHoursCap) {
      found.push(`day ${day} exceeds the daily hours cap`)
    }
  }

  return found
}

export function isValid(schedule: Schedule, params: EngineParams): boolean {
  return violations(schedule, params).length === 0
}
