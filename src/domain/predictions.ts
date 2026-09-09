import { overallReserve, project, type EngineParams } from '../engine'
import { toDayInputs, type Schedule } from '../optimizer'
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
export interface EnergyPrediction {
  /** YYYY-MM-DD, the day this is a claim about. */
  readonly forDate: string
  readonly predicted: number
  readonly reported: number | null
}

/**
 * §8.1's horizon. Two days out, because these **resolve regardless of whether the student
 * intervenes** — which is exactly what the 21-day projection cannot do, and why that one is a
 * decision aid rather than a validated claim (§8.2).
 */
export const PREDICTION_HORIZON_DAYS = 2

/**
 * Reads the prediction off the same projection the rest of the app runs on.
 *
 * Deliberately not a separate predictor. A second model would be scoring something the
 * student never saw, and the published number has to be about the app they actually used.
 */
export function predictEnergy(
  schedule: Schedule,
  params: EngineParams,
  forDay: number,
): number | null {
  const projection = project(schedule.start, toDayInputs(schedule), params)
  const day = projection.central[forDay]

  return day ? Math.round(overallReserve(day) * 10) / 10 : null
}

/**
 * Makes today's prediction about the day two days from now, if it can.
 *
 * Returns the list unchanged when there is nothing honest to record: an unanchored week has
 * no real dates, a week whose fortnight has passed has no "today", and a day beyond the
 * horizon has no projection. None of those is an error — they are simply days on which no
 * claim can be made, and inventing one would be worse than making none.
 */
export function predictionsAfter(
  predictions: readonly EnergyPrediction[],
  schedule: Schedule,
  params: EngineParams,
  now: Date,
): EnergyPrediction[] {
  const today = todayIndex(schedule, now)
  if (today === null) return [...predictions]

  const forDay = today + PREDICTION_HORIZON_DAYS
  const forDate = dateFor(schedule, forDay)
  if (forDate === null) return [...predictions]

  const predicted = predictEnergy(schedule, params, forDay)
  if (predicted === null) return [...predictions]

  return recordPrediction(predictions, forDate, predicted)
}

export function recordPrediction(
  predictions: readonly EnergyPrediction[],
  forDate: string,
  predicted: number,
): EnergyPrediction[] {
  // One prediction per day. Recording a second would let the app quietly keep whichever
  // turned out closer.
  if (predictions.some((prediction) => prediction.forDate === forDate)) return [...predictions]

  return [...predictions, { forDate, predicted, reported: null }]
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
