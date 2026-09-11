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

/**
 * Whether a block has actually happened, and so whether it can be asked about.
 *
 * A past day is askable as it always was. A future day never is. Today is askable only once
 * the block has finished -- otherwise a check-in asks about something that has not happened,
 * and whatever the student answers is recorded as a measurement of it.
 *
 * Here rather than inside `blockToAsk`, which is where it used to live, because the today
 * card was not the only surface asking: Telegram's `/today` asked about the first unanswered
 * block on the day whatever the hour, and `/day` asked about days still ahead. §8b② requires
 * that "a student answering in both places must not meet two different questions", and two
 * copies of a rule is how they came to.
 *
 * `nowHour` is a parameter rather than a clock read here, matching every other rule in this
 * folder: the clock enters at the edges and nowhere deeper.
 */
export function hasHappened(
  /** Everything the question needs and nothing else, so a `ScheduledItem` and the bot's own
   *  `BlockLine` both satisfy it without either module learning about the other's type. */
  block: { readonly dayIndex: number; readonly startHour: number; readonly hours: number },
  today: number,
  nowHour: number,
): boolean {
  if (block.dayIndex < today) return true
  if (block.dayIndex > today) return false

  return block.startHour + block.hours <= nowHour
}
