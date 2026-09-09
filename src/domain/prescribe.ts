import { LOAD_TYPES, type ActivityKind, type LoadType, type Reserves } from '../engine'
import type { RecoveryAttempt, Schedule } from '../optimizer'

/** Below the comfortable band, but above §1.5's low-energy threshold of 20 -- so advice
 *  arrives before the reduced view takes over, rather than after. */
const PRESCRIBE_BELOW = 40

/** Under half an hour there is nothing worth scheduling, and suggesting one is noise. */
const MIN_GAP_HOURS = 0.5

/** `USEFUL_REST_HOURS`. Past this the engine credits nothing, so a longer suggestion would
 *  promise recovery the model refuses to pay out. */
const MAX_BLOCK_HOURS = 3

/** Used when a day is empty and there is no gap to measure. */
const DEFAULT_GAP_HOURS = 1

/** Waking hours in a day, once sleep is set aside. */
const WAKING_HOURS = 16

export interface Prescription {
  readonly id: string
  readonly type: LoadType
  readonly kind: ActivityKind
  readonly title: string
  readonly hours: number
  readonly dayIndex: number
  readonly startHour: number
}

/**
 * §5.2's matching, stated once.
 *
 * Social low prescribes a person, physical low prescribes movement, mental low prescribes
 * actual downtime -- explicitly not a different screen. The engine already refuses to let
 * sleep cure loneliness; this is that same conviction pointed at the advice rather than the
 * maths.
 *
 * Errands is absent on purpose. A depleted errands reserve is already answered by the room's
 * clutter boxes, which let a student clear one and see it leave the week -- and telling
 * somebody who is flat to do a chore is advice nobody follows.
 */
const ADVICE: Partial<Record<LoadType, { kind: ActivityKind; title: string }>> = {
  social: { kind: 'socialRestorative', title: 'Message someone you like and see them' },
  physical: { kind: 'lightExercise', title: 'Get outside and walk' },
  mental: { kind: 'rest', title: 'Stop and do nothing — no screen' },
}

/** Hours left on a day once everything scheduled on it is accounted for. */
export function freeGapOn(schedule: Schedule, dayIndex: number): number {
  const busy = schedule.items
    .filter((item) => item.dayIndex === dayIndex)
    .reduce((total, item) => total + item.hours, 0)

  return Math.max(0, WAKING_HOURS - busy)
}

const lowestOf = (reserves: Reserves): LoadType =>
  LOAD_TYPES.reduce((lowest, type) => (reserves[type] < reserves[lowest] ? type : lowest))

/**
 * One thing to do, matched to what is actually empty.
 *
 * Returns a single prescription or nothing at all -- never a list. §5.2 is blunt that a
 * depleted person cannot choose from a menu and that every extra option lowers the odds of
 * any action, so the shape of this return type is the feature rather than a convention.
 *
 * Only day 0 is considered, because the engine is pure and has no calendar -- day 0 is "now"
 * everywhere else in the model too. A student whose today is full gets no suggestion even if
 * tomorrow is open; widening that would mean inventing a notion of "soon" the model does not
 * have.
 */
export function prescribe(
  schedule: Schedule,
  log: readonly RecoveryAttempt[] = [],
): Prescription | null {
  const type = lowestOf(schedule.start)
  if (schedule.start[type] >= PRESCRIBE_BELOW) return null

  const advice = ADVICE[type]
  if (!advice) return null

  // §5.2's last line: what did not work stops being suggested.
  if (log.some((attempt) => attempt.kind === advice.kind && !attempt.helped)) return null

  const free = freeGapOn(schedule, 0)
  const gap = Math.min(free === 0 ? 0 : Math.max(free, DEFAULT_GAP_HOURS), MAX_BLOCK_HOURS)
  if (gap < MIN_GAP_HOURS) return null

  return {
    id: `prescription-${advice.kind}`,
    type,
    kind: advice.kind,
    title: advice.title,
    hours: Math.round(gap * 2) / 2,
    dayIndex: 0,
    // Late afternoon: a gap a student plausibly still has, rather than first thing.
    startHour: 16,
  }
}
