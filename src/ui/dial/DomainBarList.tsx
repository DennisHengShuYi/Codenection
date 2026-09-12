import { HORIZON_DAYS } from '../../engine'
import type { BarSpan, DomainBar, Trend } from './domainBars'

const GLYPHS: Record<Trend, string> = { rising: '▲', flat: '▬', falling: '▼' }

const TREND_WORDS: Record<Trend, string> = {
  rising: 'rising',
  flat: 'steady',
  falling: 'falling',
}

/** Colour is one of three cues, never the only one. Each status also carries a glyph and,
 *  where it matters, a written warning -- so severity survives greyscale, colour
 *  blindness and a screen reader alike (§1.5). */
const FILL: Record<DomainBar['status'], string> = {
  healthy: 'bg-ink-soft',
  stretched: 'bg-attention',
  critical: 'bg-critical',
}

/**
 * What stretch of time a group of bars covers, in a student's words.
 *
 * The horizon's length is read from the engine rather than written out, so the sentence
 * cannot come to name a different number of days from the one being measured.
 */
const SPAN_WORDS: Record<BarSpan, string> = {
  now: 'Where today started',
  horizon: `Across the next ${HORIZON_DAYS} days`,
}

export function DomainBarList({ bars }: { bars: readonly DomainBar[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {bars.map((bar, index) => (
        <li key={bar.key} className="flex flex-col gap-1">
          {/* Said once where the span changes, not once per row: four reserve bars share
              one reading and repeating it four times is noise. The boundary is real -- a
              snapshot above, a fortnight below -- so it earns a heading. */}
          {bar.span !== bars[index - 1]?.span && (
            <p
              data-testid={`span-${bar.span}`}
              className="mt-1 text-xs uppercase tracking-wide text-ink-soft first:mt-0"
            >
              {SPAN_WORDS[bar.span]}
            </p>
          )}
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span>{bar.label}</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{Math.round(bar.value)}</span>
              {/* Drawn only where something measured it. An arrow on a bar with no
                  reading behind it is a claim, and `aria-label` makes it a spoken one. */}
              {bar.trend !== null && (
                <span
                  data-testid={`trend-${bar.key}`}
                  role="img"
                  aria-label={TREND_WORDS[bar.trend]}
                >
                  {GLYPHS[bar.trend]}
                </span>
              )}
            </span>
          </div>

          {/* §1.2: measured against its own ceiling, not a shared scale -- a shared one
              would make a full social life and a full workload look the same. */}
          <div
            role="meter"
            aria-label={bar.label}
            aria-valuenow={Math.round(bar.value)}
            aria-valuemin={0}
            aria-valuemax={bar.ceiling}
            className="h-2 w-full overflow-hidden rounded-full bg-line"
          >
            <div
              className={`h-full ${FILL[bar.status]}`}
              style={{ width: `${Math.min(100, (bar.value / bar.ceiling) * 100)}%` }}
            />
          </div>

          {bar.warning !== null && (
            <p data-testid={`warning-${bar.key}`} className="text-xs opacity-80">
              {bar.warning}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
