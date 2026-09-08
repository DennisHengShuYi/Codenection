import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type Repository, type StoredSettings } from '../data'
import { shouldUseLowEnergy } from './lowEnergy'

/** Reads the student's stored preference and writes it back when they change it, so
 *  §1.5's manual override survives a reload rather than resetting to inferred. */
export function useLowEnergy(
  repo: Repository,
  floorReserve: number,
): {
  active: boolean
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

  return { active: shouldUseLowEnergy(floorReserve, settings.lowEnergyOverride), setOverride }
}
