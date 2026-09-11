import type { Schedule } from '../optimizer'
import { outcomesFrom, type BlockRecord } from './blockLog'
import { paddingForItem } from './realityCheck'

/**
 * §2.4's correction, attached to the blocks it applies to.
 *
 * `paddingForItem` can say that *your essays* run 1.8x over while your lab reports land on
 * time; `drain` can charge a block its own figure rather than its area's. This is the join
 * between them, and without it the ladder is a number nothing acts on -- the same open loop
 * `engineParams` was written to close, one level further in.
 *
 * A stamp rather than a stored field, for the reason `stampSoftDeadlines` gives about its
 * own: this is a reading of the block log at a moment, not a property of the block. A week
 * saved with one baked in would carry a stale correction for the rest of the fortnight, and
 * every answer given afterwards would be ignored by the very blocks it was about.
 *
 * Absent where no rung has earned a figure, deliberately -- see below.
 */
export function stampEstimateBias(
  schedule: Schedule,
  blockLog: readonly BlockRecord[],
): Schedule {
  const outcomes = outcomesFrom(blockLog)

  return {
    ...schedule,
    items: schedule.items.map((item) => {
      // Hours the student was shown the correction for and accepted. Stamped as an explicit
      // 1 rather than left absent, and the difference is the whole point: absent falls back
      // to the area-wide bias, which is padding. Only a 1 says "this figure is already
      // right" -- without it, taking the app's advice would cost more than ignoring it.
      if (item.paddedHours === true) return { ...item, estimateBias: 1 }

      const bias = paddingForItem(outcomes, item)

      // Left off rather than written as 1. The two mean different things to `drain`: absent
      // falls back to the type-wide bias, which is where a student with no history of this
      // particular work has always been. A stamped 1 would override that with "no
      // correction at all" and quietly undo the area-level learning this sits on top of.
      if (bias === 1) {
        const { estimateBias: _dropped, ...rest } = item
        return rest
      }

      return { ...item, estimateBias: bias }
    }),
  }
}
