import { IN_THEIR_WORDS } from './realityCheck'
import {
  DEFICIT_THRESHOLD,
  drainSources,
  LOAD_TYPES,
  type DayInput,
  type DrainSource,
  type EngineParams,
  type Projection,
  type Reserves,
} from '../engine'

/**
 * Why a day is forecast to be a deficit day.
 *
 * §4's grid marks these with a warning and says nothing else, and the ones that most need
 * explaining are the days that look empty -- a light day carrying a warning is where a
 * fortnight of load finally lands, and nothing on that day accounts for it.
 *
 * Everything here is recomputed rather than guessed. The projection is deterministic and
 * keeps its reserves for every day, so each day's drain can be run again exactly as it was
 * charged; `drainSources` is that arithmetic itemised, bound to `drainForDay` by a test. An
 * explanation that named a plausible culprit instead would be a story about a day the model
 * never simulated, which is the one thing §8.2 says the product copy may never do.
 */
export interface DeficitCause {
  /** The reserve that actually gave way. The deficit test reads the floor, so there is
   *  always exactly one answer rather than a general lowness. */
  readonly type: (typeof LOAD_TYPES)[number]
  /** Where it is forecast to reach on the day, not merely that it is under the line. */
  readonly level: number
  /** The first day of the run-up: where this reserve was last above the line. */
  readonly fromDay: number
  /** Where the points went over that run-up, biggest first, and only what this reserve
   *  actually paid for. */
  readonly sources: readonly DrainSource[]
  /** Nights in the run-up that paid back less than a full one would have. */
  readonly shortNights: number
  /** Hours of rest and restorative contact over the run-up, which is the other half of why
   *  a reserve ends where it does. */
  readonly recoveryHours: number
}

const lowestOf = (reserves: Reserves): (typeof LOAD_TYPES)[number] =>
  LOAD_TYPES.reduce((lowest, type) => (reserves[type] < reserves[lowest] ? type : lowest))

export function explainDeficit({
  start,
  days,
  projection,
  params,
  dayIndex,
}: {
  readonly start: Reserves
  readonly days: readonly DayInput[]
  readonly projection: Projection
  readonly params: EngineParams
  readonly dayIndex: number
}): DeficitCause | null {
  const onTheDay = projection.central[dayIndex]
  if (onTheDay === undefined) return null

  const type = lowestOf(onTheDay)
  const level = onTheDay[type]
  if (level >= DEFICIT_THRESHOLD) return null

  // Where this reserve was last above the line. Counting from the top of the fortnight would
  // hand a student "since day 0" about a crossing on day eleven, which explains nothing --
  // and the days before the slide began did not spend what the slide spent.
  let fromDay = 0
  for (let day = dayIndex - 1; day >= 0; day -= 1) {
    if ((projection.central[day]?.[type] ?? 0) >= DEFICIT_THRESHOLD) {
      fromDay = day + 1
      break
    }
  }

  const totals = new Map<string, DrainSource>()
  let shortNights = 0
  let recoveryHours = 0

  for (let day = fromDay; day <= dayIndex; day += 1) {
    const input = days[day]
    if (input === undefined) continue

    // The reserves the projection actually entered this day with: what it pushed for the day
    // before, or the fortnight's own starting point on day zero. Anything else would price
    // the day's work at a state the model never simulated.
    const entering = day === 0 ? start : (projection.central[day - 1] ?? start)

    for (const source of drainSources(input, entering, params)) {
      if (source.type !== type) continue

      const key = source.source
      const existing = totals.get(key)
      totals.set(key, { ...source, points: (existing?.points ?? 0) + source.points })
    }

    if (input.sleepHours < params.sleepBaselineHours + 2) shortNights += 1

    for (const activity of input.activities) {
      if (activity.kind === 'rest' || activity.kind === 'socialRestorative') {
        recoveryHours += activity.hours
      }
    }
  }

  return {
    type,
    level,
    fromDay,
    sources: [...totals.values()].sort((left, right) => right.points - left.points),
    shortNights,
    recoveryHours,
  }
}

/** Each source in the words a student uses, rather than the model's field names. */
const SOURCE_WORDS: Record<string, string> = {
  studyBlock: 'studying',
  hardExercise: 'hard exercise',
  lightExercise: 'moving about',
  socialDraining: 'social obligations',
  socialRestorative: 'time with people',
  errands: 'life admin',
  fragmentation: 'switching between blocks',
  deadline: 'a deadline coming up',
  travel: 'getting between places',
  isolation: 'days with nobody in them',
}

/** Below this, no single source is the reason and saying one is would be picking a culprit
 *  to sound decisive. The honest answer is that the load was spread. */
const DOMINANT_SHARE = 0.4

/**
 * The cause, in two sentences a student can act on.
 *
 * §7.6's discipline, and it matters more here than anywhere: this is read by the one student
 * the model thinks is heading for trouble. It explains rather than scolds, it says only what
 * was computed, and where nothing dominates it says so instead of naming the first line of a
 * tied list as the reason.
 */
export function describeDeficit(cause: DeficitCause): string {
  const total = cause.sources.reduce((sum, source) => sum + source.points, 0)
  const biggest = cause.sources[0]

  const where =
    biggest === undefined || total === 0
      ? 'Nothing scheduled in the days before it accounts for that on its own.'
      : biggest.points / total >= DOMINANT_SHARE
        ? `Most of it goes on ${SOURCE_WORDS[biggest.source] ?? biggest.source}.`
        : 'It is spread across several things rather than any one of them.'

  // Only where it is true, and only as a fact about the arithmetic: sleep above the baseline
  // is what recovery is computed from, so short nights are literally less coming back.
  const nights =
    cause.shortNights === 0
      ? ''
      : cause.shortNights === 1
        ? ' One short night in there gave back less than a full one would have.'
        : ` ${cause.shortNights} short nights in there gave back less than full ones would have.`

  return [
    `${IN_THEIR_WORDS[cause.type]} is forecast to reach ${Math.round(cause.level)} on this day,`,
    `below the ${DEFICIT_THRESHOLD} where one empty reserve starts pulling the others down.`,
    where,
    nights.trim(),
  ]
    .filter((part) => part !== '')
    .join(' ')
}
