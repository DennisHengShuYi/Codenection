import type { EngineParams } from '../engine'
import type { Schedule, ScheduledItem } from './types'

const overlaps = (a: ScheduledItem, b: ScheduledItem): boolean =>
  a.dayIndex === b.dayIndex &&
  a.startHour < b.startHour + b.hours &&
  b.startHour < a.startHour + a.hours

const isWork = (item: ScheduledItem): boolean =>
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

  for (let i = 0; i < schedule.items.length; i += 1) {
    for (let j = i + 1; j < schedule.items.length; j += 1) {
      const a = schedule.items[i]!
      const b = schedule.items[j]!
      if (!overlaps(a, b)) continue

      if (a.protectedRest || b.protectedRest) {
        found.push(`${a.title} and ${b.title} overlap protected rest`)
      } else if (a.fixed || b.fixed) {
        found.push(`${a.title} and ${b.title} overlap a fixed block`)
      }
    }
  }

  // §2.1: daily hours capped so the solver cannot solve a week with a 14-hour Sunday.
  for (let day = 0; day < schedule.horizonDays; day += 1) {
    const hours = schedule.items
      .filter((item) => item.dayIndex === day && isWork(item))
      .reduce((sum, item) => sum + item.hours, 0)

    if (hours > params.dailyHoursCap) {
      found.push(`day ${day} exceeds the daily hours cap`)
    }
  }

  return found
}

export function isValid(schedule: Schedule, params: EngineParams): boolean {
  return violations(schedule, params).length === 0
}
