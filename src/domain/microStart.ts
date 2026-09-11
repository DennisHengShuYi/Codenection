import type { ScheduledItem } from '../optimizer'
import { firstRung } from './ladder'

/**
 * What the trigger used to be: three days past first appearance.
 *
 * Kept as a record rather than in use. `isStuck` fires on the block's own slot now -- see
 * its docstring for why an age was the wrong question -- and a constant nothing reads is
 * the kind of thing that gets wired back in by accident, so it is exported for the spec's
 * §11 and nothing else.
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
  const first = firstRung(item)

  return { itemId: item.id, action: first.action, minutes: first.minutes }
}

/**
 * §4.1's automatic trigger: you are in this block's slot.
 *
 * It fired three days after a block first appeared, which put "stuck on this one?" in front
 * of a student at any hour of any day, about something they had not been near since Tuesday.
 * Worse, a block three days old sits on a *past* day -- so by the time the prompt appeared,
 * the one moment it was actionable had gone.
 *
 * Paralysis is worth interrupting at the moment you are supposed to be doing the thing. That
 * is what this asks now, and it still asks without the student having to admit anything,
 * which was always the point: admitting you are stuck is itself an act somebody stuck cannot
 * easily take.
 *
 * What this gives up is the student who is avoiding something for days on end and never
 * scheduled it again -- the card no longer finds them. §4.1's model-level signal is the
 * honest answer to that case: a stuck task accrues mental drain without accruing progress,
 * so paralysis shows as rising mental load against flat completion. Still not built, and it
 * needs completion tracking the app does not have -- but it is a better trigger than an age,
 * and an age was never more than a stand-in for it.
 */
export function isStuck(
  item: ScheduledItem,
  now: { readonly today: number; readonly nowHour: number },
): boolean {
  // Rest is not a task somebody is failing to start, and offering a micro-start for it would
  // turn recovery into another thing to be behind on.
  if (item.protectedRest || item.kind === 'rest' || item.kind === 'sleep') return false

  if (item.dayIndex !== now.today) return false

  return now.nowHour >= item.startHour && now.nowHour < item.startHour + item.hours
}
