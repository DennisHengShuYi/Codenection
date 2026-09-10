import type { ActivityKind, LoadType } from '../engine'
import type { Schedule } from '../optimizer'
import { blocksOnDay } from './dayBlocks'

/**
 * When a student's day actually starts. Borrowed from `dayGrid.DEFAULT_FIRST_HOUR` -- the
 * codebase's existing answer to the same question -- so a block is never placed before
 * anyone is awake to do it.
 */
export const WAKE_HOUR = 8

/** Midnight. Past here is tomorrow, and `sleepByDay` is already counting those hours. */
export const DAY_END_HOUR = 24

/** Under half an hour there is nothing worth scheduling, and reporting one as an opening
 *  produces suggestions nobody can act on. */
export const MIN_GAP_HOURS = 0.5

/** A stretch of a day with nothing on it. */
export interface FreeSlot {
  readonly startHour: number
  readonly hours: number
}

/** What is being placed, in the only terms placement cares about. */
export interface SlotNeed {
  readonly hours: number
  readonly type: LoadType
  readonly kind: ActivityKind
}

/**
 * Every opening on a day, in order, clamped to the waking window.
 *
 * The one gap-walker in the codebase. `prescribe.freeSlotOn` was the original and had this
 * logic inline along with its own copy of `blocksOnDay`'s filter-and-sort; it now asks this.
 *
 * Overlapping blocks are merged rather than producing a negative gap: two movable blocks
 * on top of each other is a legal state the optimizer deliberately permits
 * (`constraints.ts` does not count it as a violation), so the walker meets it routinely
 * rather than exceptionally.
 */
export function gapsOn(schedule: Schedule, dayIndex: number): readonly FreeSlot[] {
  const gaps: FreeSlot[] = []
  let cursor = WAKE_HOUR

  for (const block of blocksOnDay(schedule, dayIndex)) {
    const start = Math.max(block.startHour, WAKE_HOUR)
    const end = Math.min(block.startHour + block.hours, DAY_END_HOUR)
    if (end <= cursor) continue

    if (start - cursor >= MIN_GAP_HOURS) gaps.push({ startHour: cursor, hours: start - cursor })

    cursor = Math.max(cursor, end)
    if (cursor >= DAY_END_HOUR) return gaps
  }

  const tail = DAY_END_HOUR - cursor
  if (tail >= MIN_GAP_HOURS) gaps.push({ startHour: cursor, hours: tail })

  return gaps
}

/** Late enough to read as winding down. A rest block at 11am is one a student will not
 *  take, which is the same reasoning `neighbours.REST_START_HOUR` already encodes. */
const REST_HOUR = 20

/** When other people are free, which is the whole constraint on seeing them. Matches
 *  `neighbours.SOCIAL_START_HOUR`. */
const SOCIAL_HOUR = 18

/** Where study goes for a student who has not shown us where they study. */
const DEFAULT_STUDY_HOUR = 16

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null

  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)] as number
}

/**
 * The hour this kind of work would ideally start at.
 *
 * Deliberately light. These break ties between openings that are all genuinely free -- they
 * never decide *whether* something is placed, and a preferred hour that is taken costs the
 * preference rather than the placement.
 *
 * Mental and errands read the student's own week rather than a number chosen here: where
 * their studying already clusters, and after the errands already on that day so the batching
 * `neighbours.batchMoves` searches for happens at entry instead of having to be repaired.
 */
function preferredHour(schedule: Schedule, dayIndex: number, need: SlotNeed): number {
  if (need.kind === 'rest') return REST_HOUR
  if (need.type === 'social') return SOCIAL_HOUR

  if (need.type === 'mental') {
    const studyHours = schedule.items
      .filter((item) => item.kind === 'studyBlock')
      .map((item) => item.startHour)

    return median(studyHours) ?? DEFAULT_STUDY_HOUR
  }

  if (need.type === 'errands') {
    const sameDay = blocksOnDay(schedule, dayIndex).filter((item) => item.type === 'errands')
    const last = sameDay.at(-1)
    if (last !== undefined) return last.startHour + last.hours

    const elsewhere = median(
      schedule.items.filter((item) => item.type === 'errands').map((item) => item.startHour),
    )
    if (elsewhere !== null) return elsewhere
  }

  return WAKE_HOUR
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high)

/**
 * Where this belongs on this day, or null when it does not fit.
 *
 * Exactly one slot, never a list. A list would become a solver neighbourhood, and §2.1's
 * search already runs to four thousand evaluations on the crunch fixture -- and it is
 * §5.2's rule about menus applied to the machinery: the app decides and says what it did,
 * rather than offering five places a block could have gone.
 *
 * Pure, and free of any clock: `dayIndex` is supplied by the caller the same way `today` is
 * everywhere else, so this can be reasoned about and tested without a calendar.
 */
export function slotOn(schedule: Schedule, dayIndex: number, need: SlotNeed): FreeSlot | null {
  // A block of no length is not a placement, and one longer than a waking day fits nowhere
  // -- clipping it to make it fit would schedule something the student never asked for.
  if (need.hours <= 0 || need.hours > DAY_END_HOUR - WAKE_HOUR) return null

  const fitting = gapsOn(schedule, dayIndex).filter((gap) => gap.hours >= need.hours)
  if (fitting.length === 0) return null

  const wanted = preferredHour(schedule, dayIndex, need)

  // The gap whose nearest legal start is closest to where this kind of work wants to be.
  // Ties go to the earlier gap, because `fitting` is already in order and `reduce` keeps
  // the incumbent on equality.
  const best = fitting.reduce((winner, gap) => {
    const distance = (slot: FreeSlot) =>
      Math.abs(clamp(wanted, slot.startHour, slot.startHour + slot.hours - need.hours) - wanted)

    return distance(gap) < distance(winner) ? gap : winner
  })

  return {
    startHour: clamp(wanted, best.startHour, best.startHour + best.hours - need.hours),
    hours: need.hours,
  }
}
