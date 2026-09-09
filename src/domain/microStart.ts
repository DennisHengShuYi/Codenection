import type { ActivityKind } from '../engine'
import type { ScheduledItem } from '../optimizer'

/** §4.1's own example: "open the document and write the title. Eight minutes." */
export const MICRO_START_MINUTES = 8

/** §4.1's automatic trigger: two scheduled slots missed. */
export const STUCK_AFTER_MISSES = 2

/** §4.1's other half: or three days past first appearance. */
export const STUCK_AFTER_DAYS = 3

export interface MicroStart {
  readonly itemId: string
  readonly action: string
  readonly minutes: number
}

/**
 * The smallest visible move for each kind of work.
 *
 * §4.1's shape is permission at task level: "you don't have to write the essay, you have to
 * open the document and write the title". So these are first *moves*, not smaller versions
 * of the task -- "outline the essay" is still the essay, and a stuck person is no less stuck
 * looking at it.
 *
 * One action each, never a list, for the reason §5.2 gives about prescriptions: somebody who
 * cannot start cannot choose either.
 */
const FIRST_MOVE: Record<ActivityKind, string> = {
  studyBlock: 'Open the document and write the title. Nothing else.',
  errands: 'Find the one detail you need to start it — a number, an address, a name.',
  lightExercise: 'Put your shoes on and stand by the door.',
  hardExercise: 'Put your shoes on and stand by the door.',
  socialDraining: 'Open the message and write the first line. Do not send it yet.',
  socialRestorative: 'Open the message and write the first line. Do not send it yet.',
  rest: 'Sit down and set a timer. That is the whole thing.',
  sleep: 'Put the phone in another room.',
}

/**
 * One concrete first action, time-boxed under ten minutes.
 *
 * §4.1 asks the model for this in the real product; the rules here are what makes it work
 * with no key, on the same principle as the planner's fallback -- and a stuck student at
 * 2am is exactly who should not be waiting on a network.
 */
export function firstAction(item: ScheduledItem): MicroStart {
  return {
    itemId: item.id,
    action: FIRST_MOVE[item.kind],
    minutes: MICRO_START_MINUTES,
  }
}

/**
 * §4.1's automatic trigger: a task sitting untouched past a threshold.
 *
 * Two scheduled slots missed, or three days past first appearance. A block that repeatedly
 * returns "no" to §7.9's prompt is a stuck task, and this fires without the student ever
 * having to admit they are stuck — which is the point, since admitting it is itself an act
 * somebody stuck cannot easily take.
 *
 * §4.1 also describes a model-level signal this does not yet use: a stuck task accrues
 * mental drain without accruing progress, so paralysis shows up as rising mental load with
 * flat completion. That divergence is detectable and would be a better trigger than counting
 * misses. Not built — it needs completion tracking the app does not have yet.
 */
export function isStuck(item: ScheduledItem, misses: number, daysOld: number): boolean {
  // Rest is not a task somebody is failing to start, and offering a micro-start for it would
  // turn recovery into another thing to be behind on.
  if (item.protectedRest || item.kind === 'rest' || item.kind === 'sleep') return false

  return misses >= STUCK_AFTER_MISSES || daysOld >= STUCK_AFTER_DAYS
}
