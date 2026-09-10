import type { Projection } from '../../engine'
import { DomainBarList } from './DomainBarList'
import { angleForPercent, arcPath, DIAL_MAX_PERCENT, pointOnArc } from './dialGeometry'
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
  compact = false,
}: {
  capacity: number
  bars: readonly DomainBar[]
  projection: Projection
  compact?: boolean
}) {
  const needle = pointOnArc(CX, CY, R - NEEDLE_INSET, angleForPercent(capacity))
  const overloaded = capacity > 100

  return (
    <section className="flex flex-col gap-4">
      {/*
        A viewBox and no width attribute: the gauge scales to its container at every
        breakpoint without a single media query, which is §10's whole argument for
        hand-rolled SVG over canvas or an image.

        Hidden from assistive technology because the text equivalent below carries the
        same information in a form that can actually be read -- announcing both would be
        noise rather than access.
      */}
      <svg
        data-testid={compact ? 'dial-gauge-compact' : 'dial-gauge'}
        viewBox="0 0 200 115"
        className="w-full"
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
          d={arcPath(CX, CY, R, -90, angleForPercent(Math.min(capacity, DIAL_MAX_PERCENT)))}
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          className={overloaded ? 'text-critical' : 'text-ink-soft'}
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

      <p className="text-center">
        <span
          data-testid={compact ? 'capacity-value-compact' : 'capacity-value'}
          className={
            compact
              ? 'text-2xl font-semibold tabular-nums'
              : 'text-5xl font-semibold tabular-nums'
          }
        >
          {Math.round(capacity)}%
        </span>
      </p>

      {!compact && <DomainBarList bars={bars} />}

      {/* §1.5: a primary view, not an afterthought hidden from sighted users. It stays in
          the document for everyone. */}
      {!compact && (
        <p data-testid="reserve-text-equivalent" className="text-sm opacity-80">
          {describeDial(capacity, bars, projection)}
        </p>
      )}
    </section>
  )
}
