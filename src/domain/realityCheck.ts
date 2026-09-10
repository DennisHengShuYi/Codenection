import type { LoadType } from '../engine'
import type { BlockOutcome } from './calibration'

/**
 * Enough blocks to call something a bias rather than a bad week.
 *
 * One block that overran is noise. §7.4 puts estimate bias at day 7 onward for the same
 * reason -- it needs history, and claiming it earlier would be a measurement of nothing.
 */
export const MIN_SAMPLES = 3

/**
 * A ceiling on the correction.
 *
 * An unbounded multiplier from a couple of disastrous weeks would put a student's fortnight
 * into fiction -- the same failure §7.2 warns about, arriving from the other direction.
 */
const MAX_PADDING = 3

/** The student's words for each kind of load. §7.6's lines are read by a person, not by the
 *  model, and "mental load" is a modelling term. Exported so any other surface naming a load
 *  type in student-facing text -- `BlockSheet` included -- reuses this map instead of writing
 *  a second one that can drift from it. */
export const IN_THEIR_WORDS: Record<LoadType, string> = {
  mental: 'study and writing',
  physical: 'physical things',
  social: 'seeing people',
  errands: 'life admin',
}

const relevant = (outcomes: readonly BlockOutcome[], type: LoadType): BlockOutcome[] =>
  outcomes.filter((outcome) => outcome.type === type && outcome.plannedHours > 0)

/**
 * §2.4's padding multiplier.
 *
 * Corrects the student's estimates against their own history rather than asking them to be
 * more realistic, and it is applied silently -- §2.4 is explicit that the student need not
 * know the parameter exists.
 *
 * Only overruns pad. Finishing early is not a reason to shrink an estimate: §2.4 is about
 * underestimation, and padding downward would quietly make a heavy week look survivable,
 * which is the opposite of what this app is for.
 */
export function paddingFor(outcomes: readonly BlockOutcome[], type: LoadType): number {
  const history = relevant(outcomes, type)
  if (history.length < MIN_SAMPLES) return 1

  const planned = history.reduce((total, outcome) => total + outcome.plannedHours, 0)
  const actual = history.reduce((total, outcome) => total + outcome.actualHours, 0)
  if (planned === 0) return 1

  return Math.min(MAX_PADDING, Math.max(1, actual / planned))
}

/** Below this the difference is rounding, not a bias worth telling somebody about. */
const WORTH_SAYING = 1.15

/**
 * §7.6's line, and §2.4's second surface: "You underestimate writing by 1.7×. We pad it
 * automatically."
 *
 * Null rather than a sentence when there is nothing to say. §7.6 is only the sharpest answer
 * to "how is this different from a to-do list" if every line on it is true -- a screen
 * claiming a bias nobody measured is worse than a screen with fewer lines.
 */
export function biasLine(outcomes: readonly BlockOutcome[], type: LoadType): string | null {
  const padding = paddingFor(outcomes, type)
  if (padding < WORTH_SAYING) return null

  return `You underestimate ${IN_THEIR_WORDS[type]} by about ${Math.round(padding * 10) / 10}×. We pad it automatically.`
}
