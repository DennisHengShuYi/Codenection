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
): string {
  const parts: string[] = [`You are at ${Math.round(capacity)}% capacity this week.`]

  for (const bar of bars) {
    parts.push(
      `${bar.label}: ${Math.round(bar.value)} out of ${bar.ceiling}, ${TREND_WORDS[bar.trend]}.`,
    )
  }

  for (const bar of bars) {
    if (bar.warning !== null) parts.push(bar.warning)
  }

  parts.push(
    projection.firstDeficitDay === null
      ? 'Nothing on the horizon takes you into deficit.'
      : `On this plan you cross into deficit on day ${projection.firstDeficitDay}.`,
  )

  return parts.join(' ')
}
