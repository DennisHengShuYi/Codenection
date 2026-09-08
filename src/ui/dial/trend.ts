export type Trend = 'rising' | 'flat' | 'falling'

/** Enough contrast to mean something without reacting to a single day. */
const TREND_WINDOW_DAYS = 3

/** Reserve points. Below this a bar reads flat rather than flickering between arrows on
 *  noise -- which would make the glyph useless in exactly the place §1.5 relies on it to
 *  carry severity without colour. */
const TREND_EPSILON = 1.5

/**
 * Which way a reserve is heading, judged on its most recent days.
 *
 * Recent rather than whole-series, because what a student needs to know is where things
 * are going now -- a fortnight that started badly and is recovering should not read as
 * falling.
 */
export function trendOf(series: readonly number[]): Trend {
  const window = series.slice(-TREND_WINDOW_DAYS)
  if (window.length < 2) return 'flat'

  const first = window[0]!
  const last = window[window.length - 1]!
  const change = last - first

  if (Math.abs(change) < TREND_EPSILON) return 'flat'
  return change > 0 ? 'rising' : 'falling'
}
