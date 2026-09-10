import type { StoredSettings } from '../data'

/** §1.5: below this the interface collapses to one number and one action. Lower than
 *  §7.6's deficit line of 30, because being in deficit is common while being unable to
 *  cope with a dashboard is not. */
export const LOW_ENERGY_THRESHOLD = 20

/**
 * §1.5: "A student at 12% reserve should not be handed a dashboard."
 *
 * A product decision as much as an accessibility one, and also the fallback for any
 * screen that cannot be made to work at 320px.
 *
 * The manual setting wins in both directions. An interface a struggling student cannot
 * dismiss is one more thing being done to them, which is the opposite of the point.
 *
 * That rule is currently UNMET in the running app, and this comment says so rather than
 * describing an intention. `useLowEnergy.setOverride` is the only writer of the preference
 * and no control calls it -- the toggle lived on `LowEnergyView`, deleted in Task 17. The
 * reading side below is live and correct; what is missing is somewhere to say it.
 */
export function shouldUseLowEnergy(
  floorReserve: number,
  override: StoredSettings['lowEnergyOverride'],
): boolean {
  if (override === 'on') return true
  if (override === 'off') return false

  return floorReserve < LOW_ENERGY_THRESHOLD
}
