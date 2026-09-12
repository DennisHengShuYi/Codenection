import { answeredIds, type BlockAnswer, type BlockRecord } from '../../domain/blockLog'
import { hasHappened } from '../../domain/dayBlocks'
import type { Schedule, ScheduledItem } from '../../optimizer'

/**
 * §5: what a block offers, derived from the block.
 *
 * Later, micro-start and confirmation were entries on a feature list. They are *states of a
 * block*, and collapsing them here is what lets the week screen carry all of them without a
 * row of buttons that are mostly wrong for whatever block was tapped.
 *
 * `done` is not in this union and was removed rather than left. It called `completeItem`,
 * which is `withoutItem` -- the same deletion `remove` performs, with no confirmation and
 * no record written anywhere. Two buttons doing one thing, one of them sounding like
 * progress and behaving like a delete. If finishing early is to mean something it has to be
 * logged, and until it is, Remove is the honest name for what that button did.
 *
 * `move` is not in this union, and now genuinely does not need to be. It was specified and
 * wired once with no day/time picker behind it, so "Move" behaved identically to "Later"
 * with no way to actually choose where a block went -- a silent stub, dropped rather than
 * left indistinguishable from a real action. `edit` below is the picker arriving: a block's
 * day, hour and length are all changeable now, which is what `move` was reaching for and
 * more.
 */
export type BlockAction =
  | 'later'
  | 'microStart'
  | 'confirm'
  | 'undo'
  | 'didRest'
  | 'edit'
  | 'remove'

/**
 * Offered on every block, whatever state it is in.
 *
 * Deliberately unconditional, where every other action here is conditional. The rest of this
 * model answers "what can be said ABOUT this block", and that genuinely depends on whether
 * it has happened yet. These two change what the block IS, and a student correcting their
 * own week -- a cancelled class, a tutorial that turned out to be two hours -- is right to
 * be able to do that on a fixed block, on protected rest, and on last Tuesday. The form says
 * what each of those costs; it does not refuse.
 *
 * `microStart` joins them for that reason and one more. §4.1's manual trigger used to be
 * hidden on fixed blocks, on protected rest and on anything past -- which is to say it was
 * hidden on a good share of what a student is actually stuck on: the lab report for
 * Tuesday's fixed lab, the errand that was due last week. What made hiding it feel safe was
 * §5.1's protected recovery, and that protection now lives where it belongs -- in what the
 * rest and sleep chains SAY (see `ruleLadder`) -- rather than in a missing button.
 */
const MANUAL: readonly BlockAction[] = ['microStart', 'edit', 'remove']

export interface BlockSheetModel {
  readonly item: ScheduledItem
  readonly actions: readonly BlockAction[]
  /**
   * What the student said, when `actions` is `['undo']`. Null otherwise.
   *
   * §5's table calls the past-and-confirmed case "what you recorded, and Undo". Since
   * `Repository.recordBlockAnswer` only upserts -- there is no operation to retract an
   * answer -- an "Undo" button here would be exactly the silent stub `move` was: it would
   * produce no visible change and a student could not tell whether it worked. Showing what
   * was actually said is honest instead, and needs no new storage capability.
   */
  readonly recordedAnswer: BlockAnswer | null
}

const actionsFor = (
  item: ScheduledItem,
  blockLog: readonly BlockRecord[],
  today: number,
  nowHour: number,
): readonly BlockAction[] => {
  // By the clock, not the calendar. This read `dayIndex < today`, so a block that finished
  // at eleven could not be answered until midnight -- while the today card on the same
  // screen had already asked about it, because `hasHappened` is what that card has always
  // used. §8b② is explicit that the two must not ask different questions.
  if (hasHappened(item, today, nowHour)) {
    // §8b/Task 17: the durable log is the only record of what has already been answered.
    // Mirrors roomModel.ts and scheduleView.ts.
    const alreadyAsked = answeredIds(blockLog).includes(item.id)

    // Rest keeps its own question -- "did it happen", not "how did it go" -- but only while
    // unanswered. Once answered, confirm/undo is the only axis this model has for exposing
    // that back to the student, and letting protectedRest short-circuit past it would make
    // an answered nap and a never-touched one read identically: asked cold again, with no
    // way to undo, while every other block kind on the same screen does offer that.
    if (item.protectedRest && !alreadyAsked) return ['didRest', ...MANUAL]

    return alreadyAsked ? ['undo', ...MANUAL] : ['confirm', ...MANUAL]
  }

  // Nothing to answer about a block that has not happened. "Did you rest" on a nap still
  // three days out is a question with no true answer, and offering one invites an entry in
  // the log about an evening nobody has lived -- which `softDeadlines` would then read as a
  // rhythm satisfied. Past rest keeps the question, above.
  //
  // Fixed means classes, shifts and hard deadlines, and protected rest is fixed by
  // construction. The optimizer may not move them, so there is no Later to offer --
  // deferring is a request the model would refuse. Editing one by hand is a different act
  // entirely: not asking the solver to move it, but telling the app the class itself
  // changed.
  if (item.protectedRest || item.fixed) return [...MANUAL]

  return ['later', ...MANUAL]
}

export function blockSheet({
  schedule,
  itemId,
  today,
  nowHour,
  blockLog = [],
}: {
  readonly schedule: Schedule
  readonly itemId: string
  readonly today: number
  /** Required, not defaulted. `checkIn.ts` wrote down why when it took the same argument:
   *  "an optional clock is one a caller forgets to pass", and forgetting it here would put
   *  the sheet back to asking about blocks that have not happened. */
  readonly nowHour: number
  readonly blockLog?: readonly BlockRecord[]
}): BlockSheetModel | null {
  const item = schedule.items.find((candidate) => candidate.id === itemId)
  // A stale id closes the sheet rather than throwing. It happens for real: complete a block
  // and the id in the open view no longer exists.
  if (item === undefined) return null

  const actions = actionsFor(item, blockLog, today, nowHour)

  return {
    item,
    actions,
    recordedAnswer: actions.includes('undo')
      ? (blockLog.find((record) => record.blockId === item.id)?.answer ?? null)
      : null,
  }
}
