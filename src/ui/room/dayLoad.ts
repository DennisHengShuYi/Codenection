import { answeredIds, type BlockRecord } from '../../domain/blockLog'
import { blocksOnDay } from '../../domain/dayBlocks'
import { ACTIVITY_KINDS, type ActivityKind } from '../../engine'
import { DAY_END_HOUR, WAKE_HOUR } from '../../optimizer'
import type { Schedule } from '../../optimizer'

/**
 * How long a day is, for the purpose of asking whether today fits inside one.
 *
 * Derived from the same two constants the solver and `prescribe.ts` use rather than typed
 * out again. A second, independent idea of how long a day is would let the room say a day
 * fits while the prescription says it does not -- and the number would be right on the day
 * it was written and wrong the first time anyone moved the boundary.
 */
export const WAKING_HOURS = DAY_END_HOUR - WAKE_HOUR

export interface DayLoad {
  /** Hours today asked for, by kind. What the day contains, answered or not. */
  readonly hoursByKind: Readonly<Record<ActivityKind, number>>
  /** Hours still ahead: the same, less anything the student has answered. */
  readonly remainingByKind: Readonly<Record<ActivityKind, number>>
  readonly totalHours: number
  /**
   * Hours that do not fit inside the waking day, and therefore have to come out of sleep.
   *
   * Measured against everything today asked for rather than what is left of it: a day that
   * could never have fitted was over-committed when it was planned, and answering its
   * blocks one at a time does not retrospectively make it fit.
   */
  readonly spillHours: number
}

const noHours = (): Record<ActivityKind, number> =>
  Object.fromEntries(ACTIVITY_KINDS.map((kind) => [kind, 0])) as Record<ActivityKind, number>

/**
 * Ruling 45: what today consists of, with no notion of drawing.
 *
 * The room used to read the fortnight's reserves for all nine of its bindings, which is a
 * coherent picture of a fortnight and a vague one about today. This is the answer the
 * furniture is bound to instead -- hours per kind, what is left of them, and what does not
 * fit in the day at all.
 *
 * Hours rather than block counts, deliberately: four hours of study fills a desk more than
 * four twenty-minute blocks do, and it is the hours the engine models anyway.
 */
export function dayLoadFor(
  schedule: Schedule,
  today: number,
  blockLog: readonly BlockRecord[],
): DayLoad {
  // `blocksOnDay` rather than a filter of its own: the question "which blocks are on this
  // day" already has one answer in the codebase, and a second one here would be free to
  // drift from it -- over protected rest, say, which that helper deliberately includes.
  const onToday = blocksOnDay(schedule, today)
  const answered = new Set(answeredIds(blockLog))

  const hoursByKind = noHours()
  const remainingByKind = noHours()
  let totalHours = 0

  for (const item of onToday) {
    hoursByKind[item.kind] += item.hours
    totalHours += item.hours

    // Answered on the today card, so it is put away rather than counted up (§1.3: the room
    // is a mirror, not something to be scored against).
    if (!answered.has(item.id)) remainingByKind[item.kind] += item.hours
  }

  return {
    hoursByKind,
    remainingByKind,
    totalHours,
    spillHours: Math.max(0, totalHours - WAKING_HOURS),
  }
}
