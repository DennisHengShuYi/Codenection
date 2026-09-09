import type { ActivityKind, LoadType, Reserves } from '../engine'
import type { Schedule } from '../optimizer'
import { blocksOnDay } from './dayBlocks'

/**
 * §5.2's prescription: one option, matched to the depleted type, sized to a real gap.
 *
 * Everything here is pure. What it produces is a description of a rest block, not a
 * scheduled one -- adding it to the week is the caller's job, and only after the student
 * has agreed.
 */
export interface Prescription {
  readonly type: LoadType
  readonly kind: ActivityKind
  readonly title: string
  readonly startHour: number
  readonly hours: number
  /** Always true. §5.1 calls structurally protected recovery the most important design
   *  decision in the app: rest the optimizer can move to fit work in is not protected. */
  readonly protectedRest: true
}

/** §5.1: recovery has a ceiling as well as a floor. Past a point the returns go flat and
 *  then negative, so an empty day must not produce an absurd suggestion. */
export const MAX_REST_HOURS = 2

/** Below this there is not enough of a gap for anything to be worth starting. */
const MIN_REST_HOURS = 0.5

/** The hours a suggestion may fall in. Prescribing a walk at 3am helps nobody. */
const DAY_START = 8
const DAY_END = 22

/**
 * Only the three reserves recovery actually serves.
 *
 * Errands is a load type but not something rest repairs -- a low errands reserve means
 * chores are piling up, and the answer to that is not a walk. So it never decides the
 * prescription, even when it is the lowest number on the screen.
 */
const RECOVERABLE: readonly LoadType[] = ['mental', 'physical', 'social']

/** §5.2's matching, and the reason this is a table rather than a sentence: social low
 *  prescribes a person, physical low prescribes movement, and mental low prescribes actual
 *  downtime rather than a different screen. */
const FOR_TYPE: Readonly<Record<string, { kind: ActivityKind; title: string }>> = {
  social: { kind: 'socialRestorative', title: 'Message one person you like and see them' },
  physical: { kind: 'lightExercise', title: 'A walk outside' },
  mental: { kind: 'rest', title: 'Lie down away from a screen' },
}

/** The first gap long enough to be worth taking, within waking hours. */
function findGap(schedule: Schedule, dayIndex: number): { startHour: number; hours: number } | null {
  const blocks = blocksOnDay(schedule, dayIndex)

  let cursor = DAY_START

  for (const block of blocks) {
    const free = block.startHour - cursor
    if (free >= MIN_REST_HOURS) return { startHour: cursor, hours: free }

    cursor = Math.max(cursor, block.startHour + block.hours)
  }

  const free = DAY_END - cursor
  return free >= MIN_REST_HOURS ? { startHour: cursor, hours: free } : null
}

/**
 * One thing to do, or nothing.
 *
 * Null when the day has no room. Said plainly by the caller rather than dressed up as a
 * suggestion that cannot be taken -- offering rest into a day with no gap is how an app
 * starts feeling like it is not listening.
 */
export function prescribeRest(
  schedule: Schedule,
  reserves: Reserves,
  dayIndex: number,
): Prescription | null {
  const gap = findGap(schedule, dayIndex)
  if (gap === null) return null

  const lowest = RECOVERABLE.reduce((worst, type) =>
    reserves[type] < reserves[worst] ? type : worst,
  )

  const shape = FOR_TYPE[lowest]
  if (shape === undefined) return null

  return {
    type: lowest,
    kind: shape.kind,
    title: shape.title,
    startHour: gap.startHour,
    // Capped: a long gap is an opportunity, not an instruction to rest for six hours.
    hours: Math.min(gap.hours, MAX_REST_HOURS),
    protectedRest: true,
  }
}
