import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type Repository, type StoredSettings } from '../data'
import { shouldUseLowEnergy } from './lowEnergy'
import { SAVE_FAILED } from './useSchedule'

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
  /**
   * Null while every write has landed. A sentence a student can act on otherwise.
   *
   * The same convention `useSchedule` and `useBlockLog` already use, and for the reason
   * `useBlockLog` gives: the project's own rule is that errors are never silently
   * swallowed. This hook dropped every save failure on the floor -- so a student could set
   * the mode that decides whether they are handed a dashboard at all, see it apply, and
   * find it reverted next time with nothing having said so. Applying it on screen
   * regardless is right; saying nothing when it did not persist is not.
   */
  problem: string | null
} {
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_SETTINGS)
  const [problem, setProblem] = useState<string | null>(null)

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
    setSettings({ ...settings, lowEnergyOverride: override })
    // Re-read before writing, the way `useProfile.setProfile` does, rather than spreading
    // this hook's own cached snapshot. Spreading the snapshot dropped any field another
    // writer had put on the blob since this hook loaded -- latent while settings held only a
    // mode and a profile, and reachable the moment sleep began writing the same blob. The
    // regression test in this hook's spec is named for it.
    //
    // Applied on screen whether or not it persists: a student switching the mode off should
    // see it turn off, even if the preference cannot be saved for next time. The failure is
    // reported rather than dropped.
    repo
      .loadSettings()
      .catch(() => DEFAULT_SETTINGS)
      .then((saved) => repo.saveSettings({ ...saved, lowEnergyOverride: override }))
      .then(() => setProblem(null))
      .catch(() => setProblem(SAVE_FAILED))
  }

  return {
    activeFor: (floorReserve: number) =>
      shouldUseLowEnergy(floorReserve, settings.lowEnergyOverride),
    override: settings.lowEnergyOverride,
    setOverride,
    problem,
  }
}
