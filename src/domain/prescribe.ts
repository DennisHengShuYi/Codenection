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
/* `confirmedIds` rather than `answeredIds`: a block answered "didn't" is evidence it did not
   happen, and counting it as covering a reserve would let a student satisfy the advice by
   admitting they skipped something. That distinction is already stated where it is defined. */
import { confirmedIds, missedSoftDeadlines, type SoftDeadlineMiss } from './softDeadlines'

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

/**
 * How far ahead something already booked still counts as answering a reserve.
 *
 * The old test was "is anything of this kind scheduled at all", which searched the whole
 * 21-day horizon -- so one coffee twelve days out silenced the advice for a reserve that
 * would keep falling for those twelve days. Two days, because that is the span over which a
 * booking is plausibly the reason not to add another thing today; past it the student is
 * being told a fortnight-away plan answers a problem they have now.
 *
 * Exported because `domain/reserveInsight` prints "… is what answers that, so it is already
 * in hand" from the same idea, and two windows would let one screen contradict itself: an
 * event announced as already in hand directly above advice to go and do that very thing.
 */
export const COVERED_WITHIN_DAYS = 2

/**
 * Which activities restore which reserve.
 *
 * Lives here rather than in `domain/reserveInsight`, where it started, because both files now
 * need it and that one already imports from this one. Broader than `ADVICE` below on purpose:
 * advice suggests ONE thing per reserve, but a reserve is covered by anything that restores
 * it, and a hard session in the diary answers movement just as a walk does.
 *
 * Errands is empty for `ADVICE`'s stated reason -- there is no prescription for it, so there
 * is nothing that could cover it either, and a thin Life admin is stepped over rather than
 * ending the walk.
 */
export const RESTORES: Record<LoadType, readonly ActivityKind[]> = {
  mental: ['rest'],
  physical: ['lightExercise', 'hardExercise'],
  social: ['socialRestorative'],
  errands: [],
}

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
/**
 * The thinnest reserve that still needs answering, or null when every one is covered.
 *
 * The whole of the new rule, in one function. Walk the bars lowest first; step over any that
 * has no advice to give; take the first whose need is not already booked within
 * `COVERED_WITHIN_DAYS`.
 *
 * Rhythm clocks are deliberately not consulted. A clock -- rest after a day, company after
 * four -- is a GUESS at whether a reserve is depleted, and the bar is the MEASUREMENT of it.
 * Consulting both meant measuring one thing twice and letting the worse measure win: rest's
 * clock is the shortest, so on a fresh fortnight it took the advice for three days whatever
 * the bars said, which is the reported bug.
 *
 * Exported because `domain/reserveInsight` needs to tell its two silences apart. No
 * prescription with something still uncovered means the day had nowhere to put one; no
 * prescription with nothing uncovered means the plan already has it all in hand, and a
 * student acts differently on each.
 */
export function firstUncovered(
  schedule: Schedule,
  today: number,
  blockLog: readonly BlockRecord[],
  reserves: Reserves,
): LoadType | null {
  const confirmed = confirmedIds(blockLog)

  const covered = (type: LoadType): boolean =>
    schedule.items.some(
      (candidate) =>
        RESTORES[type].includes(candidate.kind) &&
        candidate.dayIndex >= today &&
        candidate.dayIndex <= today + COVERED_WITHIN_DAYS &&
        !confirmed.has(candidate.id),
    )

  return (
    [...LOAD_TYPES]
      .sort((left, right) => reserves[left] - reserves[right])
      .find((type) => ADVICE[type] !== undefined && !covered(type)) ?? null
  )
}

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
 * **Two paths, and which one runs is decided by whether the caller has the reserves.**
 *
 * With them, `firstUncovered` decides outright: the thinnest bar whose need is not already
 * booked within `COVERED_WITHIN_DAYS`. Without them -- the Telegram doors, which have no
 * projection to hand -- the soft-deadline clocks decide, as they always did.
 *
 * It used to be clocks either way, with the reserves as a tie-break among things already
 * overdue. That was not enough, because for the first days of a fortnight there is only ever
 * one overdue thing: rest's clock is a single day and every other rhythm's is three or four.
 * Ruling 70 records the measurement and the argument -- a clock is a guess at whether a
 * reserve is depleted, the bar is the measurement of it, and consulting both let the worse
 * measure win.
 *
 * What survives unchanged is the conviction underneath: a reserve still cannot conjure advice
 * for a need already being met. Only the test for "met" moved, from a clock not yet expired to
 * something actually in the diary.
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
   * The reserve entering today. Given, it decides the advice outright; absent, the rhythm
   * clocks below do.
   *
   * It used to be an ordering and nothing more -- a tie-break among things the clocks had
   * already declared overdue. That was not enough, and the Reserves sheet is where it showed:
   * on a fresh fortnight with nothing booked, rest's one-day clock beat company's four-day
   * one, so "People is your thinnest, at 99" sat directly above "Worth doing: stop and do
   * nothing" for three days running. Both lines correct, answering different questions, and
   * reading as an app not listening to itself.
   *
   * The clocks lost that argument because they are a GUESS at whether a reserve is depleted
   * while the bar is the MEASUREMENT of it -- see `firstUncovered`. A reserve can still never
   * conjure advice for a need that is already being met; what changed is that "met" now means
   * something booked within `COVERED_WITHIN_DAYS` rather than a clock not yet expired.
   *
   * Optional because the Telegram doors call this without a projection to hand, and their two
   * call sites must agree with each other or a tapped button re-derives a different
   * prescription than the one it offered. Absent, the days-late ordering is exactly what it
   * was -- which does mean the bot and the app can now suggest different things on one day.
   */
  reserves?: Reserves,
): Prescription | null {
  // The bars, where the caller has them. `firstUncovered` is the whole rule and the clocks
  // below are not consulted at all on this path -- see that function for why a measurement
  // outranks a guess at the same thing.
  if (reserves !== undefined) {
    const type = firstUncovered(schedule, today, blockLog, reserves)

    return type === null ? null : prescriptionFor(schedule, today, type)
  }

  // Already sorted most-neglected-first. Filtered rather than `find`-ed so the worst miss
  // having no advice of its own -- errands, deliberately -- never silently suppresses advice
  // for whatever is next. That was a real defect under the old reserve ordering and it would
  // have survived the change unexamined.
  const overdue = missedSoftDeadlines(schedule, today, blockLog).filter(
    (candidate) => ADVICE[candidate.type] !== undefined,
  )

  // Days-late, for a caller that gave no reserves: the Telegram doors, whose two call sites
  // must agree with each other or a tapped button re-derives a different prescription than
  // the one it offered.
  const miss: SoftDeadlineMiss | undefined = overdue[0]

  return miss === undefined ? null : prescriptionFor(schedule, today, miss.type)
}

/**
 * The advice for one reserve, placed on today, or null when today has nowhere to put it.
 *
 * Shared tail, so the two paths above cannot drift on the shape of what they return. The day
 * being too full is a real answer rather than a failure, and `reserveInsight` says so in its
 * own words -- it asks the student to move something rather than to add something.
 */
function prescriptionFor(
  schedule: Schedule,
  today: number,
  type: LoadType,
): Prescription | null {
  const advice = ADVICE[type]
  if (!advice) return null

  const slot = freeSlotOn(schedule, today)
  if (!slot) return null

  const hours = Math.min(slot.hours, MAX_BLOCK_HOURS)
  if (hours < MIN_GAP_HOURS) return null

  return {
    id: `prescription-${advice.kind}`,
    type,
    kind: advice.kind,
    title: advice.title,
    hours: Math.round(hours * 2) / 2,
    dayIndex: today,
    startHour: slot.startHour,
  }
}
