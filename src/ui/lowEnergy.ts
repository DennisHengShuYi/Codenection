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
 * Both directions are live in the running app (Ruling 45). `useLowEnergy.setOverride` is
 * the only writer of the preference, and `settings/LowEnergyControl.tsx` -- three states,
 * `auto` / `on` / `off` -- is what calls it, from the settings sheet. That sheet is
 * reachable from inside the collapsed interface because `open-settings` sits in
 * `RoomShell`'s always-rendered header, ungated by this mode.
 *
 * This comment used to record the rule as UNMET, which it was between Task 17 deleting
 * `LowEnergyView` and the control being rebuilt. Kept accurate in both directions: a
 * comment claiming a compliance that does not exist is a defect this branch shipped once
 * already, and the inverse is no better.
 */
export function shouldUseLowEnergy(
  floorReserve: number,
  override: StoredSettings['lowEnergyOverride'],
): boolean {
  if (override === 'on') return true
  if (override === 'off') return false

  return floorReserve < LOW_ENERGY_THRESHOLD
}
