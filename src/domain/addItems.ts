import type { ParsedItem } from '../ai'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'

/** Placed in the evening by default: undated work is what a student fits around fixed
 *  commitments, and the optimizer is free to move it anyway. */
const DEFAULT_START_HOUR = 19

/** Somewhere with room, rather than day zero. Piling everything onto today is the shape
 *  the optimizer then has to spend its whole budget undoing. */
const DEFAULT_DAY = 2

/**
 * Social maps to draining, not restorative, and the asymmetry is deliberate.
 *
 * A parse cannot reliably tell "coffee with Sarah" from "group meeting", so one of the two
 * errors has to be chosen. Treating an obligation as restorative would credit a student
 * with recovery they never got and report them as fine while they sink -- the same class of
 * failure as sleep curing loneliness, which the engine already refuses. Treating a genuine
 * restorative coffee as draining only under-reports recovery, which errs toward caution. A
 * student who disagrees changes the kind on the chip before accepting it.
 */
const KIND_FOR = {
  mental: 'studyBlock',
  physical: 'lightExercise',
  social: 'socialDraining',
  errands: 'errands',
} as const

/**
 * Turns accepted chips into real schedule items.
 *
 * Everything here arrives from a parse, and a parse is a proposal. Nothing it produces may
 * be fixed or protected: a model able to create protected rest could pin a block the
 * optimizer is forbidden to move, and that guarantee is what §5.1's whole stance rests on.
 */
export function addItems(schedule: Schedule, items: readonly ParsedItem[]): Schedule {
  const stamp = Date.now()

  const added: ScheduledItem[] = items.map((item, index) => ({
    id: `added-${stamp}-${index}-${item.id}`,
    title: item.title,
    type: item.type,
    kind: KIND_FOR[item.type],
    hours: item.hours,
    intensity: 1,
    dayIndex:
      item.deadlineDay === null ? DEFAULT_DAY : Math.min(item.deadlineDay, HORIZON_DAYS - 1),
    startHour: DEFAULT_START_HOUR,
    // Never fixed, never protected. A proposal cannot pin anything.
    fixed: false,
    deadlineDay: item.deadlineDay,
    protectedRest: false,
  }))

  return { ...schedule, items: [...schedule.items, ...added] }
}
