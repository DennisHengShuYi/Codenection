import { answeredIds, type BlockAnswer, type BlockRecord } from '../../domain/blockLog'
import { firstAction, isStuck, type MicroStart } from '../../domain/microStart'
import type { Schedule, ScheduledItem } from '../../optimizer'

/**
 * §5: what a block offers, derived from the block.
 *
 * Done, Later, micro-start and confirmation were four entries on a feature list. They are
 * four *states of a block*, and collapsing them here is what lets the week screen carry all
 * of them without a row of buttons that are mostly wrong for whatever block was tapped.
 *
 * `move` is not in this union, and now genuinely does not need to be. It was specified and
 * wired once with no day/time picker behind it, so "Move" behaved identically to "Later"
 * with no way to actually choose where a block went -- a silent stub, dropped rather than
 * left indistinguishable from a real action. `edit` below is the picker arriving: a block's
 * day, hour and length are all changeable now, which is what `move` was reaching for and
 * more.
 */
export type BlockAction =
  | 'done'
  | 'later'
  | 'cantStart'
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
 */
const MANUAL: readonly BlockAction[] = ['edit', 'remove']

export interface BlockSheetModel {
  readonly item: ScheduledItem
  readonly actions: readonly BlockAction[]
  readonly microStart: MicroStart | null
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
): readonly BlockAction[] => {
  if (item.dayIndex < today) {
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

  // A future or today protected-rest block has nothing to be "answered" about yet -- it
  // keeps asking whether it happened.
  if (item.protectedRest) return ['didRest', ...MANUAL]

  // Fixed means classes, shifts and hard deadlines. The optimizer may not move them, so
  // there is no Later to offer -- deferring is a request the model would refuse. Editing one
  // by hand is a different act entirely: not asking the solver to move it, but telling the
  // app the class itself changed.
  if (item.fixed) return ['done', ...MANUAL]

  return ['done', 'later', 'cantStart', ...MANUAL]
}

export function blockSheet({
  schedule,
  itemId,
  today,
  blockLog = [],
}: {
  readonly schedule: Schedule
  readonly itemId: string
  readonly today: number
  readonly blockLog?: readonly BlockRecord[]
}): BlockSheetModel | null {
  const item = schedule.items.find((candidate) => candidate.id === itemId)
  // A stale id closes the sheet rather than throwing. It happens for real: complete a block
  // and the id in the open view no longer exists.
  if (item === undefined) return null

  // How long it has been *waiting*, not how long until it is due. `item.dayIndex - today` is
  // the wait *ahead* of a task, and using it reported a fortnight-out errand as sixteen days
  // overdue -- the same bug roomModel already had to fix.
  const daysWaiting = Math.max(0, today - item.dayIndex)
  const actions = actionsFor(item, blockLog, today)

  return {
    item,
    actions,
    microStart: isStuck(item, daysWaiting) ? firstAction(item) : null,
    recordedAnswer: actions.includes('undo')
      ? (blockLog.find((record) => record.blockId === item.id)?.answer ?? null)
      : null,
  }
}
