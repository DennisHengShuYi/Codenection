import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type Repository, type StoredSettings } from '../data'
import { shouldUseLowEnergy } from './lowEnergy'

/** Reads the student's stored preference and writes it back when they change it, so
 *  §1.5's manual override survives a reload rather than resetting to inferred. */
export function useLowEnergy(repo: Repository): {
  /**
   * §1.5's mode for a given floor, rather than a resolved `active`.
   *
   * The floor arrives later in the render than this hook can be called. A hook has to run
   * before `RoomShell`'s "still loading" early return, and the reserve the student has
   * entering today is only known after it -- so taking the floor as an argument here forced
   * the one caller to compute it from `schedule.start`, day zero, frozen. That was fine
   * while the room's character read day zero too, and wrong the moment it started reading
   * today: the interface would have stayed expanded for a student the room was already
   * drawing as flattened.
   *
   * `shouldUseLowEnergy` is still called in exactly one place. Only the moment moved.
   */
  activeFor: (floorReserve: number) => boolean
  /**
   * The stored preference itself, not only what it resolved to.
   *
   * A three-state control has to show which of the three is selected, and `active` cannot
   * answer that: `auto` at 12% reserve and `on` at 80% both resolve to true. Reporting it
   * here keeps one source of truth -- without it the control would have to hold its own
   * copy of the preference and the two would drift the first time either changed.
   */
  override: StoredSettings['lowEnergyOverride']
  setOverride: (override: StoredSettings['lowEnergyOverride']) => void
} {
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    let cancelled = false

    repo
      .loadSettings()
      // Unreachable storage keeps the defaults rather than rejecting. §1.5's mode should
      // fall back to being inferred from the reserve, not disappear because a preference
      // could not be fetched.
      .catch(() => DEFAULT_SETTINGS)
      .then((saved) => {
        if (!cancelled) setSettings(saved)
      })

    return () => {
      cancelled = true
    }
  }, [repo])

  function setOverride(override: StoredSettings['lowEnergyOverride']) {
    const next = { ...settings, lowEnergyOverride: override }
    setSettings(next)
    // Applied on screen whether or not it persists: a student switching the mode off
    // should see it turn off, even if the preference cannot be saved for next time.
    repo.saveSettings(next).catch(() => undefined)
  }

  return {
    activeFor: (floorReserve: number) =>
      shouldUseLowEnergy(floorReserve, settings.lowEnergyOverride),
    override: settings.lowEnergyOverride,
    setOverride,
  }
}
