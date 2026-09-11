import type { ActivityKind, LoadType } from '../engine'
import type { EnergyPrediction } from './predictions'

/** One block, as planned and as it actually went. §7.9's two taps produce these, and §2.4
 *  has no other source. */
export interface BlockOutcome {
  readonly type: LoadType
  readonly plannedHours: number
  readonly actualHours: number
  /**
   * What the block was, for the two narrower rungs of §2.4's ladder.
   *
   * Both optional: a record written before they were kept, or by a path that never had
   * them, is still evidence at the rungs that do not need them. `paddingForItem` reads them
   * and falls through when they are absent, which is the same thing it does when a bucket
   * is simply too thin.
   */
  readonly kind?: ActivityKind
  readonly title?: string
}

/**
 * §7's calibration profile, after Task 17.
 *
 * This used to carry `mode`, `focus`, `semesterBreak`, `peakStartHour`, `painted`,
 * `modeChosen` and `calibratedDays` -- an audit found every one of them decorative: `mode`
 * and `semesterBreak` fed no code path, `focus` and `peakStartHour` fed one printed sentence
 * each on a screen nothing routed to any more, and `calibratedDays`/`modeChosen`/`painted`
 * fed only their own progress bar. `confirmations` and `confirmedItemIds` went the same way
 * once every reader of them was pointed at the durable block log instead (§8b) -- the log,
 * not the profile, is now the only source `paramsFor` and the "already asked" checks read.
 *
 * What is left is the one thing something still reads: §8.1's scored energy predictions.
 */
export interface CalibrationProfile {
  /** §8.1's scored claim: two-day energy predictions and what was actually reported. Kept
   *  here because it is a record about this student, not this week. */
  readonly predictions: readonly EnergyPrediction[]
}

/**
 * §7.7: no cold start.
 *
 * A population default that produces a working app on first open, not a placeholder waiting
 * to be filled in. Nothing in the app is gated behind calibration.
 */
export const DEFAULT_PROFILE: CalibrationProfile = {
  predictions: [],
}
