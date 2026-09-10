import type { BlockAnswer, BlockRecord } from '../domain/blockLog'
import type { LoadType } from '../engine'

/**
 * A block log with history, so Reality Check has samples for every kind of work before a
 * student answers anything themselves.
 *
 * §8b moved outcomes off the profile and into this durable log, so this is the fixture that
 * makes `paddingFor` speak now -- `umProfile` no longer carries `confirmations` at all.
 *
 * The bias is deliberately an *under*-estimate, and deliberately worst on `mental`: students
 * overrun study and writing more than anything else, and a fixture where every block took
 * exactly as long as planned would make §2.4 look like it does nothing. `longer` is the
 * four-way answer that means "took more time than planned" -- see `ANSWER_FACTOR`.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

const answeredAt = (anchoredOn: string, dayIndex: number): number =>
  Date.parse(`${anchoredOn}T20:00:00Z`) + dayIndex * MS_PER_DAY

/** One kind of work's answered blocks, spread across the days already behind a fresh
 *  anchor -- so `checkedInDays` sees answered days rather than silence once time passes. */
const block = (
  blockId: string,
  type: LoadType,
  plannedHours: number,
  dayIndex: number,
  answer: BlockAnswer,
): Omit<BlockRecord, 'answeredAt'> => ({ blockId, type, plannedHours, dayIndex, answer })

/**
 * A real student's first week: two lectures' worth of essays and lab reports that ran long,
 * a gym habit and a weekend shift that mostly went to plan, and errands squeezed in between.
 */
const RECORDS: ReadonlyArray<Omit<BlockRecord, 'answeredAt'>> = [
  // Study and writing: the worst under-estimator, all `longer`.
  block('essay-draft', 'mental', 3, 0, 'longer'),
  block('lab-report', 'mental', 2, 1, 'longer'),
  block('reading-week3', 'mental', 2, 2, 'longer'),
  block('problem-set', 'mental', 1.5, 3, 'longer'),
  block('fyp-chapter', 'mental', 3, 4, 'longer'),
  // Physical: mild overrun -- a workout that ran a little over, otherwise on plan.
  block('gym-monday', 'physical', 1, 0, 'right'),
  block('gym-wednesday', 'physical', 1, 2, 'longer'),
  block('badminton', 'physical', 1.5, 4, 'right'),
  block('run-weekend', 'physical', 1, 5, 'right'),
  // Social: seeing people usually runs a little long once it starts.
  block('lunch-friends', 'social', 1.5, 1, 'longer'),
  block('study-group', 'social', 2, 3, 'right'),
  block('dinner-out', 'social', 1.5, 4, 'longer'),
  block('call-family', 'social', 0.5, 5, 'right'),
  // Errands: life admin, mostly quick, occasionally drags.
  block('groceries', 'errands', 1, 0, 'right'),
  block('laundry', 'errands', 1, 2, 'right'),
  block('bank-errand', 'errands', 0.5, 3, 'longer'),
  block('parcel-pickup', 'errands', 0.5, 5, 'right'),
]

export function umBlockLog(anchoredOn: string): BlockRecord[] {
  return RECORDS.map((record) => ({ ...record, answeredAt: answeredAt(anchoredOn, record.dayIndex) }))
}
