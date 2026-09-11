import { HORIZON_DAYS, project, type ActivityKind, type EngineParams, type LoadType } from '../engine'
import { ALL_PRESENT, score, toDayInputs, type Schedule, type ScheduledItem } from '../optimizer'
import { dropCommitmentFor } from './commitments'
import { slotOn } from './slotFinder'
import { effectiveDeadline } from './softDeadlines'


/**
 * The first place in the app that edits a week outside the optimizer.
 *
 * §1.3 requires tapping a clutter box to have "real model consequences" rather than only
 * changing the picture, and these are those consequences. Plain functions over a
 * schedule, the same shape the optimizer works in, so the projection recomputes from the
 * edited week with nothing else to keep in step.
 */

/**
 * Everything the student can set about a block by hand.
 *
 * Deliberately NOT every field of a `ScheduledItem`. `intensity` is a modelling number a
 * student has no way to judge; `deadlineDay` comes from what the work actually is;
 * `seriesId` belongs to the recurrence that created it; and `protectedRest` is §5.1's
 * invariant -- nothing a student types may mint protected recovery, which is why `addBlock`
 * below hardcodes it false exactly as `placeItems` does. Editing an existing protected
 * block keeps its protection, and the form says what moving it means.
 */
export interface ItemFields {
  readonly title: string
  readonly type: LoadType
  readonly kind: ActivityKind
  readonly hours: number
  readonly dayIndex: number
  readonly startHour: number
  readonly fixed: boolean
  /**
   * When it is due, as against when it is scheduled.
   *
   * Null means no real deadline, and the kind's synthetic one applies instead -- which is
   * what every hand-made block used to get, because this form had no way to say otherwise.
   * A real deadline always wins over a synthetic one (`effectiveDeadline`), so setting it
   * here is how a student overrules the app's guess about their own work.
   */
  readonly deadlineDay: number | null
}

const withoutItem = (schedule: Schedule, id: string): Schedule => ({
  ...schedule,
  items: schedule.items.filter((item) => item.id !== id),
})

export function completeItem(schedule: Schedule, id: string): Schedule {
  return withoutItem(schedule, id)
}

/**
 * How much better a day has to score before it is worth waiting for.
 *
 * Small, because §2.1's own weights are small: fragmentation is 0.1 of a reserve point per
 * extra block, and a quarter of that on a low-structure week. Anything at or above this is a
 * signal the objective meant; anything below it is arithmetic noise.
 *
 * The tiebreak it enables is what keeps Later meaning *later*. Reserve-wise a later day is
 * almost always better -- there is more of the fortnight left to absorb the work -- so a
 * search maximising a float with no tiebreak walks every block to its deadline. Days are
 * visited in order and a later one must be **strictly** better by this much to displace an
 * earlier incumbent, so an even week moves a block one day and not eleven.
 */
const WORTH_WAITING_FOR = 0.01

/**
 * Pushes an item later, to the kindest day that will take it.
 *
 * Bounded twice, and both bounds matter. It never crosses the item's deadline, because
 * deferring must not become a way to make a deadline quietly disappear. And it never
 * leaves the horizon, because an item pushed off the end vanishes from the model while
 * still existing in the student's life.
 *
 * **It used to be pure geometry**, and that was the defect: the first day forward with a gap
 * won, whatever that day was already carrying. So Later would drop four hours of study onto
 * the worst day of the fortnight without noticing, and a student had to run Rebalance to
 * undo what Later had just done -- two features on one screen working against each other.
 *
 * Now every day with room is scored with §2.1's own objective, whole. Using a reserve figure
 * alone was tried first and is a trap: `worstFloor` is the minimum over the *whole* horizon,
 * so on a healthy week it sits on a day before any of the candidates and reads identically
 * for all of them -- the same saturation `deficitArea` exists to rescue the solver from. And
 * the day-local alternatives all climb monotonically, because reserve-wise a later day is
 * always better, so they degenerate into "defer everything to its deadline".
 *
 * `score` already holds the counterweights that stop exactly that: deadline and neglect
 * pressure charge for leaving work to the last moment, and fragmentation charges for piling
 * it onto a day that is already busy. Reusing it means no new weight is invented here and
 * none can drift out of step with the one the rebalancer optimises.
 *
 * Deliberately *not* a second optimizer (Ruling 16 forbids one). It searches days it was
 * already walking, scores each with one `summarise` -- around twenty projections for a whole
 * fortnight, against the thousands `rebalance` runs -- and takes the best. It chains nothing
 * and moves nothing else.
 *
 * §6.4 says deferred load should compound rather than vanish. Rolling debt is not built
 * yet, so this moves the item honestly and the interface says the cost is coming, rather
 * than implying the week just got easier.
 *
 * @param params required rather than defaulted, for the reason this file already applies to
 * the block log: a call site that forgets compiles, looks reasonable, and quietly scores a
 * calibrated student's week against population priors.
 */
export interface Deferral {
  /** The week after the move, or the untouched one when nothing had room. */
  readonly schedule: Schedule
  readonly from: number
  /** Null when it did not move. Deliberately not `from`, so a caller cannot mistake
   *  "stayed put" for "moved zero days" -- the two need different sentences. */
  readonly to: number | null
  /** Days before `to` that nothing would fit into. */
  readonly skippedFull: number
  /**
   * Why it did not move, or null when it did.
   *
   * `full` means days were looked at and none had room. `due` means there were no days to
   * look at: the deadline is at or before the day the block already sits on, so the search
   * range is empty. Collapsing the two reported "nothing had room" about a fortnight where no
   * day was full and none had been examined -- and `due` is the common case, not the edge
   * one, because a rhythm dates from its last confirmed occurrence plus an interval and is
   * therefore already overdue whenever it is scheduled further out than that.
   */
  readonly blocked: 'full' | 'due' | null
  /**
   * Days before `to` that had room and were passed over anyway.
   *
   * The count that earns this whole type. A student who watches Later skip a visibly empty
   * Wednesday has no way to tell a decision from a bug, and the obvious reading of the button
   * is still the old behaviour -- the next day with a gap.
   */
  readonly skippedWithRoom: number
  /**
   * The lowest the block's own reserve reaches from the move onward, as things stand and as
   * they would be after it. Null when nothing moved and there is nothing to price.
   *
   * On the block's own load type rather than `worstFloor`, which `requestCost` already had to
   * learn: the overall floor is usually social isolation weeks out, and a study block moving
   * between two days never touches it, so on that measure every move prices as free.
   *
   * Worth having because the search never compares its candidate days against *leaving the
   * block alone*. It picks the best day to move to, which can still be worse than not moving,
   * and a student being asked to approve that deserves to see it.
   */
  readonly floorBefore: number | null
  readonly floorAfter: number | null
}

/** @see deferralOf -- this is that, with the reasons dropped. */
export function deferItem(schedule: Schedule, id: string, params: EngineParams): Schedule {
  return deferralOf(schedule, id, params)?.schedule ?? schedule
}

export function deferralOf(
  schedule: Schedule,
  id: string,
  params: EngineParams,
): Deferral | null {
  const item = schedule.items.find((candidate) => candidate.id === id)
  if (item === undefined) return null

  // Ruling 62/Ruling 45: whichever deadline actually applies, real or synthetic. This read
  // `item.deadlineDay` alone, so undated work -- a walk, a rest, seeing someone -- could be
  // pushed to the end of the fortnight for free. `softDeadlines`' own docstring names this
  // line as one of the three reasons that module exists.
  const latest = Math.min(effectiveDeadline(item) ?? HORIZON_DAYS - 1, HORIZON_DAYS - 1)

  // The block itself is out of the way while its new home is looked for, or it would be
  // found clashing with where it already is -- and on a day it shares with nothing else,
  // that would rule out the only opening there is.
  const without = withoutItem(schedule, id)
  const need = { hours: item.hours, type: item.type, kind: item.kind }

  const moved = (day: number, startHour: number): Schedule => ({
    ...schedule,
    items: schedule.items.map((candidate) =>
      candidate.id === id ? { ...candidate, dayIndex: day, startHour } : candidate,
    ),
  })

  let best: { schedule: Schedule; score: number; day: number } | null = null
  // Every day looked at, and whether anything would fit there. Counted against the winning
  // day at the end rather than as we go, because the winner is not known until the walk is
  // over -- a day passed over early may turn out to be *after* nothing, if nothing later
  // beats it.
  const roomOn: boolean[] = []

  for (let day = item.dayIndex + 1; day <= latest; day += 1) {
    const slot = slotOn(without, day, need)
    roomOn[day] = slot !== null
    if (slot === null) continue

    const candidate = moved(day, slot.startHour)
    const value = score(candidate, params)

    // Days are visited in order, so the incumbent is always the earliest of everything seen
    // so far -- which is what makes "strictly better, by enough to matter" resolve a tie
    // toward the earlier day without a second comparison having to say so.
    if (best === null || value > best.score + WORTH_WAITING_FOR) {
      best = { schedule: candidate, score: value, day }
    }
  }

  if (best !== null) {
    let skippedFull = 0
    let skippedWithRoom = 0

    for (let day = item.dayIndex + 1; day < best.day; day += 1) {
      if (roomOn[day] === true) skippedWithRoom += 1
      else skippedFull += 1
    }

    /**
     * The lowest this reserve gets **from the move onward**.
     *
     * Not the whole horizon, and the cut is what makes the number mean anything. Every day
     * before the block's current one is identical in both worlds -- nothing about the move
     * reaches back -- so including them can only bury the difference under a trough neither
     * option can change. `requestCost` hit the same wall from the other side and answered it
     * with `deepestDrop`; the honest equivalent for a move is to stop measuring the part that
     * did not move.
     *
     * `ALL_PRESENT` for the same reason the scoring above uses it: this function is not given
     * the check-in signal, and both sides are measured identically, so a pessimism applying to
     * both cannot change the difference between them.
     */
    const floorOf = (week: Schedule): number => {
      const projected = project(week.start, toDayInputs(week, ALL_PRESENT), params)
      const affected = projected.central.slice(item.dayIndex)

      return affected.length === 0
        ? 0
        : Math.min(...affected.map((reserves) => reserves[item.type]))
    }

    return {
      schedule: best.schedule,
      from: item.dayIndex,
      to: best.day,
      skippedFull,
      skippedWithRoom,
      blocked: null,
      floorBefore: floorOf(schedule),
      floorAfter: floorOf(best.schedule),
    }
  }

  // Nowhere legal to put it: every day between here and the deadline is full. The week comes
  // back untouched and identical, so a caller can tell nothing happened -- which is what the
  // old arithmetic could not say. It returned the same day it was given and looked like a
  // move, and the sheet closed on a button that had done nothing.
  // Counted, never assumed: with `latest` at or behind the block's own day the loop above
  // never ran, so no day was examined and none may be reported as full.
  const examined = Math.max(0, latest - item.dayIndex)

  return {
    schedule,
    from: item.dayIndex,
    to: null,
    skippedFull: examined,
    skippedWithRoom: 0,
    blocked: examined === 0 ? 'due' : 'full',
    floorBefore: null,
    floorAfter: null,
  }
}

/**
 * Writes the student's own version of a block over the app's.
 *
 * Every field outside `ItemFields` survives, which is the point: a protected nap edited to
 * a different hour is still protected, a recurring class edited in one week keeps its
 * series, and a deadline the student was never shown is not silently cleared by a form that
 * never asked about it.
 *
 * An unknown id is a no-op rather than a throw. It happens for real -- the same stale-id
 * case `blockSheet` already handles by closing the sheet.
 */
export function editItem(schedule: Schedule, id: string, fields: ItemFields): Schedule {
  return {
    ...schedule,
    items: schedule.items.map((item) => (item.id === id ? { ...item, ...fields } : item)),
  }
}

/**
 * Takes a block out because it is not happening.
 *
 * Mechanically what `completeItem` does to the week, and deliberately a separate name: "I
 * did it" and "this is off" are different facts about a block, and on the day one of them
 * starts being logged rather than dropped, only one of these two should change. A caller
 * that reached for whichever name was handy would make that change unsafe.
 *
 * Unlike `completeItem` it also retires the provisional acceptance behind the block, where
 * there was one -- a yes with nothing left to point at (§2.3).
 */
export function removeItem(schedule: Schedule, id: string): Schedule {
  return dropCommitmentFor(withoutItem(schedule, id), id)
}

/**
 * Puts a block in the week exactly where the student said.
 *
 * Deliberately NOT `placeItems`, which is the right path for something the app read off a
 * photo or a paragraph and has to find room for. Here the student has already chosen the
 * day and the hour on a grid they were looking at, and auto-placing it somewhere else would
 * be the app overriding a decision it had just asked them to make. Where that choice
 * clashes with something, the form says so before the save -- see `editWarnings`.
 *
 * The id follows `scheduleRecovery`'s pattern: the clock plus the current length, which
 * cannot collide within one week because the length moves with every add.
 */
export function addBlock(schedule: Schedule, fields: ItemFields): Schedule {
  const added: ScheduledItem = {
    ...fields,
    id: `manual-${Date.now()}-${schedule.items.length}`,
    intensity: 1,
    deadlineDay: null,
    // §5.1: nothing a student types may create structurally protected recovery. Only
    // `scheduleRecovery` and the prescription path may, and both are the app's own advice.
    protectedRest: false,
  }

  return { ...schedule, items: [...schedule.items, added] }
}
