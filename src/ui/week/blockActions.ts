import { answeredIds, type BlockRecord } from '../../domain/blockLog'
import type { CalibrationProfile } from '../../domain/calibration'
import { firstAction, isStuck, type MicroStart } from '../../domain/microStart'
import type { Schedule, ScheduledItem } from '../../optimizer'

/**
 * §5: what a block offers, derived from the block.
 *
 * Done, Later, Move, micro-start and confirmation were five entries on a feature list. They
 * are five *states of a block*, and collapsing them here is what lets the week screen carry
 * all of them without a row of five buttons that are mostly wrong for whatever block was
 * tapped.
 */
export type BlockAction = 'done' | 'later' | 'move' | 'cantStart' | 'confirm' | 'undo' | 'didRest'

export interface BlockSheetModel {
  readonly item: ScheduledItem
  readonly actions: readonly BlockAction[]
  readonly microStart: MicroStart | null
}

const actionsFor = (
  item: ScheduledItem,
  profile: CalibrationProfile,
  blockLog: readonly BlockRecord[],
  today: number,
): readonly BlockAction[] => {
  // Rest is asked about rather than ticked off: §5.2's log wants to know whether it helped,
  // and "Done" on a nap answers a different question. Protected rest is checked first, ahead
  // of the past-block branch below, because "did it happen" is the specific question that
  // matters for rest -- a generic confirm/undo would ask the wrong thing about a nap that
  // already passed and was never answered.
  if (item.protectedRest) return ['didRest']

  if (item.dayIndex < today) {
    // §8b: a block counts as already answered if the durable log says so, or if the
    // profile's own (soon-to-be-retired) record does. Mirrors roomModel.ts and
    // scheduleView.ts verbatim -- nothing writes a BlockRecord in the running app yet, so
    // dropping the profile side would read as though every already-confirmed block had
    // gone back to being unconfirmed.
    const alreadyAsked =
      answeredIds(blockLog).includes(item.id) || profile.confirmedItemIds.includes(item.id)
    return alreadyAsked ? ['undo'] : ['confirm']
  }

  // Fixed means classes, shifts and hard deadlines. The optimizer may not move them, so
  // offering Move here would be the interface promising something the model refuses.
  if (item.fixed) return ['done']

  return ['done', 'later', 'move', 'cantStart']
}

export function blockSheet({
  schedule,
  profile,
  itemId,
  today,
  blockLog = [],
}: {
  readonly schedule: Schedule
  readonly profile: CalibrationProfile
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

  return {
    item,
    actions: actionsFor(item, profile, blockLog, today),
    microStart: isStuck(item, 0, daysWaiting) ? firstAction(item) : null,
  }
}
