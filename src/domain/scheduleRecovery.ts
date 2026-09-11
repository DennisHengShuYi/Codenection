import type { ActivityKind, LoadType } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'

/**
 * Puts recovery into the week as *protected* rest.
 *
 * Deliberately separate from `addItems`, which never creates protected rest and says so in
 * its own comment: anything arriving from a parse is a proposal, and a model able to pin a
 * block the optimizer may not move would break the guarantee §5.1 calls the most important
 * design decision in the app.
 *
 * A prescription is not a proposal parsed from text. It is the app's own suggestion,
 * accepted by the student in one tap — which is exactly the case §5.1 wants protected, so
 * that the optimizer cannot quietly move it to fit work in. Keeping the two paths apart is
 * what stops the second one weakening the first.
 *
 * `stamp` exists so this can genuinely be the only door. It read `Date.now()`, which made it
 * unusable from `telegram/handle`, a pure function that takes its clock as a parameter -- so
 * the chat's Rest button hand-built the same item instead, and `restNow.ts`'s claim that this
 * is "the only door to protected rest" was already false. Every field agreed by luck rather
 * than by construction, and the next field added here would have been the one that did not.
 *
 * Also idempotent, for the caller that needs it to be. Telegram delivers a callback at least
 * once, and the chat path had no guard at all where its three sibling callbacks each have
 * one -- so a retried tap appended a second identical rest block. Protected rest already at
 * that day and hour means the tap has been honoured, so the week comes back unchanged rather
 * than doubled.
 */
export function scheduleRecovery(
  schedule: Schedule,
  recovery: {
    readonly title: string
    readonly type: LoadType
    readonly kind: ActivityKind
    readonly hours: number
    readonly dayIndex: number
    readonly startHour: number
  },
  /** Makes the id, and makes this pure. Defaults to the clock for the app's own call site,
   *  which has no deterministic stamp to hand and never needed one. */
  stamp: number = Date.now(),
): Schedule {
  const alreadyBooked = schedule.items.some(
    (existing) =>
      existing.protectedRest &&
      existing.dayIndex === recovery.dayIndex &&
      existing.startHour === recovery.startHour,
  )
  if (alreadyBooked) return schedule

  const item: ScheduledItem = {
    id: `recovery-${stamp}-${schedule.items.length}`,
    title: recovery.title,
    type: recovery.type,
    kind: recovery.kind,
    hours: recovery.hours,
    intensity: 1,
    dayIndex: recovery.dayIndex,
    startHour: recovery.startHour,
    // Fixed as well as protected: §5.1 asks for recovery the optimizer cannot move to fit
    // work in, and `fixed` alone would still let something be scheduled over it.
    fixed: true,
    deadlineDay: null,
    protectedRest: true,
  }

  return { ...schedule, items: [...schedule.items, item] }
}
