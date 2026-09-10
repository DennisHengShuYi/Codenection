import type { ParsedItem } from '../ai'
import { DEFICIT_THRESHOLD, project, type EngineParams } from '../engine'
import { toDayInputs, type Commitment, type Schedule } from '../optimizer'
import { addItems } from './addItems'
import { checkedInDays, type BlockRecord } from './blockLog'

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
 * the same thing everything else on screen means -- including §6.5's missing-data
 * pessimism: a past day the student never answered for reads as a day they went quiet, and
 * this must weigh that exactly as heavily as the room does. `blockLog` defaults to empty
 * rather than being required, mirroring `roomModel`'s own default -- an empty log is a
 * real, honest state (nothing has been answered yet), not a placeholder to skip past.
 *
 * Everything due lapses together when the floor is in deficit, rather than working out which
 * single commitment tipped it. Blunt but honest: the model knows the fortnight does not fit,
 * and it does not know which one ask is to blame. Ranking them would be better and is
 * deliberately not built rather than guessed at.
 */
export function lapsed(
  schedule: Schedule,
  today: number,
  params: EngineParams,
  blockLog: readonly BlockRecord[] = [],
): Commitment[] {
  const due = (schedule.commitments ?? []).filter((commitment) => commitment.reviewDay <= today)
  if (due.length === 0) return []

  const checkedIn = checkedInDays(blockLog, today, schedule.horizonDays)
  const projection = project(schedule.start, toDayInputs(schedule, checkedIn), params)
  if (projection.worstFloor >= DEFICIT_THRESHOLD) return []

  return due
}

/**
 * Drops the acceptance a removed block was standing for.
 *
 * A `Commitment` points at the item `accept` created for it, and 2.3's whole mechanism --
 * a review date that lapses on its own -- reads that item through the projection. A
 * commitment left pointing at a block that no longer exists would go on being weighed and
 * go on being offered for withdrawal, for something that is not in the week any more.
 *
 * Lives here rather than in `scheduleEdits` because what a commitment is, and when it stops
 * being one, is this module's question; `removeItem` only needs to ask it.
 *
 * Returns the identical object when nothing matched, so a caller can tell a real change
 * from a no-op without comparing contents.
 */
export function dropCommitmentFor(schedule: Schedule, itemId: string): Schedule {
  const commitments = schedule.commitments
  if (commitments === undefined) return schedule

  const kept = commitments.filter((commitment) => commitment.itemId !== itemId)

  return kept.length === commitments.length ? schedule : { ...schedule, commitments: kept }
}
