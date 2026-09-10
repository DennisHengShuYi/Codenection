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
 * Turns accepted chips into real schedule items.
 *
 * Everything here arrives from a parse, and a parse is a proposal -- but a proposal the
 * student has now read and accepted, which is what makes `fixed` safe to honour. §5.1's
 * guarantee is drawn precisely: `protectedRest` is the thing the optimizer may never move,
 * and nothing arriving from text may create it, whatever the chip says. Pinning a time and
 * creating untouchable rest are different powers, and only the first is on offer here.
 *
 * That guarantee is likewise unrelated to `kind` -- a movable rest block is a different
 * thing from `protectedRest` and is safe -- so `kind` is carried straight through from the
 * parse rather than re-derived from `type` the way it used to be.
 */
export function addItems(schedule: Schedule, items: readonly ParsedItem[]): Schedule {
  const stamp = Date.now()

  const added: ScheduledItem[] = items.map((item, index) => ({
    id: `added-${stamp}-${index}-${item.id}`,
    title: item.title,
    type: item.type,
    kind: item.kind,
    hours: item.hours,
    intensity: 1,
    dayIndex:
      item.deadlineDay === null ? DEFAULT_DAY : Math.min(item.deadlineDay, HORIZON_DAYS - 1),
    startHour: DEFAULT_START_HOUR,
    // What the student confirmed on the chip, not what the model claimed. The two are
    // different things: `hard` arrives as the model's reading of the page and seeds the
    // checkbox, and the accept is what commits it -- so a lecture can finally be a lecture
    // rather than a suggestion the optimizer is free to move to Thursday.
    fixed: item.fixed,
    deadlineDay: item.deadlineDay,
    protectedRest: false,
  }))

  return { ...schedule, items: [...schedule.items, ...added] }
}
