import type { ActivityKind, BlockKind, LoadType } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import type { BlockRecord } from './blockLog'

/**
 * Non-urgent gets a deadline anyway.
 *
 * Health, relationships and rest have no due date, which is why they always lose. The
 * codebase already says so: `objective.deadlinePressure` skips every item where
 * `deadlineDay === null`, and its own comment records the consequence -- "undated work has
 * no deadline to be late for and costs nothing". `constraints.violations` defends only
 * deadline-bearing work, and `scheduleEdits.deferItem` clamps undated work to the horizon
 * edge and nothing sooner. Between them, a walk can be put off forever for free.
 *
 * This module gives every event a deadline. Real where one exists, synthetic where none
 * does, so the two compete on the same terms.
 *
 * "The same terms" means *scheduling priority*, and only that: `deadlinePressure` and
 * `neglectPressure` in `optimizer/objective` rank undated work against dated work, and
 * `deferItem` bounds it. It deliberately does NOT mean §6.4's anticipatory-stress drain,
 * which reads `item.deadlineDay` alone and must keep doing so -- a synthetic deadline lands
 * on rest and recovery as readily as on errands, so feeding these into that term would have
 * the model charge a student mental load for an approaching walk. `optimizer/neglect.test.ts`
 * pins that in a test named for it: "does not let a soft deadline create anticipatory
 * stress", because it "would model a student dreading having to relax".
 *
 * Written down here because the sentence above reads, on its own, like the drain is simply
 * missing a case. It is not; the omission is the decision.
 */

/**
 * How long each kind may go before it is overdue, in days.
 *
 * The app's numbers, not the student's. Ruling 20 is explicit that nobody should be made to rank
 * their own work, "because everybody marks everything high and the ranking carries no
 * information once they have". §5.1's user-set floor is a real and separate feature that
 * layers on top of this rather than replacing it.
 */
export const SOFT_DEADLINE_INTERVALS: Record<BlockKind, number> = {
  rest: 1,
  lightExercise: 3,
  hardExercise: 4,
  socialRestorative: 4,
  studyBlock: 5,
  errands: 7,
  socialDraining: 7,
}

/**
 * The kinds whose clock restarts when one is done.
 *
 * Rhythms, as against to-dos. Doing a rest satisfies the need for rest and pushes the next
 * one forward; doing one errand does not make the next errand less due, because there is no
 * "next errand" -- there is a different errand, with its own reason to exist.
 *
 * That distinction is what makes the Rest button self-limiting. Rest's deadline regenerates,
 * so taking rest meets it and moves it forward, and the second rest of the same day has no
 * deadline left to satisfy: it stops earning and becomes pure cost against everything else
 * competing for the same slack.
 */
export const RHYTHM_KINDS: readonly BlockKind[] = [
  'rest',
  'lightExercise',
  'hardExercise',
  'socialRestorative',
]

const intervalFor = (kind: ActivityKind): number =>
  SOFT_DEADLINE_INTERVALS[kind as BlockKind] ?? SOFT_DEADLINE_INTERVALS.errands

/**
 * The deadline an item is actually held to.
 *
 * One function, so nothing downstream has to remember the precedence. A real deadline always
 * wins: it is a fact about the world, and a derived number must never overrule one.
 */
export const effectiveDeadline = (item: ScheduledItem): number | null =>
  item.deadlineDay ?? item.softDeadlineDay ?? null

/**
 * Which blocks the student has confirmed actually happened.
 *
 * `BlockRecord` carries no `kind` -- it holds `type` and `plannedHours` so it can be read
 * without a join, since the week is one jsonb blob -- so the kind is resolved back through
 * the item the record points at.
 *
 * `didnt` is excluded rather than treated as an answer like any other. It is evidence the
 * block did not happen, and crediting it would let a student satisfy the model by admitting
 * they skipped something.
 */
export const confirmedIds = (blockLog: readonly BlockRecord[]): ReadonlySet<string> =>
  new Set(blockLog.filter((entry) => entry.answer !== 'didnt').map((entry) => entry.blockId))

/**
 * The last day each rhythm was confirmed done, or null where it never was.
 *
 * Read from the block log and never from what is merely scheduled. A rest block sitting on
 * Thursday is a plan; a rest block the student said happened is evidence, and only the
 * second may move a deadline -- otherwise the app would congratulate somebody for intending
 * to rest.
 */
function lastConfirmedByKind(
  schedule: Schedule,
  blockLog: readonly BlockRecord[],
): ReadonlyMap<ActivityKind, number> {
  const confirmed = confirmedIds(blockLog)
  const out = new Map<ActivityKind, number>()

  for (const item of schedule.items) {
    if (!confirmed.has(item.id)) continue

    const best = out.get(item.kind)
    if (best === undefined || item.dayIndex > best) out.set(item.kind, item.dayIndex)
  }

  return out
}

/**
 * Where a rhythm's clock starts.
 *
 * `-1` when nothing was ever confirmed: the start of the fortnight, one day before day
 * zero, so the first occurrence is due after exactly one interval.
 *
 * Anchoring "never done" at *today* instead is the tempting version and it is broken: the
 * deadline would be re-derived on every load and walk forward with the calendar, so a
 * rhythm could never actually become overdue. A student who has not seen anyone in nine days
 * would be told they are up to date, which is the exact failure this module exists to end.
 */
const NEVER = -1

const rhythmBase = (kind: ActivityKind, lastConfirmed: ReadonlyMap<ActivityKind, number>): number =>
  lastConfirmed.get(kind) ?? NEVER

/**
 * Every event given a deadline.
 *
 * Four cases, in order:
 *
 * - A real `deadlineDay` wins and no synthetic one is stored. `deadlinePressure` already
 *   charges it, and a second field would double-count.
 * - A `fixed` block is due on its own day. It cannot move, so it is due when it is due --
 *   which is what makes "every event has a deadline" true with no exception carved out.
 * - A block already in the past keeps the day it was due, so history does not re-date
 *   itself every time the app is opened.
 * - Otherwise: the interval for the kind, counted from the block's **own day**, set once and
 *   then left alone.
 *
 * That last clause is the whole feature. If re-stamping pushed the wall forward on every
 * load -- and with the day as the base, every *move* would push it too -- deferring would
 * stay free and nothing would have changed.
 *
 * **Counted from the block's own day, not from today and not from the last confirmed
 * occurrence.** Both of those ignored where the block was actually scheduled, and the result
 * was that most of a real week was born already late. From today, one number covered the
 * whole fortnight: on day 7 every study block anywhere in the week was due on day 12, so
 * everything past day 12 was overdue the moment it was stamped. From the last confirmed
 * occurrence, badminton last played on day 4 with a 3-day interval was "due day 7" even with
 * the next game sitting on day 11. Measured on a real account, fifteen of twenty movable
 * blocks were past their deadline, and `deferItem` refused every one of them -- a deadline
 * behind the block leaves it no later day to search, so Later answered "no room" about a
 * fortnight in which no day was full.
 *
 * The interval asks how long this kind of thing may wait. What it waits from is when it is
 * scheduled.
 *
 * The rhythm signal that the old base carried is not lost, and deliberately did not move
 * here: `missedSoftDeadlines` keeps its own last-confirmed check for a rhythm with *nothing
 * scheduled at all*, which is the case that actually means "you have not exercised in a
 * while". That is a question about the gap between occurrences; this one is about a block.
 */
export function stampSoftDeadlines(schedule: Schedule, today: number): Schedule {
  return {
    ...schedule,
    items: schedule.items.map((item) => {
      if (item.deadlineDay !== null) {
        const { softDeadlineDay: _dropped, ...rest } = item
        return rest
      }

      if (item.fixed) return { ...item, softDeadlineDay: item.dayIndex }

      if (item.dayIndex < today) {
        return { ...item, softDeadlineDay: item.softDeadlineDay ?? item.dayIndex }
      }

      return {
        ...item,
        softDeadlineDay: item.softDeadlineDay ?? item.dayIndex + intervalFor(item.kind),
      }
    }),
  }
}

/** One thing that should have happened by now and has not. */
export interface SoftDeadlineMiss {
  /** The block that is late, or null when the kind has nothing scheduled at all -- which is
   *  the case that matters most, and the one a per-item scan alone would miss entirely. */
  readonly itemId: string | null
  readonly title: string
  readonly kind: ActivityKind
  readonly type: LoadType
  readonly softDeadlineDay: number
  readonly daysLate: number
}

/** What to call a rhythm nobody has scheduled. */
const ABSENT: Record<string, { title: string; type: LoadType }> = {
  rest: { title: 'Stopping', type: 'mental' },
  lightExercise: { title: 'Moving', type: 'physical' },
  hardExercise: { title: 'Training', type: 'physical' },
  socialRestorative: { title: 'Seeing someone', type: 'social' },
}

/**
 * What the fortnight is neglecting, most neglected first.
 *
 * Two populations, and the second is the reason this returns more than a filter over items.
 * A block sitting past its own soft deadline is one kind of miss. A rhythm with *nothing
 * scheduled for it at all* is the other, and it is the one that matters: "you have not seen
 * anyone in nine days" is precisely the case where there is no social block to hang the miss
 * on.
 *
 * A confirmed block is never a miss, however late it sits. It happened.
 *
 * Neither is a block still in the future, even one scheduled well past its own soft
 * deadline. That is a plan running late, not a failure, and reporting it as one meant the
 * app went on telling a student they had not rested in nine days *after* they had booked
 * the rest — which is the app not listening. The objective still charges lateness on those
 * through `neglectPressure`, which is the right place for it: that pulls the block earlier
 * without anybody being told off.
 */
export function missedSoftDeadlines(
  schedule: Schedule,
  today: number,
  blockLog: readonly BlockRecord[],
): readonly SoftDeadlineMiss[] {
  const confirmed = confirmedIds(blockLog)
  const lastConfirmed = lastConfirmedByKind(schedule, blockLog)
  const misses: SoftDeadlineMiss[] = []

  for (const item of schedule.items) {
    if (confirmed.has(item.id)) continue
    if (item.softDeadlineDay === undefined) continue
    // Still ahead: a plan, not a failure. See the note above.
    if (item.dayIndex >= today) continue

    const daysLate = today - item.softDeadlineDay
    if (daysLate <= 0) continue

    misses.push({
      itemId: item.id,
      title: item.title,
      kind: item.kind,
      type: item.type,
      softDeadlineDay: item.softDeadlineDay,
      daysLate,
    })
  }

  for (const kind of RHYTHM_KINDS) {
    const scheduled = schedule.items.some(
      (item) => item.kind === kind && item.dayIndex >= today && !confirmed.has(item.id),
    )
    if (scheduled) continue

    const due = rhythmBase(kind, lastConfirmed) + intervalFor(kind)
    const daysLate = today - due
    if (daysLate <= 0) continue

    const naming = ABSENT[kind]
    if (naming === undefined) continue

    misses.push({
      itemId: null,
      title: naming.title,
      kind,
      type: naming.type,
      softDeadlineDay: due,
      daysLate,
    })
  }

  return misses.sort((a, b) => b.daysLate - a.daysLate)
}
