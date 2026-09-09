import type { CalibrationProfile } from '../domain/calibration'
import { DEFAULT_PROFILE } from '../domain/calibration'
import type { EnergyPrediction } from '../domain/predictions'

/**
 * A profile with history, so the demo is not a cold start.
 *
 * `umCrunchWeek` already seeds a real fortnight, and `umBlockLog` seeds the durable log §8b
 * introduced -- but `DEFAULT_PROFILE` still has no resolved predictions, which means the
 * accuracy line reads "not enough data" for the whole demo. This is the fixture that gives
 * §8's published accuracy line something to say on first open.
 *
 * `confirmations` is not seeded here: §8b moved block outcomes off the profile and into
 * `umBlockLog`, behind the `Repository`. Seeding it here would seed a field on its way out.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

const dayAfter = (iso: string, days: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * MS_PER_DAY).toISOString().split('T')[0] ?? iso

/** Predicted and reported, close but never exact. Six resolved is enough for a mean that
 *  reads as measured rather than as a placeholder. */
const SCORED: ReadonlyArray<{ readonly offset: number; readonly predicted: number; readonly reported: number }> = [
  { offset: 0, predicted: 62, reported: 50 },
  { offset: 1, predicted: 55, reported: 50 },
  { offset: 2, predicted: 48, reported: 30 },
  { offset: 3, predicted: 41, reported: 30 },
  { offset: 4, predicted: 37, reported: 30 },
  { offset: 5, predicted: 44, reported: 50 },
]

export function umProfile(anchoredOn: string): CalibrationProfile {
  const predictions: EnergyPrediction[] = SCORED.map((scored) => ({
    forDate: dayAfter(anchoredOn, scored.offset),
    predicted: scored.predicted,
    reported: scored.reported,
  }))

  return { ...DEFAULT_PROFILE, predictions }
}
