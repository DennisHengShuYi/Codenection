import type { ActivityKind } from '../engine'
import type { ScheduledItem } from '../optimizer'

/** §4.1's time box: "one concrete first action with a time box under ten minutes". */
export const MAX_RUNG_MINUTES = 10

/** Fewer than three rungs is not a chain through to finishing; more than six is a plan, and
 *  a plan is the thing a stuck person cannot face. */
export const MIN_RUNGS = 3
export const MAX_RUNGS = 6

/** One instruction, not a paragraph. A rung a student has to read twice is a rung they have
 *  to decide about, which is what §5.2 says they cannot do. */
export const MAX_ACTION_LENGTH = 160

export interface Rung {
  readonly action: string
  readonly minutes: number
}

/**
 * §4.1 as amended: the whole chain is generated, exactly one rung is ever shown.
 *
 * `done` is a count rather than a set of ticked ids. The chain is ordered and rung 4 cannot
 * precede rung 3, so a count is the honest representation of the state -- and it makes
 * "step 3 of 6" a subtraction rather than a search.
 */
export interface Ladder {
  readonly blockId: string
  readonly rungs: readonly Rung[]
  readonly done: number
}

export const currentRung = (ladder: Ladder): Rung | null => ladder.rungs[ladder.done] ?? null

export const isComplete = (ladder: Ladder): boolean => ladder.done >= ladder.rungs.length

export const advance = (ladder: Ladder): Ladder =>
  isComplete(ladder) ? ladder : { ...ladder, done: ladder.done + 1 }

/**
 * Swaps the rung the student is looking at, and does NOT move the count.
 *
 * Rejecting a suggestion is not progress through it. Advancing here would tell somebody who
 * disliked two suggestions in a row that they were two steps in, which is the opposite of
 * what they just said.
 */
export const replaceCurrent = (ladder: Ladder, rung: Rung): Ladder =>
  isComplete(ladder)
    ? ladder
    : {
        ...ladder,
        rungs: ladder.rungs.map((existing, index) => (index === ladder.done ? rung : existing)),
      }

/**
 * The chain for each kind of work, with no network involved.
 *
 * This is the offline answer, and it lives in the domain rather than in `src/ai/` for the
 * reason the old `firstAction` already gave: a stuck student at 2am is exactly who should
 * not be waiting on a model. It replaces that function's one canned move per kind with a
 * chain of the same shape.
 *
 * The rungs are first *moves*, never smaller versions of the task -- §4.1's "outline the
 * essay is still the essay". None of them names the task, which is why this generator does
 * not read `item.title` at all: a rule that interpolated the title could only ever produce
 * the task reworded, which is the failure the feature exists to fix. Naming the specific
 * task is the model's job, and the model has the title.
 */
const CHAINS: Record<ActivityKind, readonly Rung[]> = {
  studyBlock: [
    { action: 'Open the document. Do not read anything yet.', minutes: 2 },
    { action: 'Write the title at the top. Nothing else.', minutes: 3 },
    { action: 'Write one bad sentence underneath it. Bad is the point.', minutes: 5 },
    { action: 'Keep going for five more minutes, then stop whether or not it is good.', minutes: 5 },
  ],
  errands: [
    { action: 'Find the one detail you need — a number, an address, a name.', minutes: 5 },
    { action: 'Put it somewhere you will see it: a note, a reminder, the back of your hand.', minutes: 2 },
    { action: 'Do the first half of it. Stop there if you want to.', minutes: 10 },
  ],
  lightExercise: [
    { action: 'Put your shoes on and stand by the door.', minutes: 3 },
    { action: 'Go outside. You are allowed to turn round immediately.', minutes: 2 },
    { action: 'Walk for ten minutes. Turning back is finishing, not quitting.', minutes: 10 },
  ],
  hardExercise: [
    { action: 'Put your kit on. That is the whole step.', minutes: 5 },
    { action: 'Get to where you do it. You have not committed to anything yet.', minutes: 10 },
    { action: 'Do the easiest set. If you stop after it, you still went.', minutes: 10 },
  ],
  socialDraining: [
    { action: 'Open the message. Do not reply yet.', minutes: 2 },
    { action: 'Write the first line. It does not have to be sent.', minutes: 5 },
    { action: 'Send it, or close it and let it wait. Either one ends this.', minutes: 2 },
  ],
  socialRestorative: [
    { action: 'Open the message and read the last thing they said.', minutes: 2 },
    { action: 'Write one line back. Short is warm, not rude.', minutes: 5 },
    { action: 'Send it. You do not owe anyone the longer version.', minutes: 2 },
  ],
  // §5.1: recovery is structurally protected. These lower the bar to resting; none of them
  // asks the student to finish, complete or get through anything.
  rest: [
    { action: 'Put the phone somewhere you cannot reach from where you are sitting.', minutes: 2 },
    { action: 'Set a timer so you do not have to keep checking the clock.', minutes: 1 },
    { action: 'Sit down. Doing nothing for the whole timer is the right amount.', minutes: 10 },
  ],
  sleep: [
    { action: 'Put the phone in another room. Not face down — another room.', minutes: 2 },
    { action: 'Turn the main light off. The small one is fine.', minutes: 1 },
    { action: 'Lie down. Not sleeping yet still counts as this.', minutes: 10 },
  ],
}

export function ruleLadder(item: ScheduledItem): Ladder {
  // Protected rest is rest whatever kind it carries: a restorative coffee the optimizer has
  // protected must not be handed the social chain, which would ask the student to get
  // through it.
  const kind: ActivityKind = item.protectedRest ? 'rest' : item.kind

  return { blockId: item.id, rungs: CHAINS[kind], done: 0 }
}
