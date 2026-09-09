import type { Schedule, ScheduledItem } from '../optimizer'

/**
 * The blocks on one day, in the order they happen.
 *
 * Ordered by start hour because a check-in walks the day as it was lived: asking about the
 * evening before the morning would be harder to answer than the day was to get through.
 *
 * Protected rest is included rather than filtered out. §5.1 makes rest a scheduled object
 * with weight rather than a notification, and whether it actually happened is exactly what
 * §5.2's failed-recovery logging needs to know.
 *
 * A copy is returned, sorted; the schedule handed in is never reordered.
 */
export function blocksOnDay(schedule: Schedule, dayIndex: number): readonly ScheduledItem[] {
  return schedule.items
    .filter((item) => item.dayIndex === dayIndex)
    .slice()
    .sort((left, right) => left.startHour - right.startHour)
}
