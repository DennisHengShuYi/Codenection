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

    void repo.loadSettings().then((saved) => {
      if (!cancelled) setSettings(saved)
    })

    return () => {
      cancelled = true
    }
  }, [repo])

  function setOverride(override: StoredSettings['lowEnergyOverride']) {
    const next = { ...settings, lowEnergyOverride: override }
    setSettings(next)
    void repo.saveSettings(next)
  }

  return { active: shouldUseLowEnergy(floorReserve, settings.lowEnergyOverride), setOverride }
}
