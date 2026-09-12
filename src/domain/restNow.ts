import {
  overallReserve,
  project,
  USEFUL_REST_HOURS,
  type EngineParams,
  type Projection,
} from '../engine'
import {
  gapsOn,
  MIN_GAP_HOURS,
  toDayInputs,
  type Fix,
  type Schedule,
} from '../optimizer'
import { checkedInDays, type BlockRecord } from './blockLog'
import { fixThatMakesRoom } from './placement'
import { roomForRest } from './recoveryCeiling'
import { scheduleRecovery } from './scheduleRecovery'
import { slotOn, type SlotNeed } from './slotFinder'
import { missedSoftDeadlines } from './softDeadlines'

/**
 * The Rest button, answered.
 *
 * A student who is flat presses one control and gets time off put into their week, or an
 * honest account of why they cannot have it. Four rungs, tried in order, and the first that
 * succeeds is the answer.
 *
 * Nothing here applies anything. `planRest` computes an offer; adopting it is a decision the
 * student makes on the preview this feeds — the same shape as `rebalanceOutcome`, and for
 * the same reason (Ruling 16: a week that changes behind somebody's back is one they lose their
 * grip on).
 *
 * Deterministic, and free of any clock of its own. `today` and `nowHour` are supplied by the
 * caller the way they are everywhere else in this layer, so a plan can be reasoned about and
 * tested without a calendar — and so a student who taps twice sees one answer rather than
 * two.
 *
 * "Deterministic" rather than "pure" is exact: the trial schedules this builds internally go
 * through `scheduleRecovery`, which stamps `Date.now()` into the id it mints. Nothing in a
 * `RestPlan` carries that id, and nothing downstream of it reads one, so the answer does not
 * move — but the claim is worth stating at the width it actually holds.
 */

/** What rest is, in the only terms placement cares about. `type` is nearly free here:
 *  `recoveryForDay` credits rest to all four reserves through `kRest` whatever it says, and
 *  `preferredHour` branches on `kind === 'rest'` before it ever reads it. `mental` is
 *  §5.2's own pairing — mental depletion is the one downtime answers — so it is the honest
 *  label rather than a lever. */
const REST_NEED = (hours: number): SlotNeed => ({ hours, type: 'mental', kind: 'rest' })

const REST_TITLE = 'Rest'

export interface RestBlock {
  readonly dayIndex: number
  readonly startHour: number
  readonly hours: number
}

/**
 * The receipt: what this rest is worth.
 *
 * Mirrors `RequestCost` field for field, measured in the opposite direction — `deepestLift`
 * where that has `deepestDrop`.
 *
 * Not measured on one type. `priceRequest` measures on `item.type` because a request draws
 * from one named reserve, and measuring on `worstFloor` "reported zero cost for the commonest
 * request there is". Rest credits **all four** reserves through `kRest`, so a single-type
 * reading would understate it in the same way and for the same reason -- every figure here is
 * the lowest reserve across types.
 *
 * `RequestCost.capacityAfter` is deliberately not carried across. It computes
 * `overallReserve(schedule.start)`, and `.start` is the fortnight's opening reserves, which
 * adding a block does not touch. Beside a price that moves it is context; as the headline
 * for rest it would read the same before and after, which is worse than no headline.
 */
export interface RestGain {
  /**
   * The reserve on the day the rest actually lands, before and after. **This is the
   * headline**, and the two floors below are context for it.
   *
   * The fortnight's floor is not the headline, for precisely the reason `RequestCost`
   * records about its own: it "sits at the fortnight's own trough", which for a rested
   * student is social isolation three weeks out. A test written against it caught this
   * immediately -- three hours of rest on day three moved `worstFloor` not at all, because
   * the trough is on day twenty and rest does not reach it. Measuring the lowest of the
   * four types on the rest's own day failed the same test for a related reason: that
   * minimum is social nearly everywhere, and `kRest` hardly touches social.
   *
   * A student pressing Rest is asking about now. This is the number that answers them, and
   * it is the number that moves.
   */
  readonly dayBefore: number
  readonly dayAfter: number
  /** The fortnight's worst floor either side. Context, and frequently unchanged. */
  readonly floorBefore: number
  readonly floorAfter: number
  readonly firstDeficitDayBefore: number | null
  readonly firstDeficitDayAfter: number | null
  /** The largest single-day lift anywhere on the horizon -- `deepestDrop` in the mirror. */
  readonly deepestLift: number
}

export type RestPlan =
  /** There is room right now and nothing of the student's has to move. */
  | { readonly kind: 'fits'; readonly block: RestBlock; readonly gain: RestGain }
  /** One thing would have to move first, and it is named. */
  | {
      readonly kind: 'needsMove'
      readonly block: RestBlock
      readonly move: Fix
      readonly gain: RestGain
    }
  /** Not today, but here is when. */
  | {
      readonly kind: 'laterDay'
      readonly block: RestBlock
      readonly gain: RestGain
      readonly whyNotToday: string
    }
  /** Nowhere in the fortnight, and why. */
  | { readonly kind: 'refused'; readonly why: string }

const projectionOf = (
  schedule: Schedule,
  params: EngineParams,
  today: number,
  blockLog: readonly BlockRecord[],
): Projection =>
  project(
    schedule.start,
    toDayInputs(schedule, checkedInDays(blockLog, today, schedule.horizonDays)),
    params,
  )

const floorAcross = (projection: Projection): number =>
  projection.worstFloor

/** Adds the block to a copy, so nothing a caller holds is ever touched. `scheduleRecovery`
 *  is the only door to protected rest and stays that way here. */
const withRest = (schedule: Schedule, block: RestBlock): Schedule =>
  scheduleRecovery(schedule, {
    title: REST_TITLE,
    type: 'mental',
    kind: 'rest',
    hours: block.hours,
    dayIndex: block.dayIndex,
    startHour: block.startHour,
  })

/**
 * The headline reserve on one day, in the units the dial already speaks.
 *
 * `overallReserve`, not the lowest of the four. The minimum across types is pinned by social
 * on almost every day -- isolation drains it and only contact refills it -- and `kRest`
 * barely touches social, so a per-type minimum showed the identical figure before and after
 * three hours of rest. That is the same trap `RequestCost.floorBefore` records about
 * `worstFloor`, met a second time from a different direction.
 *
 * §1.2's dial quotes overall reserve, so this is also the number the student has already
 * learned to read.
 */
const overallOn = (projection: Projection, dayIndex: number): number => {
  const day = projection.central[dayIndex]
  if (day === undefined) return 0

  return overallReserve(day)
}

function gainOf(
  before: Schedule,
  after: Schedule,
  params: EngineParams,
  today: number,
  blockLog: readonly BlockRecord[],
  onDay: number,
): RestGain {
  const b = projectionOf(before, params, today, blockLog)
  const a = projectionOf(after, params, today, blockLog)

  const deepestLift = b.central.reduce((deepest, day, index) => {
    const afterDay = a.central[index]
    if (afterDay === undefined) return deepest

    return Math.max(deepest, overallReserve(afterDay) - overallReserve(day))
  }, 0)

  const round = (value: number): number => Math.round(value * 10) / 10

  return {
    dayBefore: round(overallOn(b, onDay)),
    dayAfter: round(overallOn(a, onDay)),
    floorBefore: round(floorAcross(b)),
    floorAfter: round(floorAcross(a)),
    firstDeficitDayBefore: b.firstDeficitDay,
    firstDeficitDayAfter: a.firstDeficitDay,
    deepestLift: round(deepestLift),
  }
}

/** Floating-point slack. Two projections of the same fortnight differ in the last bit, and
 *  a gate that reads that as "the floor fell" would refuse rest for no reason. */
const EPSILON = 1e-9

const missKey = (miss: { itemId: string | null; kind: string }): string =>
  `${miss.itemId ?? 'absent'}:${miss.kind}`

/**
 * Whether the fortnight is no worse for it.
 *
 * A real gate, and it only has teeth on the rung where something of the student's moves.
 * `drain.ts` excludes `kind: 'rest'` from both `isDraining` and `isSwitch`, so rest dropped
 * into a gap that was already free is recovery that costs nothing — there is no honest way
 * for this to answer no, and pretending otherwise would be a gate that never closes.
 *
 * Moving work is different. The displaced block lands on another day where it costs more
 * under the §6.6 state multiplier, may sit nearer a deadline and so carry more
 * `deadlineDrain`, and does add a context switch. That can leave the fortnight worse than it
 * started, which is exactly what this refuses.
 */
function noWorse(
  before: Schedule,
  after: Schedule,
  params: EngineParams,
  today: number,
  blockLog: readonly BlockRecord[],
): boolean {
  const b = projectionOf(before, params, today, blockLog)
  const a = projectionOf(after, params, today, blockLog)

  if (floorAcross(a) < floorAcross(b) - EPSILON) return false
  if (a.deficitDays > b.deficitDays) return false

  // Nothing that was being kept up may start being missed to buy this. Rest's own deadline
  // going the other way is fine and expected -- that is the block doing its job.
  const already = new Set(missedSoftDeadlines(before, today, blockLog).map(missKey))

  return !missedSoftDeadlines(after, today, blockLog).some((miss) => !already.has(missKey(miss)))
}

/**
 * The block that would go on today, starting no earlier than now.
 *
 * Deliberately not `slotOn`, which prefers `REST_HOUR` of 20:00. That is the right answer
 * for planning rest and the wrong one for a student who is flat at two in the afternoon.
 * Rung 2 uses `slotOn` precisely because rung 2 *is* planning.
 */
function restNowOn(
  schedule: Schedule,
  dayIndex: number,
  nowHour: number,
  ceilingRoom: number,
): RestBlock | null {
  for (const gap of gapsOn(schedule, dayIndex)) {
    const start = Math.max(gap.startHour, nowHour)
    const available = gap.startHour + gap.hours - start
    if (available < MIN_GAP_HOURS) continue

    const hours = Math.min(available, USEFUL_REST_HOURS, ceilingRoom)
    if (hours < MIN_GAP_HOURS) return null

    return { dayIndex, startHour: start, hours }
  }

  return null
}

/** The block that would go on a later day, at the hour rest actually wants. */
function restLaterOn(schedule: Schedule, dayIndex: number): RestBlock | null {
  const ceilingRoom = roomForRest(schedule, dayIndex)
  if (ceilingRoom < MIN_GAP_HOURS) return null

  const widest = gapsOn(schedule, dayIndex).reduce((best, gap) => Math.max(best, gap.hours), 0)
  const hours = Math.min(widest, USEFUL_REST_HOURS, ceilingRoom)
  if (hours < MIN_GAP_HOURS) return null

  const slot = slotOn(schedule, dayIndex, REST_NEED(hours))
  if (slot === null) return null

  return { dayIndex, startHour: slot.startHour, hours }
}

const CEILING_REACHED =
  'Today has had as much recovery as the model will credit, so more of it would not buy anything.'
const NO_ROOM_TODAY = 'There is no stretch of today left with room in it.'
const MOVE_NOT_WORTH_IT =
  'Making room today would mean moving something, and that would cost more than the rest is worth.'

/**
 * §5's Rest button, as one pure answer.
 *
 * `today`, `nowHour` and `blockLog` are all REQUIRED. That is `priceRequest`'s lesson rather
 * than a style preference: optional versions of exactly these arguments are "precisely what
 * let the Telegram `/ask` call site be silently wrong for as long as it existed".
 */
export function planRest(
  schedule: Schedule,
  params: EngineParams,
  today: number,
  nowHour: number,
  blockLog: readonly BlockRecord[],
): RestPlan {
  const roomToday = roomForRest(schedule, today)

  // Rung 0: it already fits.
  if (roomToday >= MIN_GAP_HOURS) {
    const block = restNowOn(schedule, today, nowHour, roomToday)

    if (block !== null) {
      return { kind: 'fits', block, gain: gainOf(schedule, withRest(schedule, block), params, today, blockLog, block.dayIndex) }
    }
  }

  // Rung 1: one move opens room.
  //
  // `fixThatMakesRoom` is the right tool rather than a convenient one. `smallestFixes`
  // filters to `rank > 1e-9`, so every candidate it returns already improves the fortnight
  // on its own terms, and that filter narrows the list to moves which actually open a slot
  // on the day in question -- a different question, and the reason the filter exists.
  const whyNotToday = rungOne(schedule, params, today, nowHour, blockLog, roomToday)
  if (typeof whyNotToday !== 'string') return whyNotToday

  // Rung 2: the earliest later day with room.
  for (let day = today + 1; day < schedule.horizonDays; day += 1) {
    const block = restLaterOn(schedule, day)
    if (block === null) continue

    return {
      kind: 'laterDay',
      block,
      gain: gainOf(schedule, withRest(schedule, block), params, today, blockLog, block.dayIndex),
      whyNotToday,
    }
  }

  // Rung 3: nowhere.
  return {
    kind: 'refused',
    why: `${whyNotToday} No other day in the fortnight has room either.`,
  }
}

/**
 * Rung 1: the plan when one move genuinely opens room today, or the reason today failed.
 *
 * The two return types are the point rather than a shortcut. Rungs 2 and 3 both have to say
 * why today was not the answer, and that reason is only known here -- returning a bare
 * `null` would mean reconstructing it at two more call sites from state they do not have.
 */
function rungOne(
  schedule: Schedule,
  params: EngineParams,
  today: number,
  nowHour: number,
  blockLog: readonly BlockRecord[],
  roomToday: number,
): RestPlan | string {
  if (roomToday < MIN_GAP_HOURS) return CEILING_REACHED

  const wanted = Math.min(USEFUL_REST_HOURS, roomToday)
  const fix = fixThatMakesRoom(schedule, REST_NEED(wanted), today, params, today)
  if (fix === null) return NO_ROOM_TODAY

  const moved = fix.move.apply(schedule)
  const block = restNowOn(moved, today, nowHour, roomForRest(moved, today))
  if (block === null) return NO_ROOM_TODAY

  const after = withRest(moved, block)
  if (!noWorse(schedule, after, params, today, blockLog)) return MOVE_NOT_WORTH_IT

  return {
    kind: 'needsMove',
    block,
    move: fix,
    gain: gainOf(schedule, after, params, today, blockLog, block.dayIndex),
  }
}

/** Applies an approved plan. The only place the two-step order is written down: the move
 *  first, then the rest into the room it made. */
export function applyRest(schedule: Schedule, plan: RestPlan): Schedule {
  if (plan.kind === 'refused') return schedule
  if (plan.kind === 'needsMove') return withRest(plan.move.move.apply(schedule), plan.block)

  return withRest(schedule, plan.block)
}

/** Exported for the preview, which says what would be added rather than adding it. */
export const restBlockTitle = (): string => REST_TITLE
