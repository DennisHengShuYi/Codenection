import type { EnergyPrediction, PredictionBasis } from './predictions'

/**
 * Enough attributable samples to call something this student's parameter rather than a run
 * of luck. Deliberately the same figure and the same reasoning as `realityCheck.MIN_SAMPLES`.
 *
 * Counted over *attributable* samples, not over resolved predictions: a fortnight of weeks
 * the learner had to discard has told it nothing, however many of them there were.
 */
export const MIN_SAMPLES = 3

/** How much of the gap between the current scale and what one sample implies is taken.
 *  Low, because this is meant to be a nudge that accumulates, not a lurch on one bad week. */
const SMOOTHING = 0.2

/**
 * Bounds on the correction, mirroring `realityCheck.MAX_PADDING`'s discipline.
 *
 * An unbounded multiplier from a couple of disastrous fortnights would put a student's
 * projection into fiction, which is the same failure the padding ceiling exists to prevent,
 * arriving from a different direction.
 */
export const MIN_SCALE = 0.5
export const MAX_SCALE = 2

/**
 * Below this, the coefficient could not have moved the claim much either way, and dividing
 * a residual by it invents an enormous correction out of a week that said nothing. A week
 * with no rest blocks, or one spent below `sleepBaselineHours` where the engine's own
 * `max(0, ...)` floor flattens the credit, both land here.
 */
const MIN_SENSITIVITY = 0.5

/**
 * How lopsided a sample must be before it counts as being about one coefficient.
 *
 * `kSleep` and `kRest` are confounded exactly when both move the claim. The residual could
 * belong to either, and splitting it makes the two chase each other week after week -- so a
 * sample where both moved is discarded rather than apportioned.
 */
const DOMINANCE = 0.8

/**
 * The coefficients a scalar prediction can honestly identify.
 *
 * `typeIntensity` is deliberately absent: it is four numbers, and one scalar residual cannot
 * separate them. So is `socialFloorHoursPerDay`, which is a threshold -- its derivative is
 * zero everywhere except a cliff, so a finite difference reads either nothing or nonsense.
 * Both stay population constants, and that is an answer rather than an omission.
 */
export const LEARNED = ['sleep', 'rest', 'socialContact', 'isolation'] as const

export type Learned = (typeof LEARNED)[number]

export type RecoveryScales = Readonly<Record<Learned, number>>

/** What the app assumes about a student it has never seen: exactly the population default. */
export const NEUTRAL_SCALES: RecoveryScales = {
  sleep: 1,
  rest: 1,
  socialContact: 1,
  isolation: 1,
}

/** How far each coefficient moved this particular claim. Absent fields read as zero, which
 *  is what a prediction recorded before they existed honestly says about them. */
const sensitivitiesOf = (basis: PredictionBasis): Readonly<Record<Learned, number>> => ({
  sleep: basis.sleepScaleSensitivity,
  rest: basis.restScaleSensitivity,
  socialContact: basis.socialScaleSensitivity ?? 0,
  isolation: basis.isolationScaleSensitivity ?? 0,
})

const clamp = (value: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))

const wellFormed = (basis: PredictionBasis | undefined): basis is PredictionBasis =>
  basis !== undefined &&
  Number.isFinite(basis.sleepScaleSensitivity) &&
  Number.isFinite(basis.restScaleSensitivity)

/**
 * Which single coefficient this sample is evidence about, or null when it is evidence about
 * none of them.
 *
 * Generalised from the two-way split to a field of four, and the rule is unchanged: one
 * coefficient must carry nearly all of the movement. Two that both moved are confounded --
 * the residual could belong to either, and splitting it makes them chase each other week
 * after week -- so the sample is discarded rather than apportioned. With four candidates
 * that happens more often, which is the honest cost of learning more things from one number.
 */
function attribute(basis: PredictionBasis): Learned | null {
  const magnitudes = sensitivitiesOf(basis)
  const total = LEARNED.reduce((sum, name) => sum + Math.abs(magnitudes[name]), 0)
  if (total === 0) return null

  const dominant = LEARNED.find((name) => Math.abs(magnitudes[name]) / total >= DOMINANCE)
  if (dominant === undefined) return null

  // Dominant, but of a movement too small to divide a residual by without inventing an
  // enormous correction out of a fortnight that said nothing.
  return Math.abs(magnitudes[dominant]) >= MIN_SENSITIVITY ? dominant : null
}

/**
 * Multipliers on the population `kSleep` and `kRest`, learned from prediction error.
 *
 * The app has always predicted energy 48 hours out and resolved it against what the student
 * reported; until now that error was measured, published as a scoreboard figure, and thrown
 * away. This is the loop closed -- if the app runs consistently pessimistic on days
 * following heavy sleep, that student's `kSleep` is higher than the default, and this nudges
 * toward whatever would have predicted correctly.
 *
 * Scalars rather than per-type. One scalar prediction cannot separate four load types, and
 * returning four numbers from evidence that supports one would be three numbers' worth of
 * invented precision.
 *
 * Every guard here fails toward doing nothing, which is the right direction for a parameter
 * that shapes every projection the student sees: unattributable samples are discarded, weak
 * sensitivities are discarded, malformed rows are skipped rather than thrown on -- settings
 * come back from storage unvalidated, and one corrupt row must not take down the room -- and
 * below `MIN_SAMPLES` the answer is exactly the population default.
 */
export function recoveryScales(predictions: readonly EnergyPrediction[]): RecoveryScales {
  const scale: Record<Learned, number> = { ...NEUTRAL_SCALES }
  const seen: Record<Learned, number> = { sleep: 0, rest: 0, socialContact: 0, isolation: 0 }

  // Sorted by date, and copied first: `predictions` belongs to the profile the app writes
  // back. Resolutions can arrive out of order, and an answer that depended on array order
  // would drift for no reason the student could ever see.
  const ordered = [...predictions].sort((a, b) => a.forDate.localeCompare(b.forDate))

  for (const prediction of ordered) {
    if (prediction.reported === null) continue
    if (!wellFormed(prediction.basis)) continue

    const which = attribute(prediction.basis)
    if (which === null) continue

    const sensitivity = sensitivitiesOf(prediction.basis)[which]

    // Positive when the app under-predicted: the student had more left than it claimed, so
    // whatever restores them restores them more than the default says.
    const residual = prediction.reported - prediction.predicted

    // Clamped per sample as well as at the end. Without this, one catastrophic week
    // implies a scale of 40 and consumes the entire smoothing budget by itself.
    const implied = clamp(1 + residual / sensitivity)

    scale[which] += SMOOTHING * (implied - scale[which])
    seen[which] += 1
  }

  return Object.fromEntries(
    LEARNED.map((name) => [name, seen[name] >= MIN_SAMPLES ? clamp(scale[name]) : 1]),
  ) as RecoveryScales
}
