import { summarise, type DayInput, type EngineParams } from '../engine'
import { modeOf, type Mode } from './mode'
import type { Schedule, ScheduledItem } from './types'

/** §2.1's two penalty weights. They live here rather than in the engine's params: they
 *  are properties of how we score a schedule, not of how a student's reserves behave,
 *  and `src/engine` must not depend on the optimizer. */
export const DEFICIT_DAY_WEIGHT = 0.3
export const FRAGMENTATION_WEIGHT = 0.1

/**
 * Deliberately tiny, because this is a tiebreaker and not a fourth objective.
 *
 * Deficit area runs to several hundred on a bad fortnight, so at this weight it
 * contributes well under a point -- less than any real gain in the floor and less than a
 * single deficit day. The ordering stays exactly as §2.1 states it: floor first, then
 * deficit days, then fragmentation, and only then depth. If this were large enough to
 * outrank the floor, the solver could trade a genuinely higher worst day for a flatter
 * but lower week, which is the outcome §2.1's min() exists to forbid.
 */
export const DEFICIT_AREA_WEIGHT = 0.001

/**
 * §20's weight, and a tiebreaker rather than a fourth objective -- for the same reason
 * `DEFICIT_AREA_WEIGHT` is tiny.
 *
 * Sized so that leaving a substantial piece of work to its deadline costs well under a
 * point: less than any real gain in the floor, and less than a single deficit day. If it
 * were larger the solver would wreck a student's worst day to move an essay one day
 * earlier, which inverts §2.1's whole ordering.
 */
export const DEADLINE_PRESSURE_WEIGHT = 0.008

/**
 * How much it would cost to leave this piece of work until the last moment.
 *
 * Derived, never asked for. §20 is explicit that no student should be made to rank their
 * own work, because everybody marks everything high and the ranking carries no information
 * once they have. This reads the two things the app already knows: what kind of load it is,
 * and how big it is. Four hours of final-year project and four hours of laundry stop being
 * interchangeable without anybody being asked which they care about.
 *
 * `typeIntensity` appears here as well as in drain, and the two are different questions:
 * there it is how tiring the work is, here it is what it costs to be late with it. That
 * they happen to rank load types the same way is a fact about study being both heavier and
 * more consequential than laundry, not a double count of one effect.
 */
const consequenceOf = (item: ScheduledItem, params: EngineParams): number =>
  params.typeIntensity[item.type] * item.hours

/**
 * §20's missing term: what it costs to defer work toward its own deadline.
 *
 * The solver could always defer an item to protect the floor, and nothing scored that as a
 * bad trade -- two blocks differing only in `typeIntensity` were interchangeable load, and
 * `deadlineProximityWeight` models something else entirely (the anticipatory stress a
 * looming deadline causes, collapsed to one nearest-deadline figure per day).
 *
 * Charged only in the last day or two before the deadline, and that sparseness is
 * deliberate rather than a simplification.
 *
 * The first version fell off smoothly as `1 / (1 + buffer)`, which sounds better and is
 * worse: it gives the objective a gradient at *every* item on *every* week, so the hill
 * climber always has another fractional improvement available and grinds on chasing it.
 * Measured, that took an ordinary fortnight from 402 evaluations and 73ms to 2,407 and
 * 222ms -- past §2.1's sub-100ms budget, to express a difference between five days of
 * buffer and six that the model has no basis for claiming.
 *
 * So it charges nothing until the buffer is genuinely gone. "Due tomorrow" and "due in a
 * week" are different in kind; "due in five days" and "due in six" are not, and pretending
 * otherwise cost twice the search for no better answer.
 *
 * An item already past its deadline is a constraint violation and `constraints.ts` handles
 * it. Undated work has no deadline to be late for and costs nothing.
 */
const NO_BUFFER_LEFT_DAYS = 1

function deadlinePressure(schedule: Schedule, params: EngineParams): number {
  let total = 0

  for (const item of schedule.items) {
    if (item.deadlineDay === null) continue

    const buffer = Math.max(0, item.deadlineDay - item.dayIndex)
    if (buffer > NO_BUFFER_LEFT_DAYS) continue

    total += consequenceOf(item, params) * (NO_BUFFER_LEFT_DAYS + 1 - buffer)
  }

  return total
}

/** Rest and sleep are recovery, not load, and must not count against the daily cap or
 *  the fragmentation penalty. */
const isWork = (kind: string): boolean => kind !== 'rest' && kind !== 'sleep'

/** One pass over the items instead of one pass per day. The search calls this for every
 *  candidate it scores, so filtering the whole schedule 21 times over is 21x the work to
 *  answer a question a single grouping pass answers. */
function groupByDay(schedule: Schedule): ScheduledItem[][] {
  const byDay: ScheduledItem[][] = Array.from({ length: schedule.horizonDays }, () => [])

  for (const item of schedule.items) {
    byDay[item.dayIndex]?.push(item)
  }

  return byDay
}

/**
 * The nearest deadline at or after each day.
 *
 * One backward sweep: walking from the end, the nearest deadline for a day is either one
 * falling on that day or whatever the following day already found. Only deadlines still
 * ahead create anticipatory stress -- one already passed is either met or moot, and
 * either way it has stopped weighing.
 */
function nearestDeadlineByDay(schedule: Schedule): (number | null)[] {
  const deadlines = new Set<number>()
  for (const item of schedule.items) {
    if (item.deadlineDay !== null) deadlines.add(item.deadlineDay)
  }

  const out: (number | null)[] = Array.from({ length: schedule.horizonDays }, () => null)
  let nearest: number | null = null

  for (let day = schedule.horizonDays - 1; day >= 0; day -= 1) {
    if (deadlines.has(day)) nearest = day
    out[day] = nearest
  }

  return out
}

/**
 * §8b's missing-data signal, one entry per horizon day, for a caller with no real check-in
 * data to thread -- the search's own thousands of internal calls per solve, which have no
 * notion of a missed check-in and nothing to gain from one. Deliberately a required
 * argument rather than a default: `checkedIn` used to be optional and silently defaulted to
 * "everybody present", which is exactly how that mechanism sat dead once -- every caller
 * that forgot to pass the real signal kept compiling and kept passing, quietly. Passing
 * `ALL_PRESENT` states the same choice out loud, so the search's own pessimism-free
 * evaluation is a deliberate property of *the search*, not an accident of an omitted
 * argument. Indexing an out-of-range day still reads as present -- `dayInputsFrom` below --
 * which is what makes an empty array work as this constant regardless of horizon length.
 */
export const ALL_PRESENT: readonly boolean[] = []

/**
 * Turns a schedule into the per-day inputs the engine consumes.
 *
 * The engine knows nothing about scheduling and the optimizer knows nothing about
 * reserves; this function is the only place the two vocabularies meet, which is what
 * keeps either one replaceable without touching the other.
 *
 * @param checkedIn §8b's missing-data signal, one entry per horizon day. Required rather
 * than defaulted -- see `ALL_PRESENT`'s own doc for why. Only the app's own projection,
 * built from the real block log via `checkedInDays`, has real data to pass; everything else
 * passes `ALL_PRESENT` explicitly.
 */
export function toDayInputs(schedule: Schedule, checkedIn: readonly boolean[]): DayInput[] {
  return dayInputsFrom(schedule, groupByDay(schedule), checkedIn)
}

function dayInputsFrom(
  schedule: Schedule,
  byDay: readonly ScheduledItem[][],
  checkedIn: readonly boolean[],
): DayInput[] {
  const nearestDeadline = nearestDeadlineByDay(schedule)

  return byDay.map((onThisDay, dayIndex) => {
    let workingBlocks = 0
    for (const item of onThisDay) if (isWork(item.kind)) workingBlocks += 1

    const deadline = nearestDeadline[dayIndex] ?? null

    return {
      dayIndex,
      activities: onThisDay.map((item) => ({
        kind: item.kind,
        type: item.type,
        hours: item.hours,
        intensity: item.intensity,
        startHour: item.startHour,
      })),
      sleepHours: schedule.sleepByDay[dayIndex] ?? 7,
      // Each distinct working block is treated as a venue; back-to-back commitments in
      // one place are the exception rather than the rule for a student crossing campus.
      venueChanges: Math.max(0, workingBlocks - 1),
      daysToNearestDeadline: deadline === null ? null : deadline - dayIndex,
      checkedIn: checkedIn[dayIndex] ?? true,
    }
  })
}

function fragmentationOf(byDay: readonly ScheduledItem[][]): number {
  let total = 0

  for (const onThisDay of byDay) {
    let working = 0
    for (const item of onThisDay) if (isWork(item.kind)) working += 1
    total += Math.max(0, working - 1)
  }

  return total
}

/**
 * §2.1's objective, verbatim:
 *
 *     score = min(reserve over the horizon)
 *             − 0.3 × count(days below deficit)
 *             − 0.1 × fragmentation penalty
 *
 * It maximises the *minimum* reserve, not the total and not the evenness, because
 * burnout is a floor problem: a fortnight that averages fine but bottoms out at 8 is
 * still a crash.
 *
 * The floor is `worstFloor` -- the lowest single reserve across every type and day --
 * rather than the lowest daily mean. Scoring the mean would let the solver trade a
 * wrecked mind for a rested body and call it an improvement, which is the single-number
 * failure §6.3 exists to prevent.
 */
/**
 * §21: how much each penalty counts, given the shape of the fortnight.
 *
 * The list's own phrasing is that a low-structure week should invert "from flattening peaks
 * to defending a floor", and these are those two halves as the objective already expresses
 * them. Fragmentation is the peak-flattening term -- it pushes work off a heavy day and onto
 * a lighter one. Deficit area is the floor-defending one: how far below the threshold the
 * week actually falls.
 *
 * A student with a timetable burns out from overload, crammed against a frame they cannot
 * move, so spreading the load is the useful thing to ask for. A student with almost nothing
 * fixed burns out from drift: nothing forces a heavy day, and tidying their fortnight into
 * one block per day solves a problem they do not have while saying nothing about how low it
 * gets. So the tidying term falls silent and depth counts for more.
 *
 * `worstFloor` is untouched in every mode. §2.1's ordering is not up for negotiation: the
 * solver may never trade a genuinely higher worst day for a better-arranged week.
 */
const MODE_WEIGHTS: Record<Mode, { fragmentation: number; deficitArea: number }> = {
  studying: { fragmentation: FRAGMENTATION_WEIGHT, deficitArea: DEFICIT_AREA_WEIGHT },
  shifts: { fragmentation: FRAGMENTATION_WEIGHT, deficitArea: DEFICIT_AREA_WEIGHT },
  /**
   * Shifted, not switched off, and the difference matters more than it looks.
   *
   * The strong reading of "invert" is to zero the tidying term. Three existing invariants
   * pushed back on that, and they were right to: a student who has not imported a timetable
   * yet *is* a low-structure week by this measure -- §42 exists because that is common -- so
   * zeroing it would quietly stop spreading anyone's work until they entered their classes.
   * The direction is the point, not the extremity. Tidying yields to depth here; it does not
   * stop speaking.
   *
   * Ten times a deliberately tiny number is still a tiebreaker rather than a fourth
   * objective: deficit area runs to a few hundred on a bad fortnight, so this stays well
   * under the value of a single deficit day.
   */
  lowStructure: { fragmentation: FRAGMENTATION_WEIGHT / 4, deficitArea: DEFICIT_AREA_WEIGHT * 10 },
}

export function score(schedule: Schedule, params: EngineParams): number {
  // Grouped once and shared. The search calls this for every candidate on every
  // iteration, so a second pass over the same items to count fragmentation is pure waste.
  const byDay = groupByDay(schedule)
  // The search's own thousands of calls per solve: no check-in data exists for a candidate
  // being explored, and it is not the search's place to invent any. `ALL_PRESENT` says so.
  const projection = summarise(schedule.start, dayInputsFrom(schedule, byDay, ALL_PRESENT), params)

  // §21: read off the fixed load, which the student already stated by entering their
  // timetable -- nobody is asked which kind of week they are having.
  const weights = MODE_WEIGHTS[modeOf(schedule)]

  return (
    projection.worstFloor -
    DEFICIT_DAY_WEIGHT * projection.deficitDays -
    weights.fragmentation * fragmentationOf(byDay) -
    weights.deficitArea * projection.deficitArea -
    DEADLINE_PRESSURE_WEIGHT * deadlinePressure(schedule, params)
  )
}
