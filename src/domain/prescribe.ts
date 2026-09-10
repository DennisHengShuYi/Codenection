import { LOAD_TYPES, type ActivityKind, type LoadType, type Reserves } from '../engine'
import type { Schedule } from '../optimizer'
import { blocksOnDay } from './dayBlocks'
import { DAY_END_HOUR, gapsOn, MIN_GAP_HOURS, WAKE_HOUR, type FreeSlot } from './slotFinder'

/** Below the comfortable band, but above §1.5's low-energy threshold of 20 -- so advice
 *  arrives before the reduced view takes over, rather than after. */
const PRESCRIBE_BELOW = 40

/** `USEFUL_REST_HOURS`. Past this the engine credits nothing, so a longer suggestion would
 *  promise recovery the model refuses to pay out. */
const MAX_BLOCK_HOURS = 3

/** Waking hours in a day, once sleep is set aside. `MIN_GAP_HOURS` and `WAKE_HOUR` are
 *  `slotFinder`'s now: they describe the shape of a day rather than anything about advice,
 *  and two copies of "when does a student wake up" is one too many. */
const WAKING_HOURS = DAY_END_HOUR - WAKE_HOUR

/** Late afternoon: a gap a student plausibly still has, rather than first thing. Used only
 *  as the tie-break when a day is completely empty and there is no real gap to point at. It
 *  sits inside [WAKE_HOUR, DAY_END_HOUR) so it stays a coherent time of day. */
const DEFAULT_START_HOUR = 16

export interface Prescription {
  readonly id: string
  readonly type: LoadType
  readonly kind: ActivityKind
  readonly title: string
  readonly hours: number
  readonly dayIndex: number
  readonly startHour: number
}

/** A stretch of the day with nothing scheduled on it yet. Re-exported rather than
 *  redeclared: `prescribe` was where this shape started, and callers still import it from
 *  here, but `slotFinder` is the one that defines it now. */
export type { FreeSlot }

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
 * somebody who is flat to do a chore is advice nobody follows. Its absence must not suppress
 * advice for whichever reserve is next lowest -- see `prescribe`.
 */
const ADVICE: Partial<Record<LoadType, { kind: ActivityKind; title: string }>> = {
  social: { kind: 'socialRestorative', title: 'Message someone you like and see them' },
  physical: { kind: 'lightExercise', title: 'Get outside and walk' },
  mental: { kind: 'rest', title: 'Stop and do nothing — no screen' },
}

/** Every `ActivityKind` a prescription can produce, derived from `ADVICE` rather than
 *  duplicated so the two can never drift apart. */
export const ADVICE_KINDS: Partial<Record<LoadType, ActivityKind>> = Object.fromEntries(
  (Object.entries(ADVICE) as ReadonlyArray<[LoadType, { kind: ActivityKind; title: string }]>).map(
    ([type, entry]) => [type, entry.kind],
  ),
)

/**
 * The first stretch of day `dayIndex` with at least `MIN_GAP_HOURS` free, scanning from the
 * start of the waking day. `null` when nothing on the day is that free.
 *
 * An empty day has no real boundary to point at, so it reports `DEFAULT_START_HOUR` as a
 * plausible tie-break rather than hour zero, which would read as scheduling rest at midnight.
 */
export function freeSlotOn(schedule: Schedule, dayIndex: number): FreeSlot | null {
  // The empty-day tie-break, kept deliberately. A day with nothing on it has no boundary to
  // point at, and reporting hour zero -- or `gapsOn`'s honest `WAKE_HOUR` -- would read as
  // prescribing rest first thing in the morning. This is the one thing `slotFinder` does
  // not know about, because it is about how advice *sounds* rather than where a block fits.
  if (blocksOnDay(schedule, dayIndex).length === 0) {
    return { startHour: DEFAULT_START_HOUR, hours: WAKING_HOURS }
  }

  return gapsOn(schedule, dayIndex)[0] ?? null
}

const sortedByReserve = (reserves: Reserves): readonly LoadType[] =>
  [...LOAD_TYPES].sort((a, b) => reserves[a] - reserves[b])

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
 *
 * Takes no memory of what was tried before. §7 replaced the permanent failed-recovery log
 * with a same-day dismissal the room screen holds itself: "not today" is a way out, not a
 * verdict on the advice, and this function has nothing to say about what happens tomorrow.
 */
export function prescribe(schedule: Schedule): Prescription | null {
  // Sorted ascending so the emptiest reserve with no advice of its own (errands) never
  // silently suppresses advice for whichever reserve is next lowest.
  const type = sortedByReserve(schedule.start).find(
    (candidate) => schedule.start[candidate] < PRESCRIBE_BELOW && ADVICE[candidate] !== undefined,
  )
  if (!type) return null

  const advice = ADVICE[type]
  if (!advice) return null

  const slot = freeSlotOn(schedule, 0)
  if (!slot) return null

  const hours = Math.min(slot.hours, MAX_BLOCK_HOURS)
  if (hours < MIN_GAP_HOURS) return null

  return {
    id: `prescription-${advice.kind}`,
    type,
    kind: advice.kind,
    title: advice.title,
    hours: Math.round(hours * 2) / 2,
    dayIndex: 0,
    startHour: slot.startHour,
  }
}
