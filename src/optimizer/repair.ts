import { overlaps } from './constraints'
import { hourNear } from './gaps'
import type { Move, Schedule, ScheduledItem } from './types'

/**
 * A block that must not be sat on: a fixed commitment, or protected rest.
 *
 * The two are one category here even though they are pinned for different reasons. A class
 * cannot move because the world says so; protected rest cannot move because §5.1 says making
 * recovery structurally protected is the most important design decision in the app. Either
 * way it is the other block that gives.
 */
const isPinned = (item: ScheduledItem): boolean => item.fixed || item.protectedRest

/**
 * Who keeps their slot when two blocks want the same hour.
 *
 * Pinned first, because those cannot move at all. Then the one with the least room to go
 * anywhere else: an earlier deadline is less slack, and a block with no deadline has the most
 * slack of all. Start hour and id only break the remaining ties, and only so that the same
 * week always repairs the same way -- a repair a student cannot reproduce is one they cannot
 * trust.
 */
const priority = (item: ScheduledItem): [number, number, number, string] => [
  isPinned(item) ? 0 : 1,
  item.deadlineDay ?? Number.MAX_SAFE_INTEGER,
  item.startHour,
  item.id,
]

const byPriority = (a: ScheduledItem, b: ScheduledItem): number => {
  const [ap, ad, ah, ai] = priority(a)
  const [bp, bd, bh, bi] = priority(b)
  return ap - bp || ad - bd || ah - bh || ai.localeCompare(bi)
}

/** The first block already in place that this one would sit on. */
const sittingOn = (placed: readonly ScheduledItem[], item: ScheduledItem): ScheduledItem | null =>
  placed.find((other) => other.dayIndex === item.dayIndex && overlaps(item, other)) ?? null

/** The days to try, nearest first, and never past a real deadline. */
function daysToTry(item: ScheduledItem, today: number, horizonDays: number): number[] {
  const last = Math.min(item.deadlineDay ?? horizonDays - 1, horizonDays - 1)

  const days: number[] = []
  for (let distance = 0; distance <= horizonDays; distance += 1) {
    // Later before earlier at the same distance: a block pushed back keeps whatever
    // preparation was behind it, where one pulled forward may need work that has not
    // happened yet.
    const at = distance === 0 ? [item.dayIndex] : [item.dayIndex + distance, item.dayIndex - distance]

    for (const day of at) {
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
 * Give every block on the week an hour of its own.
 *
 * `violations` counts a loose block sitting on a fixed one or on protected rest, but that
 * count is only ever a gate on candidate moves -- "no worse than you started" -- and the
 * score cannot see overlap at all. So a repairing move was permitted and never preferred, and
 * a week that arrived broken stayed broken through a full rebalance.
 *
 * **Two loose blocks are separated here too, and that is a narrower statement than it looks.**
 * `constraints.ts` permits that state on purpose, and still does: the search has to be able
 * to pass *through* a week with two movable blocks on one hour, or legal routes through the
 * neighbourhood get cut off. Passing through it is not the same as handing it back. A
 * calendar showing two things at 14:00 is wrong however the model feels about it, and the
 * student is the one who has to be in two places.
 *
 * **A pass rather than a term in the objective, deliberately.** Scoring overlap would put it
 * in competition with the reserves, and a clash could then be "solved" by shoving work onto a
 * day that costs the student more. This only ever separates; every judgement about where work
 * belongs is left to the search around it.
 *
 * Pure and deterministic -- no `Rng`. `priority` is a total order, so the same week always
 * repairs the same way.
 */
export function clearClashes(schedule: Schedule, today: number): RepairResult {
  const moves: Move[] = []

  /*
   * Placed one at a time, so each block only has to avoid the ones already down.
   *
   * Days already lived go down first and untouched: they are not the student's to rearrange,
   * and the search is bounded the same way for the same reason.
   */
  const placed: ScheduledItem[] = schedule.items.filter((item) => item.dayIndex < today)

  const toPlace = schedule.items
    .filter((item) => item.dayIndex >= today)
    .sort(byPriority)

  for (const item of toPlace) {
    const clash = sittingOn(placed, item)

    if (clash === null || isPinned(item)) {
      // A pinned block never gives, even to another pinned one. Two fixed commitments at the
      // same hour is a fact about somebody's week, not something to be tidied -- and moving
      // either would be the app taking away a class it was told about.
      placed.push(item)
      continue
    }

    const room: Schedule = { ...schedule, items: placed }

    let moved: ScheduledItem | null = null

    for (const day of daysToTry(item, today, schedule.horizonDays)) {
      const hour = hourNear(room, day, item.hours, item.startHour)
      if (hour === null) continue

      moved = { ...item, dayIndex: day, startHour: hour }
      break
    }

    // Declining beats inventing a placement. A block parked at an hour nothing checked is a
    // worse answer than one still visibly on top of something, which the student can at least
    // see and fix themselves.
    if (moved === null) {
      placed.push(item)
      continue
    }

    placed.push(moved)

    moves.push({
      kind: 'clearClash',
      itemId: moved.id,
      description:
        moved.dayIndex === item.dayIndex
          ? `Moved ${moved.title} off ${clash.title}`
          : `Moved ${moved.title} off ${clash.title} to another day`,
      // Never replayed -- the pass has already applied it, and it is reported rather than
      // offered. Present because `Move` is what the report reads, and a second shape for
      // "something changed" is how two lists of changes come to disagree.
      apply: (s) => s,
    })
  }

  // The original order kept, so a week that changed nothing is the same object graph the
  // caller passed in and every `toEqual` on an untouched week still means what it says.
  if (moves.length === 0) return { schedule, moves }

  const byId = new Map(placed.map((item) => [item.id, item]))

  return {
    schedule: { ...schedule, items: schedule.items.map((item) => byId.get(item.id) ?? item) },
    moves,
  }
}
