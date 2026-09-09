import type { BlockOutcome } from './calibration'
import type { LoadType } from '../engine'

/**
 * §8b: what was scheduled, and what became of it.
 *
 * Written by the today card and by the Telegram bot; read by `paramsFor` and by
 * `toDayInputs`; rendered by nothing. It exists because three separate defects shared one
 * missing piece -- a durable record of block outcomes that both writers could reach and
 * something could actually read.
 *
 * The record carries `type` and `plannedHours` itself rather than looking them up, because a
 * week is persisted as one jsonb blob and there are no rows for `blockId` to join against.
 * That is precisely why the existing `block_answers` table can be read by nothing: it stores
 * the answer alone, which is not enough to compute an outcome.
 */
export type BlockAnswer = 'didnt' | 'less' | 'right' | 'longer'

/**
 * One four-way answer replaces `yes/partly/no` x `harder/same/easier`.
 *
 * Those were two different questions multiplied together as though they were one axis:
 * completion and duration. Reality Check consumes only duration. The commonest study
 * outcome -- three hours sat down, half the essay done -- recorded as `partly` and told the
 * app the student works less than they do. It is `longer`: the essay is bigger than three
 * hours.
 */
export const ANSWER_FACTOR: Record<BlockAnswer, number> = {
  didnt: 0,
  less: 0.75,
  right: 1,
  longer: 1.5,
}

export interface BlockRecord {
  readonly blockId: string
  readonly type: LoadType
  readonly plannedHours: number
  readonly dayIndex: number
  readonly answer: BlockAnswer
  readonly answeredAt: number
}

export function outcomesFrom(log: readonly BlockRecord[]): readonly BlockOutcome[] {
  return log.map((entry) => ({
    type: entry.type,
    plannedHours: entry.plannedHours,
    actualHours: Math.round(entry.plannedHours * ANSWER_FACTOR[entry.answer] * 100) / 100,
  }))
}

export function answeredIds(log: readonly BlockRecord[]): readonly string[] {
  return log.map((entry) => entry.blockId)
}

/**
 * §6.5's signal, at last.
 *
 * A past day carrying no answer is a day the student went quiet, and non-check-in
 * correlates with bad weeks -- so a model that gets more worried is behaving correctly.
 *
 * Days still ahead are `true`, and that is not a convenience. A future day has nothing to
 * check in about; marking the horizon as missed compounds to 1 + 0.08 x 21 = 2.68x
 * pessimism on every projection, permanently, which is catastrophically wrong rather than
 * appropriately cautious. Today counts as checked in too: the day is not over.
 */
export function checkedInDays(
  log: readonly BlockRecord[],
  today: number,
  horizonDays: number,
): readonly boolean[] {
  const answered = new Set(log.map((entry) => entry.dayIndex))

  return Array.from({ length: horizonDays }, (_, day) => day >= today || answered.has(day))
}
