import type { EnergyPoint } from '../../domain/energyHistory'
import type { Projection } from '../../engine'
import { CapacityDial } from '../dial/CapacityDial'
import type { DomainBar } from '../dial/domainBars'
import { Sheet } from '../kit/Sheet'

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
  onClose,
}: {
  readonly capacity: number
  readonly bars: readonly DomainBar[]
  readonly projection: Projection
  readonly history: readonly EnergyPoint[]
  /** Passed straight through to the dial's text equivalent, which is the one place a day
   *  index would otherwise reach the student unnamed. */
  readonly deficitDayLabel?: string | null
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
    </Sheet>
  )
}
