import type { ScheduledItem } from '../optimizer'
import { ruleLadder } from './ladder'

/**
 * §4.1's other half of the trigger: three days past first appearance.
 *
 * §4.1 also describes a miss-counting half -- two scheduled slots missed -- but nothing in
 * this codebase counts missed slots, so a `misses` parameter here could never be supplied
 * with a real value. It was hardcoded `0` at all three call sites, which is exactly the
 * kind of silent stub this branch exists to end. Recorded in the spec's §11 rather than
 * built: see `isStuck` below.
 */
export const STUCK_AFTER_DAYS = 3

export interface MicroStart {
  readonly itemId: string
  readonly action: string
  readonly minutes: number
}

/**
 * §4.1's single first move, for a surface with no room for a chain.
 *
 * The Telegram bot answers `/start <task>` with one message and cannot walk a ladder, so it
 * gets rung one. §3's stuck card in the room shows the same thing, unasked, and its call to
 * action opens the page that carries the rest.
 *
 * Derived from `ruleLadder` rather than keeping the table this file used to hold. Two tables
 * is two answers to "what is the first move on this block", and the bot and the app would
 * drift apart the first time either was edited alone.
 */
export function firstAction(item: ScheduledItem): MicroStart {
  const first = ruleLadder(item).rungs[0]

  // `ruleLadder` returns at least MIN_RUNGS for every kind, so this is unreachable -- but
  // `noUncheckedIndexedAccess` is right to insist, and a dull honest sentence reaching a
  // student beats an empty one.
  if (first === undefined) {
    return { itemId: item.id, action: 'Start with the smallest part of it.', minutes: 5 }
  }

  return { itemId: item.id, action: first.action, minutes: first.minutes }
}

/**
 * §4.1's automatic trigger: a task sitting untouched past a threshold.
 *
 * Three days past first appearance. A block that repeatedly returns "no" to §7.9's prompt
 * is a stuck task, and this fires without the student ever having to admit they are stuck
 * — which is the point, since admitting it is itself an act somebody stuck cannot easily
 * take.
 *
 * §4.1's other half of the trigger -- two scheduled slots missed -- is not built: nothing in
 * this codebase counts missed slots, so there is no `misses` this function could honestly
 * take a parameter for. See `STUCK_AFTER_DAYS`'s docstring and the spec's §11.
 *
 * §4.1 also describes a model-level signal this does not yet use: a stuck task accrues
 * mental drain without accruing progress, so paralysis shows up as rising mental load with
 * flat completion. That divergence is detectable and would be a better trigger than counting
 * misses. Not built — it needs completion tracking the app does not have yet.
 */
export function isStuck(item: ScheduledItem, daysOld: number): boolean {
  // Rest is not a task somebody is failing to start, and offering a micro-start for it would
  // turn recovery into another thing to be behind on.
  if (item.protectedRest || item.kind === 'rest' || item.kind === 'sleep') return false

  return daysOld >= STUCK_AFTER_DAYS
}
