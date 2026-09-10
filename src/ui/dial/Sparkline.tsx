import { describeEnergyHistory, type EnergyPoint } from '../../domain/energyHistory'

/**
 * The drawing box, in SVG user units. Arbitrary and never seen: the `viewBox` scales it to
 * whatever width the card gives it, which is the same reason `CapacityDial` carries no
 * width attribute -- one hand-rolled SVG that works at 320px and 1280px without a media
 * query (§10).
 */
const WIDTH = 300
const HEIGHT = 48

/** Keeps the stroke from being clipped in half at the top and bottom of the box. */
const PADDING = 3

/**
 * The reserve scale, fixed rather than fitted to the data.
 *
 * A chart that rescaled itself to its own range would draw a steady week and a collapsing
 * one with the identical shape, which is the opposite of what a trend is for. 40-50-60 must
 * look flatter than 0-50-100, and it only does if the axis is the thing being reported on.
 */
const SCALE_MAX = 100

/**
 * What the student has actually reported feeling, as a line.
 *
 * The brief asks for a stress tracker logging how you feel over time. Every energy tap has
 * always been stored and dated; until now the only thing that read it was the accuracy
 * figure, which reduces the whole history to one mean error.
 *
 * Presentational only. It takes points and draws them -- the filtering, the ordering, the
 * "not enough to be a trend" rule and the sentence all live in `domain/energyHistory`, so
 * nothing about what counts as a trend is decided in a component.
 */
export function Sparkline({ points }: { readonly points: readonly EnergyPoint[] }) {
  if (points.length === 0) return null

  const step = points.length === 1 ? 0 : WIDTH / (points.length - 1)
  const plotted = points
    .map((point, index) => {
      const x = index * step
      // Inverted, because SVG y grows downward and a good day should sit high.
      const ratio = Math.min(Math.max(point.value, 0), SCALE_MAX) / SCALE_MAX
      const y = PADDING + (1 - ratio) * (HEIGHT - PADDING * 2)
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`
    })
    .join(' ')

  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full text-ink-soft"
        // Hidden from assistive technology because the sentence below carries the same
        // reading in a form that can be read. Announcing both is noise, not access.
        aria-hidden="true"
      >
        <polyline
          data-testid="sparkline"
          points={plotted}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* §1.5: in the document for everyone, not hidden behind a screen reader. */}
      <p data-testid="sparkline-text" className="text-xs text-ink-soft">
        {describeEnergyHistory(points)}
      </p>
    </div>
  )
}
