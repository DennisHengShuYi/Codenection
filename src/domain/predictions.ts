import { overallReserve, project, type EngineParams, type Reserves } from '../engine'
import { toDayInputs, type Schedule } from '../optimizer'
import { checkedInDays, type BlockRecord } from './blockLog'
import { dateFor, todayIndex } from './calendar'

/**
 * §8.1's falsifiable claim: tomorrow's reported energy, 24 to 48 hours out.
 *
 * Keyed on a **real date**, not a day index. A prediction about "day 2" is meaningless the
 * moment the app is closed and reopened — day 2 is a different real day every session, so
 * such a record could never be checked against anything. That is why this needs the date
 * anchor, and why the scoring machinery sat inert until it existed.
 *
 * `reported` is null until the student says how that day actually went. The gap is the whole
 * point: a prediction nobody has checked is not evidence of anything.
 */
/**
 * What the claim assumed, and how far it would move if a recovery coefficient did.
 *
 * Captured at prediction time because the week that produced the claim is gone before the
 * claim resolves: `withSleep` rewrites `sleepByDay` in place, so a record holding only a
 * number could never afterwards be attributed to anything. This is the difference between
 * measuring the app's error and being able to learn from it.
 *
 * The sensitivities are with respect to a *scale* on the coefficient rather than the
 * coefficient itself, which makes them dimensionless and means the update rule needs no
 * knowledge of what the population defaults happen to be.
 *
 * Four plain numbers. No functions, no dates, nothing that does not survive
 * `JSON.stringify` -- this persists inside `StoredSettings.calibration`, which both adapters
 * store as one opaque blob.
 */
export interface PredictionBasis {
  /** Mean nightly sleep over the days the claim spans. */
  readonly assumedSleepHours: number
  /** Total rest-block hours over the same span. */
  readonly assumedRestHours: number
  /** How far `predicted` moves per unit of scale applied to `kSleep`. */
  readonly sleepScaleSensitivity: number
  /** The same, for `kRest`. */
  readonly restScaleSensitivity: number
  /**
   * The same, for `kSocialContact` and `isolationDrainPerDay`.
   *
   * Optional because predictions recorded before these existed carry neither, and must keep
   * teaching what they can about sleep and rest rather than being discarded wholesale.
   *
   * These two are the only other coefficients a scalar prediction can honestly identify.
   * `typeIntensity` is four numbers and one scalar cannot separate them;
   * `socialFloorHoursPerDay` is a threshold whose derivative is zero everywhere except a
   * cliff, so a finite difference reads either nothing or nonsense. Both are left as
   * population constants deliberately.
   */
  readonly socialScaleSensitivity?: number
  readonly isolationScaleSensitivity?: number
}

export interface EnergyPrediction {
  /** YYYY-MM-DD, the day this is a claim about. */
  readonly forDate: string
  readonly predicted: number
  readonly reported: number | null
  /**
   * Absent on every prediction recorded before this existed.
   *
   * Optional rather than migrated: an old record still scores in `meanAbsoluteError` and
   * still displays, and the learner simply skips it. The same move `calibration?` itself
   * made in `StoredSettings` -- no adapter change, no version field, no migration pass.
   */
  readonly basis?: PredictionBasis
}

/**
 * §8.1's horizon. Two days out, because these **resolve regardless of whether the student
 * intervenes** — which is exactly what the 21-day projection cannot do, and why that one is a
 * decision aid rather than a validated claim (§8.2).
 */
// Not exported: nothing outside this module has ever read it, and `predictionsAfter` is
// where the horizon is applied.
const PREDICTION_HORIZON_DAYS = 2

/**
 * Reads the prediction off the same projection the rest of the app runs on.
 *
 * Deliberately not a separate predictor. A second model would be scoring something the
 * student never saw, and the published number has to be about the app they actually used.
 *
 * `checkedIn` is REQUIRED, for the same reason `toDayInputs`' is (Ruling 39): an
 * optional parameter that silently defaults to "everybody answered" is exactly how §6.5's
 * missing-data pessimism sat dead once already. A caller with no check-in log to thread
 * passes `ALL_PRESENT` explicitly, so the choice is visible at the call site rather than
 * hidden in this signature.
 */
/**
 * The same reading, unrounded.
 *
 * `predictEnergy` rounds to one decimal because that is what gets published. A finite
 * difference taken through that rounding quantises to 0.1 and comes out exactly zero most
 * of the time, which would make every sample look unattributable and silently switch the
 * whole learning loop off. So the sensitivities are measured here and only the stored claim
 * is rounded.
 */
function rawPredict(
  schedule: Schedule,
  params: EngineParams,
  forDay: number,
  checkedIn: readonly boolean[],
): number | null {
  const day = project(schedule.start, toDayInputs(schedule, checkedIn), params).central[forDay]

  return day ? overallReserve(day) : null
}

export function predictEnergy(
  schedule: Schedule,
  params: EngineParams,
  forDay: number,
  checkedIn: readonly boolean[],
): number | null {
  const raw = rawPredict(schedule, params, forDay, checkedIn)

  return raw === null ? null : Math.round(raw * 10) / 10
}

/**
 * How much a 20% bump is, when measuring how much a coefficient matters to this claim.
 *
 * Large enough to sit well clear of floating-point noise, small enough that the projection
 * is still behaving locally rather than being pushed somewhere qualitatively different.
 */
const SENSITIVITY_STEP = 0.2

/** Scales a per-type coefficient, leaving exact zeros exactly zero. See `engineParams`:
 *  `kSleep.social = 0` is load-bearing, not a prior. */
const scaledReserves = (reserves: Reserves, scale: number): Reserves => ({
  mental: reserves.mental === 0 ? 0 : reserves.mental * scale,
  physical: reserves.physical === 0 ? 0 : reserves.physical * scale,
  social: reserves.social === 0 ? 0 : reserves.social * scale,
  errands: reserves.errands === 0 ? 0 : reserves.errands * scale,
})

/**
 * What this claim assumed, and how sensitive it is to each recovery coefficient.
 *
 * Both bumped runs reuse the prediction's own `checkedIn` array, or the derivative would be
 * taken at a different point from the claim it is about -- §6.5's missing-data pessimism
 * changes the shape of the projection, so a sensitivity measured without it describes a
 * week the student was never shown.
 */
function basisFor(
  schedule: Schedule,
  params: EngineParams,
  forDay: number,
  checkedIn: readonly boolean[],
): PredictionBasis | null {
  const base = rawPredict(schedule, params, forDay, checkedIn)
  if (base === null) return null

  const bumpedBy = (next: EngineParams): number => {
    const moved = rawPredict(schedule, next, forDay, checkedIn)
    return moved === null ? 0 : (moved - base) / SENSITIVITY_STEP
  }

  const span = schedule.sleepByDay.slice(0, forDay + 1)
  const restHours = schedule.items
    .filter((item) => item.kind === 'rest' && item.dayIndex <= forDay)
    .reduce((total, item) => total + item.hours, 0)

  return {
    assumedSleepHours:
      span.length === 0 ? 0 : span.reduce((total, hours) => total + hours, 0) / span.length,
    assumedRestHours: restHours,
    sleepScaleSensitivity: bumpedBy({
      ...params,
      kSleep: scaledReserves(params.kSleep, 1 + SENSITIVITY_STEP),
    }),
    restScaleSensitivity: bumpedBy({
      ...params,
      kRest: scaledReserves(params.kRest, 1 + SENSITIVITY_STEP),
    }),
    socialScaleSensitivity: bumpedBy({
      ...params,
      kSocialContact: params.kSocialContact * (1 + SENSITIVITY_STEP),
    }),
    isolationScaleSensitivity: bumpedBy({
      ...params,
      isolationDrainPerDay: params.isolationDrainPerDay * (1 + SENSITIVITY_STEP),
    }),
  }
}

/**
 * Makes today's prediction about the day two days from now, if it can.
 *
 * Returns the list unchanged when there is nothing honest to record: an unanchored week has
 * no real dates, a week whose fortnight has passed has no "today", and a day beyond the
 * horizon has no projection. None of those is an error — they are simply days on which no
 * claim can be made, and inventing one would be worse than making none.
 *
 * `blockLog` defaults to empty, matching `roomModel`'s and `lapsed`'s own default: an empty
 * log is a real state (nothing answered yet), not a placeholder. §8.1's claim is only
 * honest when it is scored against what the student actually saw, which since §6.5 already
 * means a silent past read as a bad sign -- so this reads the same missing-data pessimism
 * the room and the dial do, via the same `checkedInDays`. A silent student gets a *more
 * pessimistic* prediction, which is *harder* to hit, so this can only make the published
 * accuracy figure more honest, never flatter it.
 */
export function predictionsAfter(
  predictions: readonly EnergyPrediction[],
  schedule: Schedule,
  params: EngineParams,
  now: Date,
  blockLog: readonly BlockRecord[] = [],
): EnergyPrediction[] {
  const today = todayIndex(schedule, now)
  if (today === null) return [...predictions]

  const forDay = today + PREDICTION_HORIZON_DAYS
  const forDate = dateFor(schedule, forDay)
  if (forDate === null) return [...predictions]

  const checkedIn = checkedInDays(blockLog, today, schedule.horizonDays)
  const predicted = predictEnergy(schedule, params, forDay, checkedIn)
  if (predicted === null) return [...predictions]

  return recordPrediction(
    predictions,
    forDate,
    predicted,
    basisFor(schedule, params, forDay, checkedIn) ?? undefined,
  )
}

export function recordPrediction(
  predictions: readonly EnergyPrediction[],
  forDate: string,
  predicted: number,
  basis?: PredictionBasis,
): EnergyPrediction[] {
  // One prediction per day. Recording a second would let the app quietly keep whichever
  // turned out closer.
  if (predictions.some((prediction) => prediction.forDate === forDate)) return [...predictions]

  return [...predictions, { forDate, predicted, reported: null, ...(basis ? { basis } : {}) }]
}

/**
 * Attaches what the student actually reported.
 *
 * A prediction that has already resolved is never rewritten. Letting a scored prediction be
 * revised after the fact would make the published error improvable in hindsight, which is the
 * opposite of a falsifiable claim.
 */
export function resolvePrediction(
  predictions: readonly EnergyPrediction[],
  forDate: string,
  reported: number,
): EnergyPrediction[] {
  return predictions.map((prediction) =>
    prediction.forDate === forDate && prediction.reported === null
      ? { ...prediction, reported }
      : prediction,
  )
}

/**
 * §8.1: publish mean absolute error. That is the accuracy number the app displays.
 *
 * Null with nothing resolved. **Zero resolved predictions is not zero error, it is no
 * measurement** — reporting 0.0 would be a lie that flatters the app, and §8 is the section
 * that exists to be honest about precisely this.
 *
 * Absolute rather than signed, so over- and under-prediction cannot cancel into a flattering
 * average.
 */
export function meanAbsoluteError(predictions: readonly EnergyPrediction[]): number | null {
  const scored = predictions.filter(
    (prediction): prediction is EnergyPrediction & { reported: number } =>
      prediction.reported !== null,
  )

  if (scored.length === 0) return null

  const total = scored.reduce(
    (sum, prediction) => sum + Math.abs(prediction.predicted - prediction.reported),
    0,
  )

  return Math.round((total / scored.length) * 10) / 10
}

/** How the number is said to a student, including when there is not one yet. */
export function accuracyLine(predictions: readonly EnergyPrediction[]): string {
  const error = meanAbsoluteError(predictions)
  const scored = predictions.filter((prediction) => prediction.reported !== null).length

  if (error === null) {
    return 'Not enough data yet to say how accurate this is. Tell it how a day went and it starts scoring itself.'
  }

  return `Two-day energy predictions are off by about ${error} points on average, across ${scored} checked so far.`
}
