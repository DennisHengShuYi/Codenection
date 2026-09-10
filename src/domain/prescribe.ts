import type { ActivityKind, LoadType } from '../engine'
import type { Schedule } from '../optimizer'
import { blocksOnDay } from './dayBlocks'
import { DAY_END_HOUR, gapsOn, MIN_GAP_HOURS, WAKE_HOUR, type FreeSlot } from './slotFinder'
import type { BlockRecord } from './blockLog'
import { missedSoftDeadlines } from './softDeadlines'

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
 * Neglected company prescribes a person, neglected movement prescribes a walk, neglected
 * downtime prescribes actual downtime -- explicitly not a different screen. The engine
 * already refuses to let sleep cure loneliness; this is that same conviction pointed at the
 * advice rather than the maths.
 *
 * Keyed by `LoadType` rather than by kind, so a miss of any sort maps to the one thing worth
 * saying about the reserve behind it.
 *
 * Errands is absent on purpose. A backlog of chores is already answered by the room's
 * clutter boxes, which let a student clear one and see it leave the week -- and telling
 * somebody who is flat to do a chore is advice nobody follows. Its absence must not suppress
 * advice for whatever is next most neglected -- see `prescribe`.
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

/**
 * One thing to do, matched to what is actually being neglected.
 *
 * Returns a single prescription or nothing at all -- never a list. §5.2 is blunt that a
 * depleted person cannot choose from a menu and that every extra option lowers the odds of
 * any action, so the shape of this return type is the feature rather than a convention.
 *
 * **What is neglected comes from `missedSoftDeadlines` now, not from reserve levels.** The
 * two answer the same question, and letting both answer it made the app repeat itself:
 * "your social reserve is low" and "you have not seen anyone in nine days" are one piece of
 * news, and a student who gets it twice on one day reads an app that is not listening to
 * itself. Soft deadlines are the source; this reads them.
 *
 * That also fixes a quieter fault. A reserve threshold only fires once the damage is already
 * measurable, and a rhythm can be neglected for a fortnight while the reserve it feeds is
 * held up by something else -- which is exactly the case §5.1's structural argument is about.
 *
 * `today` and `blockLog` are REQUIRED, not defaulted, and that is `priceRequest`'s lesson
 * rather than a style preference: defaults there are "precisely what let the Telegram `/ask`
 * call site be silently wrong for as long as it existed". A caller with no evidence says so
 * in writing, where a reviewer can see it.
 *
 * Takes no memory of what was tried before. §7 replaced the permanent failed-recovery log
 * with a same-day dismissal the room screen holds itself: "not today" is a way out, not a
 * verdict on the advice, and this function has nothing to say about what happens tomorrow.
 */
export function prescribe(
  schedule: Schedule,
  today: number,
  blockLog: readonly BlockRecord[],
): Prescription | null {
  // Already sorted most-neglected-first. `find` rather than `[0]` so the worst miss having
  // no advice of its own -- errands, deliberately -- never silently suppresses advice for
  // whatever is next. That was a real defect under the old reserve ordering and it would
  // have survived the change unexamined.
  const miss = missedSoftDeadlines(schedule, today, blockLog).find(
    (candidate) => ADVICE[candidate.type] !== undefined,
  )
  if (!miss) return null

  const advice = ADVICE[miss.type]
  if (!advice) return null

  const slot = freeSlotOn(schedule, today)
  if (!slot) return null

  const hours = Math.min(slot.hours, MAX_BLOCK_HOURS)
  if (hours < MIN_GAP_HOURS) return null

  return {
    id: `prescription-${advice.kind}`,
    type: miss.type,
    kind: advice.kind,
    title: advice.title,
    hours: Math.round(hours * 2) / 2,
    dayIndex: today,
    startHour: slot.startHour,
  }
}
