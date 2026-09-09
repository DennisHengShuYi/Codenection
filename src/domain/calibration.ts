import type { LoadType } from '../engine'

/** §7.1's four, and the failure mode each one is watched for. */
export type Mode = 'studying' | 'working' | 'both' | 'between'

/** §7.5: ask relative, not absolute. "How long before you drift", not "how many hours can
 *  you focus" -- buckets, never a typed number. */
export type FocusBucket = 'under30' | 'about1h' | 'couple' | 'longer'

/** One block, as planned and as it actually went. §7.9's two taps produce these, and §2.4
 *  has no other source. */
export interface BlockOutcome {
  readonly type: LoadType
  readonly plannedHours: number
  readonly actualHours: number
}

export interface CalibrationProfile {
  readonly mode: Mode
  /** §7.1: a toggle on top of mode, not a fifth option. In low-structure states the
   *  optimizer switches from flattening peaks to defending a floor. */
  readonly semesterBreak: boolean
  readonly focus: FocusBucket
  readonly sleepBaselineHours: number
  /** Where study blocks cluster, or null when nothing has been painted yet. */
  readonly peakStartHour: number | null
  readonly confirmations: readonly BlockOutcome[]
  readonly calibratedDays: number
  /** Whether the student actually chose, as opposed to inheriting the default. The meter
   *  should not credit progress nobody made. */
  readonly modeChosen: boolean
  readonly painted: boolean
}

/**
 * §7.7: no cold start.
 *
 * These are population defaults that produce a working app on first open, not placeholders
 * waiting to be filled in. Nothing in the app is gated behind calibration -- the room, the
 * dial and the projection all work from here.
 */
export const DEFAULT_PROFILE: CalibrationProfile = {
  mode: 'studying',
  semesterBreak: false,
  focus: 'about1h',
  sleepBaselineHours: 7,
  peakStartHour: null,
  confirmations: [],
  calibratedDays: 0,
  modeChosen: false,
  painted: false,
}

const BUCKET_MINUTES: Record<FocusBucket, number> = {
  under30: 25,
  about1h: 55,
  couple: 110,
  longer: 180,
}

export function focusMinutes(bucket: FocusBucket): number {
  return BUCKET_MINUTES[bucket]
}

/** Enough confirmations for the model to have learned something worth showing. */
const CONFIRMATIONS_FOR_FULL = 20

/**
 * §7.7's calibration meter: setup reads as progress, never as a gate.
 *
 * It starts above zero deliberately. A student who has opened the app already has a working
 * model behind them, and a bar sitting at nothing would tell them the opposite -- which is
 * exactly the "setup as a wall" feeling §7.7 exists to avoid.
 */
export function calibrationProgress(profile: CalibrationProfile): number {
  const base = 0.2
  const mode = profile.modeChosen ? 0.2 : 0
  const painted = profile.painted ? 0.3 : 0
  const confirmed =
    0.3 * Math.min(1, profile.confirmations.length / CONFIRMATIONS_FOR_FULL)

  return Math.min(1, base + mode + painted + confirmed)
}
