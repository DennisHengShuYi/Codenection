import type { EnergyPrediction } from './predictions'

/**
 * How far back the trend looks, in reported days.
 *
 * The same span as the planning horizon, so the two surfaces answer the same question from
 * opposite ends: the week grid shows the fortnight the app is planning, this shows the
 * fortnight the student actually lived.
 */
export const HISTORY_DAYS = 21

/**
 * Fewer points than this and there is no trend to draw.
 *
 * Two dots joined by a line assert a direction nobody measured, and the whole point of this
 * chart is that it reports rather than models. `biasLine` refuses to speak below
 * `MIN_SAMPLES` for the same reason, and this is that rule applied to a picture.
 */
export const MIN_POINTS_TO_PLOT = 3

/** One day the student reported on. */
export interface EnergyPoint {
  /** YYYY-MM-DD, the day being reported on. */
  readonly date: string
  /** What they said, on the same 0-100 scale as the reserves. */
  readonly value: number
}

/**
 * What the student actually reported feeling, oldest first.
 *
 * §8b's answer to the brief's stress tracker. Every energy tap has always been stored,
 * dated, on the calibration profile as the `reported` half of an `EnergyPrediction` -- and
 * until now it was read by exactly one thing, the accuracy figure, which reduces the whole
 * history to a single mean error. The dated series was there the entire time.
 *
 * Only resolved predictions are plotted. Drawing `predicted` alongside would put the app's
 * own guesses on a chart of what the student said, which is the one thing a self-report
 * must never do -- and it is the same conflation the accuracy figure exists to keep honest.
 *
 * Pure and sorted here rather than in the component: the ordering is a fact about the data,
 * and a chart that sorted its own input would be a second place for that to go wrong.
 */
export function energyHistory(
  predictions: readonly EnergyPrediction[],
  days = HISTORY_DAYS,
): readonly EnergyPoint[] {
  const points = predictions
    .filter((prediction) => prediction.reported !== null)
    .map((prediction) => ({ date: prediction.forDate, value: prediction.reported as number }))
    // Copied before sorting: `predictions` belongs to the profile the app writes back to
    // storage, and `Array.prototype.sort` mutates in place.
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days)

  return points.length < MIN_POINTS_TO_PLOT ? [] : points
}

/**
 * How far the two ends must differ before the movement is called a direction.
 *
 * Below this it is a wobble, and naming it a trend would be inventing a shape out of noise
 * -- the same overclaim `MIN_POINTS_TO_PLOT` refuses from the other side. Ten points on the
 * reserve scale is one step of the check-in's own five-band answer, so anything smaller is
 * finer than the instrument that measured it.
 */
const WORTH_CALLING_A_DIRECTION = 10

/**
 * The chart in words.
 *
 * §1.5: colour and shape never carry meaning alone. A line is exactly the kind of thing a
 * sighted student reads at a glance and nobody else gets at all, so the same reading is
 * available as text -- in the document for everyone, as `describeDial` already does for the
 * gauge rather than hiding it behind assistive technology.
 *
 * Ends against ends, not a fitted slope: this is a report of what the student said on two
 * days, and a regression line would be a claim about days in between that they never made.
 */
export function describeEnergyHistory(points: readonly EnergyPoint[]): string | null {
  const first = points[0]
  const last = points.at(-1)
  if (first === undefined || last === undefined) return null

  const span = `Across the last ${points.length} days you reported`
  const change = last.value - first.value

  if (Math.abs(change) < WORTH_CALLING_A_DIRECTION) {
    return `${span} about the same energy throughout.`
  }

  return change > 0
    ? `${span} your energy going up, from ${first.value}% to ${last.value}%.`
    : `${span} your energy going down, from ${first.value}% to ${last.value}%.`
}
