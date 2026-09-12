import type { EnergyPoint } from '../../domain/energyHistory'
import type { Projection } from '../../engine'
import { CapacityDial } from '../dial/CapacityDial'
import type { DomainBar } from '../dial/domainBars'
import { Sheet } from '../kit/Sheet'
import { InsightBlock } from './InsightBlock'

/**
 * §1.1's reserve and §1.2's five bars, behind the room's own corner gauge.
 *
 * Ruling 59. This was the foot of the week screen, under the calendar and the Rebalance
 * button -- which put a dashboard somewhere nobody looking for "how am I doing" would go,
 * and made "the week" mean two things at once. Ruling 53 had already moved it off the room
 * for the opposite reason: the room reads capacity exactly once, through the gauge.
 *
 * So it lives here, one tap behind that gauge. The compact readout is still the only
 * capacity reading on the room; pressing it is now how you ask for the rest.
 *
 * The §1.5 gate travels with it. `RoomShell` does not render this at all in low-energy
 * mode -- "a student at 12% reserve should not be handed a dashboard" -- and the gauge is
 * not a door there either, so there is no path to it rather than a door that refuses.
 */
export function ReservesSheet({
  capacity,
  bars,
  projection,
  history,
  deficitDayLabel = null,
  insightLines = [],
  onClose,
}: {
  readonly capacity: number
  readonly bars: readonly DomainBar[]
  readonly projection: Projection
  readonly history: readonly EnergyPoint[]
  /** Passed straight through to the dial's text equivalent, which is the one place a day
   *  index would otherwise reach the student unnamed. */
  readonly deficitDayLabel?: string | null
  /**
   * What the numbers mean, computed by `domain/reserveInsight` from the same projection the
   * dial draws.
   *
   * Defaulted to nothing, and the block renders nothing for an empty list. A caller with no
   * insight to give is a real state -- the sheet is rendered in tests and from places that
   * hold the reserves without holding the week -- and it must show the dial rather than an
   * empty heading.
   */
  readonly insightLines?: readonly string[]
  readonly onClose: () => void
}) {
  return (
    <Sheet title="Where your reserves stand" onClose={onClose}>
      <CapacityDial
        capacity={capacity}
        bars={bars}
        projection={projection}
        history={history}
        deficitDayLabel={deficitDayLabel}
      />

      {/* Under the dial and under §1.5's text equivalent, never folded into it. That
          paragraph is a restatement by design -- it IS the dial for a screen reader, so an
          interpretation mixed in would be indistinguishable from a reading. */}
      <InsightBlock lines={insightLines} />
    </Sheet>
  )
}
