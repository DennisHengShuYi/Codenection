import type { Projection } from '../../engine'
import type { DomainBar, Trend } from './domainBars'

/** Words rather than the glyphs the bars show. An arrow character read aloud by a screen
 *  reader is noise. */
const TREND_WORDS: Record<Trend, string> = {
  rising: 'rising',
  flat: 'steady',
  falling: 'falling',
}

/**
 * §1.5: a full text equivalent of every dial value.
 *
 * A primary view rather than a fallback -- it is what a screen reader user gets and what
 * low-energy mode leans on -- so it has to carry everything the graphic carries,
 * including every warning. A value missing here is missing for those users, not merely
 * unstyled.
 */
export function describeDial(
  capacity: number,
  bars: readonly DomainBar[],
  projection: Projection,
  /**
   * The crossing day as a student would say it, or null when the fortnight holds.
   *
   * Passed in rather than derived: naming a day needs the week's anchor and `today`, and
   * neither reaches this far down. Supplied by the caller that has both.
   */
  deficitDayLabel: string | null = null,
): string {
  // Reserve remaining, not capacity used. The number is `overallReserve`, which `tick`
  // clamps to 100 -- so "you are at 100% capacity this week" was what this told a perfectly
  // rested student, with the sense exactly inverted. `RequestBoxScreen` had already written
  // down that load-against-capacity is "a metric this app does not have".
  const parts: string[] = [`You have about ${Math.round(capacity)}% of your reserve left this week.`]

  for (const bar of bars) {
    // A bar with no measured direction says its value and stops. Reading "steady" for
    // something nothing measured is worse here than anywhere else: this text IS the dial
    // for a screen reader, so an invented word is indistinguishable from a real reading.
    const trend = bar.trend === null ? '' : `, ${TREND_WORDS[bar.trend]}`

    parts.push(`${bar.label}: ${Math.round(bar.value)} out of ${bar.ceiling}${trend}.`)
  }

  for (const bar of bars) {
    if (bar.warning !== null) parts.push(bar.warning)
  }

  // The day by name where the caller could supply one. A bare index is the model's own
  // counting, and it is off by one in the student's terms besides -- "day 1" is their second
  // day. `dayLabel` is the one place that translation lives.
  parts.push(
    projection.firstDeficitDay === null
      ? 'Nothing on the horizon takes you into deficit.'
      : deficitDayLabel === null
        ? 'On this plan you cross into deficit before the fortnight is out.'
        : `On this plan you cross into deficit on ${deficitDayLabel}.`,
  )

  return parts.join(' ')
}
