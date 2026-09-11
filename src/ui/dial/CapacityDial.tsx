import type { EnergyPoint } from '../../domain/energyHistory'
import type { Projection } from '../../engine'
import { DomainBarList } from './DomainBarList'
import { Sparkline } from './Sparkline'
import { angleForPercent, arcPath, pointOnArc } from './dialGeometry'
import { describeDial } from './dialText'
import type { DomainBar } from './domainBars'

const CX = 100
const CY = 100
const R = 80
const NEEDLE_INSET = 10

/**
 * @param compact §1.1 puts the dial in one corner as a compact readout once the room is
 * the surface. The compact form drops the bars and the spoken summary -- they stay on the
 * full dial below the room, so nothing from the glance layer is lost -- and carries its
 * own test id, because two elements sharing one on the same page breaks every query for
 * it.
 */
export function CapacityDial({
  capacity,
  bars,
  projection,
  history = [],
  compact = false,
  deficitDayLabel = null,
}: {
  capacity: number
  bars: readonly DomainBar[]
  projection: Projection
  /**
   * §8b's reported energy, oldest first, for the trend under the gauge.
   *
   * The gauge is one number about now and the bars are a forecast; this is the only thing
   * on the screen that is a record of what the student actually said. Defaulted to empty so
   * every caller built before it existed keeps compiling, and so §0's no-cold-start rule
   * holds for a student on day one.
   */
  history?: readonly EnergyPoint[]
  compact?: boolean
  /** The deficit crossing as a student would say it, for the §1.5 text equivalent. Naming a
   *  day needs the week's anchor and `today`; neither reaches the dial, so the shell that has
   *  both supplies the finished phrase. */
  deficitDayLabel?: string | null
}) {
  const needle = pointOnArc(CX, CY, R - NEEDLE_INSET, angleForPercent(capacity))

  return (
    <section className="flex flex-col gap-4">
      {/*
        The arc and the number read as one thing, on one line: the gauge is a readout of
        the figure beside it, not the panel's subject.

        It carried `w-full` on a viewBox with no width of its own, which this comment used
        to praise as scaling to any container without a media query -- and it did, straight
        past the point of usefulness. In a 512px sheet that is 294px of needle above a 48px
        number, with the five bars the sheet exists for starting below the fold. Bounded
        here for the full dial and left to fill its corner in the compact one, where being
        the whole of a small box is the job.

        Hidden from assistive technology because the text equivalent below carries the same
        information in a form that can actually be read -- announcing both would be noise
        rather than access.
      */}
      <div className="flex items-center gap-4">
        <svg
          data-testid={compact ? 'dial-gauge-compact' : 'dial-gauge'}
          viewBox="0 0 200 115"
          className={compact ? 'w-full' : 'w-32 shrink-0'}
          aria-hidden="true"
          focusable="false"
        >
          <path
            d={arcPath(CX, CY, R, -90, 90)}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.15"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d={arcPath(CX, CY, R, -90, angleForPercent(capacity))}
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            strokeLinecap="round"
            className="text-ink-soft"
          />
          <line
            x1={CX}
            y1={CY}
            x2={needle.x}
            y2={needle.y}
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx={CX} cy={CY} r="5" fill="currentColor" />
        </svg>

        <p className={compact ? 'text-center' : 'flex flex-col'}>
          <span
            data-testid={compact ? 'capacity-value-compact' : 'capacity-value'}
            className={
              compact
                ? 'text-2xl font-semibold tabular-nums'
                : 'text-4xl font-semibold tabular-nums'
            }
          >
            {Math.round(capacity)}%
          </span>

          {/* The number on its own is ambiguous in the worst direction: 43 reads as
              "43% used" as readily as "43% left", and the two mean opposite things. The
              text equivalent has said which since Ruling 60; the drawing now does too. */}
          {!compact && (
            <span className="text-sm text-ink-soft">of your reserve left, as today began</span>
          )}
        </p>
      </div>

      {/* Directly under the number it is the history of, and dropped on the compact dial
          for the same reason the bars are: §1.1's corner readout is one figure, and a
          fortnight of dots beside it is a second thing to read. */}
      {!compact && <Sparkline points={history} />}

      {!compact && <DomainBarList bars={bars} />}

      {/* §1.5: a primary view, not an afterthought hidden from sighted users. It stays in
          the document for everyone. */}
      {!compact && (
        <p data-testid="reserve-text-equivalent" className="text-sm opacity-80">
          {describeDial(capacity, bars, projection, deficitDayLabel)}
        </p>
      )}
    </section>
  )
}
