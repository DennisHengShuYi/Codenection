import {
  LOAD_TYPES,
  USEFUL_REST_HOURS,
  type ActivityKind,
  type LoadType,
  type Reserves,
} from '../engine'
import type { Schedule } from '../optimizer'
import { blocksOnDay } from './dayBlocks'
import { DAY_END_HOUR, gapsOn, MIN_GAP_HOURS, WAKE_HOUR, type FreeSlot } from './slotFinder'
import type { BlockRecord } from './blockLog'
import { missedSoftDeadlines, type SoftDeadlineMiss } from './softDeadlines'

/** Past this the engine credits nothing, so a longer suggestion would promise recovery the
 *  model refuses to pay out. Imported rather than restated: `engine/index.ts` exports it
 *  "because three places were carrying their own copy of the same 3 with a comment saying it
 *  was this one", and this was the fourth. */
const MAX_BLOCK_HOURS = USEFUL_REST_HOURS

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
  /**
   * The reserve entering today, where the caller has it: an ORDERING, and nothing more.
   *
   * What is neglected still comes entirely from `missedSoftDeadlines` -- a reserve can never
   * conjure a prescription for a rhythm that is being kept, which is what the paragraphs
   * above are about. This decides only which of SEVERAL overdue things to answer first, and
   * that is the one question a rhythm cannot answer: "you have not walked in nine days" and
   * "you have not seen anyone in eight" are equally true, and the reserve levels say which
   * one is actually costing the student something.
   *
   * The Reserves sheet is what made this visible. It put "People is your thinnest, at 43"
   * directly above "Worth doing: stop and do nothing" -- both lines correct, answering
   * different questions, and reading as an app not listening to itself.
   *
   * Optional because the Telegram doors call this without a projection to hand, and their
   * two call sites must agree with each other or a tapped button re-derives a different
   * prescription than the one it offered. Absent, the ordering is exactly what it was.
   */
  reserves?: Reserves,
): Prescription | null {
  // Already sorted most-neglected-first. Filtered rather than `find`-ed so the worst miss
  // having no advice of its own -- errands, deliberately -- never silently suppresses advice
  // for whatever is next. That was a real defect under the old reserve ordering and it would
  // have survived the change unexamined.
  const overdue = missedSoftDeadlines(schedule, today, blockLog).filter(
    (candidate) => ADVICE[candidate.type] !== undefined,
  )

  /*
   * The reserves in the order they need answering, thinnest first.
   *
   * Walked all the way down rather than checked once against the floor. The lowest reserve
   * often has nothing overdue -- because something is already booked for it, which is the
   * app working -- and falling straight back to days-late at that point threw away an
   * ordering already in hand. Rest goes overdue after one day and the other rhythms after
   * three or four, so days-late is a race rest wins almost every time: that is how "stop and
   * do nothing" kept appearing under a headline about a reserve with nothing to do with
   * resting.
   */
  const byNeed = reserves === undefined ? [] : [...LOAD_TYPES].sort((a, b) => reserves[a] - reserves[b])

  // Days-late underneath, for a caller that gave no reserves: the Telegram doors, whose two
  // call sites must agree with each other or a tapped button re-derives a different
  // prescription than the one it offered.
  const miss =
    byNeed.reduce<SoftDeadlineMiss | undefined>(
      (found, type) => found ?? overdue.find((candidate) => candidate.type === type),
      undefined,
    ) ?? overdue[0]

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
