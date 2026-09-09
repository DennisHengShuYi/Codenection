import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type Repository } from '../../data'
import { DEFAULT_PROFILE, type CalibrationProfile } from '../../domain/calibration'

/**
 * Reads the calibration profile from stored settings and writes it back when it changes.
 *
 * Shaped exactly like `useLowEnergy`, including the failure behaviour: unreachable storage
 * keeps the defaults rather than rejecting, because §7.7's whole point is that the app works
 * on population defaults. Calibration that could not be loaded should leave a working app,
 * not an empty one.
 *
 * Applied on screen whether or not it persists, for the same reason: a student who picks a
 * mode should see it selected even if the write fails.
 */
export function useCalibration(repo: Repository): {
  profile: CalibrationProfile
  setProfile: (next: CalibrationProfile) => void
} {
  const [profile, setLocal] = useState<CalibrationProfile>(DEFAULT_PROFILE)

  useEffect(() => {
    let cancelled = false

    repo
      .loadSettings()
      .catch(() => DEFAULT_SETTINGS)
      .then((saved) => {
        // Settings written before calibration existed have no profile at all, and must keep
        // loading rather than taking the screen down.
        if (!cancelled) setLocal(saved.calibration ?? DEFAULT_PROFILE)
      })

    return () => {
      cancelled = true
    }
  }, [repo])

  function setProfile(next: CalibrationProfile) {
    setLocal(next)

    repo
      .loadSettings()
      .catch(() => DEFAULT_SETTINGS)
      .then((saved) => repo.saveSettings({ ...saved, calibration: next }))
      .catch(() => undefined)
  }

  return { profile, setProfile }
}
