import type { ParsedItem } from '../ai'
import { DEFICIT_THRESHOLD, project, type EngineParams } from '../engine'
import { toDayInputs, type Commitment, type Schedule } from '../optimizer'
import { addItems } from './addItems'

/**
 * How long a provisional yes stands before it has to prove itself.
 *
 * Far enough out that a week can genuinely change, close enough that a lapse still leaves
 * time to withdraw gracefully rather than on the morning.
 */
export const REVIEW_DAYS = 7

/**
 * §2.3's provisional yes.
 *
 * Students do not struggle to say no because they lack a reason; they struggle because
 * saying no requires an act. So an acceptance carries a review date, and if the reserve
 * cannot hold it by then it lapses on its own. The effort changes direction: leaving
 * becomes the default, and staying in becomes the act.
 */
export function accept(schedule: Schedule, item: ParsedItem, today: number): Schedule {
  const withItem = addItems(schedule, [item])
  const added = withItem.items[withItem.items.length - 1]

  const commitment: Commitment = {
    id: `commitment-${item.id}`,
    title: item.title,
    reviewDay: today + REVIEW_DAYS,
    itemId: added?.id ?? item.id,
  }

  return { ...withItem, commitments: [...(schedule.commitments ?? []), commitment] }
}

/**
 * Commitments whose review date has arrived and which the reserve can no longer hold.
 *
 * The check runs the same projection the dial and the room already run on, so a lapse means
 * the same thing everything else on screen means.
 *
 * Everything due lapses together when the floor is in deficit, rather than working out which
 * single commitment tipped it. Blunt but honest: the model knows the fortnight does not fit,
 * and it does not know which one ask is to blame. Ranking them would be better and is
 * deliberately not built rather than guessed at.
 */
export function lapsed(schedule: Schedule, today: number, params: EngineParams): Commitment[] {
  const due = (schedule.commitments ?? []).filter((commitment) => commitment.reviewDay <= today)
  if (due.length === 0) return []

  const projection = project(schedule.start, toDayInputs(schedule), params)
  if (projection.worstFloor >= DEFICIT_THRESHOLD) return []

  return due
}
