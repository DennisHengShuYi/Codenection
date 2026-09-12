import { overlaps } from './constraints'
import { hourNear } from './gaps'
import type { Move, Schedule, ScheduledItem } from './types'

/**
 * A block that must not be sat on: a fixed commitment, or protected rest.
 *
 * The two are one category here even though they are pinned for different reasons. A class
 * cannot move because the world says so; protected rest cannot move because §5.1 says making
 * recovery structurally protected is the most important design decision in the app. Either
 * way the loose block is the one that gives.
 */
const isPinned = (item: ScheduledItem): boolean => item.fixed || item.protectedRest

/** Every block on this day that is already sitting on a pinned one. */
const clashesWithPinned = (schedule: Schedule, item: ScheduledItem): ScheduledItem | null =>
  schedule.items.find(
    (other) =>
      other.id !== item.id &&
      other.dayIndex === item.dayIndex &&
      isPinned(other) &&
      overlaps(item, other),
  ) ?? null

/** The days to try, nearest first, and never past a real deadline. */
function daysToTry(item: ScheduledItem, today: number, horizonDays: number): number[] {
  const last = Math.min(item.deadlineDay ?? horizonDays - 1, horizonDays - 1)

  const days: number[] = []
  for (let distance = 0; distance <= horizonDays; distance += 1) {
    // Later before earlier at the same distance: a block pushed back keeps whatever
    // preparation was behind it, where one pulled forward may need work that has not
    // happened yet.
    for (const day of distance === 0 ? [item.dayIndex] : [item.dayIndex + distance, item.dayIndex - distance]) {
      if (day < today || day > last) continue
      if (!days.includes(day)) days.push(day)
    }
  }

  return days
}

export interface RepairResult {
  readonly schedule: Schedule
  /** Reported like any other move, because §2.1 is blunt that a student will not act on a
   *  reshuffle they cannot see -- and a block that quietly changed day is exactly that. */
  readonly moves: readonly Move[]
}

/**
 * Separate the blocks that must not be on top of each other, before the search runs.
 *
 * `violations` counts a loose block sitting on a fixed one or on protected rest, but that
 * count is only ever a gate on candidate moves -- "no worse than you started" -- so a week
 * that arrived carrying a clash was under no pressure to lose it. The score cannot see
 * overlap at all, so a repairing move was permitted and never preferred, and a study block
 * on top of protected rest survived a full rebalance untouched.
 *
 * **A pass rather than a term in the objective, deliberately.** Scoring overlap would put it
 * in competition with the reserves, and a clash could then be "solved" by shoving work onto a
 * day that costs the student more. This only separates what must be separated, and leaves
 * every judgement about where work actually belongs to the search that follows it.
 *
 * Two loose blocks overlapping is left exactly as it is: `constraints.ts` permits that state
 * on purpose, and this pass is not the thing that should overrule it.
 *
 * Pure, and deterministic -- no `Rng`. A repair the student can reproduce is a repair they
 * can trust, and there is nothing to break ties between: the nearest opening on the nearest
 * allowed day is a total order.
 */
export function clearPinnedClashes(schedule: Schedule, today: number): RepairResult {
  const moves: Move[] = []

  // Rebuilt as it goes, so each placement sees the ones already made. Without it two blocks
  // coming off the same lecture both land on the same free hour, and the pass hands the
  // search a week with a clash it created itself.
  let current = schedule

  const loose = schedule.items
    .filter((item) => !isPinned(item) && item.dayIndex >= today)
    // A stable order, so the same week always repairs the same way.
    .sort((a, b) => a.dayIndex - b.dayIndex || a.startHour - b.startHour || a.id.localeCompare(b.id))

  for (const item of loose) {
    const live = current.items.find((entry) => entry.id === item.id)
    if (live === undefined) continue

    const pinned = clashesWithPinned(current, live)
    if (pinned === null) continue

    // The day without this block on it. `hourNear` reads every item as occupied, so leaving
    // it in would have the block blocking its own opening.
    const without: Schedule = {
      ...current,
      items: current.items.filter((entry) => entry.id !== live.id),
    }

    let placed: ScheduledItem | null = null

    for (const day of daysToTry(live, today, current.horizonDays)) {
      const hour = hourNear(without, day, live.hours, live.startHour)
      if (hour === null) continue

      const candidate = { ...live, dayIndex: day, startHour: hour }
      if (clashesWithPinned(without, candidate) !== null) continue

      placed = candidate
      break
    }

    // Declining beats inventing a placement. A block parked at an hour nothing checked is a
    // worse answer than one still visibly on top of something, which the student can at
    // least see and fix themselves.
    if (placed === null) continue

    const moved = placed

    current = { ...without, items: [...without.items, moved] }

    moves.push({
      kind: 'clearClash',
      itemId: moved.id,
      description:
        moved.dayIndex === live.dayIndex
          ? `Moved ${moved.title} off ${pinned.title}`
          : `Moved ${moved.title} off ${pinned.title} to another day`,
      // Never replayed -- the pass has already applied it, and it is reported rather than
      // offered. Present because `Move` is what the report reads, and a second shape for
      // "something changed" is how two lists of changes come to disagree.
      apply: (s) => s,
    })
  }

  return { schedule: moves.length === 0 ? schedule : current, moves }
}
