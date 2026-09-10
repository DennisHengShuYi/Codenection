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
 * `move` is not in this union. It was specified and wired once, but nothing in this plan
 * ever built a day/time picker for it, so "Move" behaved identically to "Later" with no way
 * to actually choose where a block went -- a silent stub, caught at the combined 12+13
 * review. Dropped rather than left indistinguishable from a real action; reinstate it once
 * a picker exists to back it.
 */
export type BlockAction = 'done' | 'later' | 'cantStart' | 'confirm' | 'undo' | 'didRest'

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
    if (item.protectedRest && !alreadyAsked) return ['didRest']

    return alreadyAsked ? ['undo'] : ['confirm']
  }

  // A future or today protected-rest block has nothing to be "answered" about yet -- it
  // keeps asking whether it happened.
  if (item.protectedRest) return ['didRest']

  // Fixed means classes, shifts and hard deadlines. The optimizer may not move them, so
  // offering Move here would be the interface promising something the model refuses.
  if (item.fixed) return ['done']

  return ['done', 'later', 'cantStart']
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
    microStart: isStuck(item, 0, daysWaiting) ? firstAction(item) : null,
    recordedAnswer: actions.includes('undo')
      ? (blockLog.find((record) => record.blockId === item.id)?.answer ?? null)
      : null,
  }
}
