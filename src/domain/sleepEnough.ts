import { ENOUGH_SLEEP_HOURS } from '../engine'
import { MIN_SAMPLES_TO_SPEAK } from './evidence'
import type { EnergyPrediction } from './predictions'
import type { SleepNight } from './sleepLog'

/**
 * How much sleep is enough for THIS student, learned from their own fortnight.
 *
 * `engine/params.ENOUGH_SLEEP_HOURS` is where sleep stops paying back, and it ships as a
 * population figure of nine. Three places in this codebase say out loud that they are waiting
 * for a measured one -- §7.2's "Not built" note, §7.3's `Baseline sleep` row, and
 * `roomState.RESTED_NIGHT_HOURS`, whose docstring states the consequence plainly ("for a
 * student who needs nine hours the bed under-reports"). This is the estimator those were
 * waiting on.
 *
 * Deliberately NOT a fifth entry in `recoveryLearning.LEARNED`. That learner nudges a
 * coefficient and measures how far the projection moves, and its own reasoning already rules
 * out thresholds -- `socialFloorHoursPerDay` is left as a constant there for exactly this
 * reason, its derivative being "zero everywhere except a cliff". The bite is worse here:
 * nudging a ceiling UPWARD changes nothing at all for a student whose nights sit below it, so
 * every such sample measures zero sensitivity and is discarded. That learner could only ever
 * push this figure up, and "seven is enough for me" is a correction down.
 *
 * What identifies a threshold is not a derivative but a comparison of two groups, which is
 * what this does instead.
 */

/**
 * The residual band a single day is allowed to speak within, in reserve points.
 *
 * Residuals are clamped into it before averaging -- a mean of capped residuals rather than a
 * raw one. §8.1's own accuracy figure runs at a few points, so a day twenty points from its
 * claim is already the largest miss the app has language for; a day sixty points out went
 * wrong for reasons no sleep model explains, and letting it through would let one bad Tuesday
 * rewrite what this student needs every night.
 *
 * Copied in spirit from `recoveryScales`' clamp rather than invented, and for its stated
 * reason: a learner without one produces a confident wrong number, which this project treats
 * as worse than no number at all.
 */
const RESIDUAL_CAP = 20

/** The gap between the two groups, in reserve points, at which the evidence is taken at full
 *  strength. Below it the move is scaled down in proportion, so weak evidence moves the
 *  figure weakly rather than either fully or not at all. */
const FULL_STRENGTH_GAP = 10

/**
 * How far apart the two groups must sit before the comparison is about anything.
 *
 * The other half of the evidence bar, and the half that was missing. A median split ALWAYS
 * produces two groups, so three nights of 7.4 hours against three of 7.6 cleared the sample
 * floor and got compared -- and residuals absorb exams, colds and arguments along with sleep,
 * so the two sides differed anyway. Measured before this existed: twelve minutes of variation
 * and three ordinary bad days produced "about 7.9 hours is enough for you".
 *
 * That is a confident wrong number, which this project holds to be worse than none. An hour,
 * because below it there is no plausible reading on which the difference is ABOUT sleep: the
 * groups are the same night twice, and whatever separates their days is something else.
 *
 * It makes the estimator rarer, which is the right direction. This is for the student whose
 * nights genuinely swing between five and nine, not for one whose sleep is a flat line with
 * rounding on it.
 */
const MIN_GROUP_SEPARATION_HOURS = 1

/** Pairs at which the sample size stops holding the move back. Two clear weeks. */
const CONFIDENT_PAIRS = 8

/**
 * What a night could believably be, for somebody.
 *
 * Six because below it no student's *requirement* is six hours -- a fortnight implying it is
 * describing something other than sleep. Twelve because above it the claim stops being about
 * a need. §8.2's rule again: the honest failure is a refusal to be more specific than the
 * evidence supports, not a precise answer nobody should believe.
 */
const MIN_ENOUGH_HOURS = 6
const MAX_ENOUGH_HOURS = 12

/**
 * How far above the longest night observed the figure is allowed to reach.
 *
 * Only used in the "more sleep is still paying" direction, where the evidence says the
 * ceiling is somewhere above every night on record and cannot say where. Two hours is a
 * deliberate under-claim: it moves the model in the direction the evidence points without
 * inventing a figure nothing measured.
 */
const HEADROOM_HOURS = 2

interface Pair {
  readonly hours: number
  readonly residual: number
}

/**
 * Nights joined to the day each one shaped.
 *
 * The join key is the date both records already carry, and it is the right one without any
 * arithmetic: `SleepNight.isoDate` is the MORNING a night ended, and a night ending on the
 * morning of day D is the night that shaped day D. (`Schedule.sleepByDay` keys the same night
 * differently and `sleepPlan.lastNight` converts; nothing here needs that, because neither
 * side of this join is the week.)
 *
 * A prediction nobody has answered is dropped rather than scored as zero. Zero residual means
 * "the model was exactly right", so counting unanswered days as zero would pull every
 * estimate toward the flattering answer -- the same conflation `meanAbsoluteError` refuses.
 */
function pairsOf(
  nights: readonly SleepNight[],
  predictions: readonly EnergyPrediction[],
): readonly Pair[] {
  const slept = new Map(nights.map((night) => [night.isoDate, night.hours]))

  return predictions.flatMap((prediction) => {
    if (prediction.reported === null) return []

    const hours = slept.get(prediction.forDate)
    if (hours === undefined) return []

    return [{ hours, residual: prediction.reported - prediction.predicted }]
  })
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : (((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2)
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value))

const meanCappedResidual = (pairs: readonly Pair[]): number =>
  pairs.reduce((total, pair) => total + clamp(pair.residual, -RESIDUAL_CAP, RESIDUAL_CAP), 0) /
  pairs.length

/**
 * The figure the engine should use, or the population one when the evidence cannot support a
 * personal claim.
 *
 * The split is at the student's OWN median night rather than at any fixed hour, which keeps
 * the two groups balanced whatever their sleep looks like -- a student sleeping five and six
 * hours gets a comparison, and so does one sleeping eight and ten.
 *
 * The direction is what makes it a threshold estimate. If the longer nights land
 * systematically WORSE than predicted than the shorter ones do, the app has been crediting
 * sleep this student does not benefit from, and the ceiling comes down toward the split. If
 * they land better, the credit was stopping too early and the ceiling goes up past the
 * longest night on record.
 */
export function enoughSleepFor(
  nights: readonly SleepNight[],
  predictions: readonly EnergyPrediction[],
): number {
  const pairs = pairsOf(nights, predictions)
  if (pairs.length === 0) return ENOUGH_SLEEP_HOURS

  const split = median(pairs.map((pair) => pair.hours))
  const shorter = pairs.filter((pair) => pair.hours < split)
  const longer = pairs.filter((pair) => pair.hours >= split)

  // Both sides, each clearing the shared floor. A student whose sleep never varies has no
  // shorter group at all, and gets the population figure rather than a guess -- the same
  // silence every other unmeasured parameter keeps.
  if (shorter.length < MIN_SAMPLES_TO_SPEAK || longer.length < MIN_SAMPLES_TO_SPEAK) {
    return ENOUGH_SLEEP_HOURS
  }

  // And far enough apart to be about sleep at all. Enough samples on each side is only half
  // the bar -- see `MIN_GROUP_SEPARATION_HOURS` for the twelve-minute case it was missing.
  const meanHours = (group: readonly Pair[]): number =>
    group.reduce((total, pair) => total + pair.hours, 0) / group.length

  if (meanHours(longer) - meanHours(shorter) < MIN_GROUP_SEPARATION_HOURS) {
    return ENOUGH_SLEEP_HOURS
  }

  // Positive when the longer nights underperformed the shorter ones.
  const gap = meanCappedResidual(shorter) - meanCappedResidual(longer)

  const weight =
    Math.min(1, Math.abs(gap) / FULL_STRENGTH_GAP) * Math.min(1, pairs.length / CONFIDENT_PAIRS)

  const longestNight = Math.max(...pairs.map((pair) => pair.hours))
  const target = gap > 0 ? split : longestNight + HEADROOM_HOURS

  return clamp(
    ENOUGH_SLEEP_HOURS + weight * (target - ENOUGH_SLEEP_HOURS),
    MIN_ENOUGH_HOURS,
    MAX_ENOUGH_HOURS,
  )
}

/**
 * The one sentence the sleep page says about it, or nothing.
 *
 * Three states, not two. A figure below the population one names itself. A figure above it
 * cannot name anything -- the evidence says only that the ceiling is higher than every night
 * on record -- so it says that instead, which is the student who would otherwise be told
 * nothing while needing to hear the most. And an unmeasured figure says nothing at all.
 *
 * §8.2: states, never instructs. There is no "should" here on purpose.
 */
export function sleepEnoughLine(learned: number, population: number): string | null {
  if (learned === population) return null

  if (learned > population) {
    return 'Your own nights suggest more sleep is still buying you something.'
  }

  return `Your own nights suggest about ${Math.round(learned * 10) / 10} hours is enough for you — past that it stops adding much.`
}
