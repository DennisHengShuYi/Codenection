import type { ActivityKind, LoadType } from '../engine'
import type { BlockOutcome } from './calibration'
import { MIN_SAMPLES_TO_SPEAK } from './evidence'
import { sameFamily, taskKeyOf } from './taskKey'

/**
 * Enough blocks to call something a bias rather than a bad week.
 *
 * One block that overran is noise. §7.4 puts estimate bias at day 7 onward for the same
 * reason -- it needs history, and claiming it earlier would be a measurement of nothing.
 *
 * Re-exported rather than declared, so this and `recoveryLearning` cannot drift. Kept under
 * this name because the tests and `fixtures/umBlockLog.test.ts` read it from here.
 */
export const MIN_SAMPLES = MIN_SAMPLES_TO_SPEAK

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

/**
 * How much evidence each rung of the ladder needs before it speaks.
 *
 * The same three everywhere, which is a change of mind and worth recording as one. These
 * used to climb -- four for a kind, five for a task -- on the argument that replacing a
 * working correction with a narrower claim should need more behind it than making the first
 * one. That reasoning was sound and the consequence was not: a student who had done one
 * specific thing four times was still being told a number about their whole area of life,
 * and the narrow buckets that would have said something true about them took most of a
 * semester to fill.
 *
 * So the narrowest bucket with three answers wins, and the rungs below it catch what has
 * fewer. One or two answers about a task is not a bucket; it falls to that task's kind,
 * which is the same evidence read one step wider rather than none at all.
 *
 * Three is `MIN_SAMPLES_TO_SPEAK`, which `evidence.ts` argues for in its own right: under
 * three a correction is noise presented as insight, which §8.2 forbids. The trade accepted
 * here is that a narrow figure from three answers is noisier than one from five. It is also
 * about the work in front of the student rather than about a category they were sorted
 * into, and that is what makes it worth acting on.
 */
const MIN_SAMPLES_FOR_KIND = MIN_SAMPLES
const MIN_SAMPLES_FOR_TASK = MIN_SAMPLES

/** What the ladder needs to know about the block being priced. */
export interface TaskLike {
  readonly type: LoadType
  readonly kind: ActivityKind
  readonly title: string
}

/** The ratio, or null when there is not enough behind it to be worth saying. */
function ratioOf(history: readonly BlockOutcome[], atLeast: number): number | null {
  if (history.length < atLeast) return null

  const planned = history.reduce((total, outcome) => total + outcome.plannedHours, 0)
  const actual = history.reduce((total, outcome) => total + outcome.actualHours, 0)
  if (planned === 0) return null

  return Math.min(MAX_PADDING, Math.max(1, actual / planned))
}

/**
 * §2.4's padding for one block, from the narrowest bucket that has earned it.
 *
 *     this exact work (5+)  ->  this kind of activity (4+)  ->  this area of life (3+)  ->  1
 *
 * The narrow rungs are what let the app say something true about *your essays* rather than
 * about "study and writing" -- a student whose essays run 3x over and whose lab reports land
 * on time was being told one averaged number about both.
 *
 * A rung that has not earned its place falls through rather than going quiet, so adding
 * these can only sharpen what was already said, never silence it.
 *
 * Kind guards the task rung, because containment alone would merge "Run" with "Run errands":
 * one is light exercise and the other is life admin, and they have nothing to teach each
 * other. See `taskKey.sameFamily`.
 */
export function paddingForItem(outcomes: readonly BlockOutcome[], block: TaskLike): number {
  return paddingDetail(outcomes, block).padding
}

/** Which rung of the ladder answered, or none. The words depend on it: "your essays" and
 *  "study and writing" are different claims about different evidence. */
export type PaddingRung = 'task' | 'kind' | 'type' | 'none'

export interface PaddingDetail {
  readonly padding: number
  readonly rung: PaddingRung
}

/**
 * The padding for a block, and where it came from.
 *
 * Split out from `paddingForItem` because the sentence a student reads has to name what the
 * figure is about, and the number alone cannot say. The engine takes `.padding` and ignores
 * the rest, so the charge and the claim are one calculation rather than two that can drift
 * -- which is exactly what happened when the line quoted the area figure while the engine
 * charged the task one.
 */
export function paddingDetail(
  outcomes: readonly BlockOutcome[],
  block: TaskLike,
): PaddingDetail {
  const usable = outcomes.filter((outcome) => outcome.plannedHours > 0)
  const key = taskKeyOf(block.title)

  const sameKind = usable.filter((outcome) => outcome.kind === block.kind)

  const family = sameKind.filter(
    (outcome) => outcome.title !== undefined && sameFamily(taskKeyOf(outcome.title), key),
  )

  const task = ratioOf(family, MIN_SAMPLES_FOR_TASK)
  if (task !== null) return { padding: task, rung: 'task' }

  const kind = ratioOf(sameKind, MIN_SAMPLES_FOR_KIND)
  if (kind !== null) return { padding: kind, rung: 'kind' }

  const area = ratioOf(relevant(usable, block.type), MIN_SAMPLES)
  if (area !== null) return { padding: area, rung: 'type' }

  return { padding: 1, rung: 'none' }
}

/** The kinds in a student's words, for the rung between a task and an area of life. */
const KIND_WORDS: Record<string, string> = {
  studyBlock: 'studying',
  hardExercise: 'hard exercise',
  lightExercise: 'moving about',
  socialDraining: 'social obligations',
  socialRestorative: 'time with people',
  errands: 'life admin',
}

const sayBias = (label: string, padding: number): string =>
  `You underestimate ${label} by about ${Math.round(padding * 10) / 10}×. We pad it automatically.`

/**
 * §7.6's line for one block, quoting the figure that is actually charged to it.
 *
 * It used to quote the area of life while the engine charged the ladder, so the app could
 * say "study and writing, about 1.4x" about a block it was charging 1.9x -- and could
 * announce a padding on work whose own bucket sits at 1.0, because the student's *other*
 * study runs long. This is the only place any of it is visible, so it says what is in use
 * and names the evidence it came from.
 */
export function biasLineForBlock(
  outcomes: readonly BlockOutcome[],
  block: TaskLike,
): string | null {
  const { padding, rung } = paddingDetail(outcomes, block)
  if (padding < WORTH_SAYING) return null

  if (rung === 'task') return sayBias(block.title, padding)
  if (rung === 'kind') return sayBias(KIND_WORDS[block.kind] ?? IN_THEIR_WORDS[block.type], padding)

  return sayBias(IN_THEIR_WORDS[block.type], padding)
}
