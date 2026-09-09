import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type Repository } from '../data'
import { DEFAULT_PROFILE, type CalibrationProfile } from '../domain/calibration'
import { umBlockLog } from '../fixtures/umBlockLog'
import { umProfile } from '../fixtures/umProfile'

/**
 * The date the seeded profile's predictions -- and the seeded block log's answers -- are
 * keyed to.
 *
 * `umCrunchWeek()` is not anchored -- `RoomShell`'s effect anchors it to `new Date()` on
 * first render, which has not happened yet when this hook resolves. So the seed uses
 * today's date directly, which is the same day that effect will choose.
 */
const seedAnchor = (): string => new Date().toISOString().split('T')[0] ?? '2026-09-01'

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
export function useProfile(repo: Repository): {
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
        // loading rather than taking the screen down. `DEFAULT_SETTINGS` -- returned by every
        // adapter when nothing has been saved yet -- carries the same `DEFAULT_PROFILE`
        // reference, so a legacy blob missing the field and a brand-new install both land
        // here and both get the seed rather than the empty default.
        // §14 step 0: a profile with history, so §8's accuracy line has something to publish
        // on first open rather than "not enough data" for the whole demo.
        const calibration = saved.calibration
        const needsSeed = calibration === undefined || calibration === DEFAULT_PROFILE
        const resolved = needsSeed ? umProfile(seedAnchor()) : calibration

        if (!cancelled) setLocal(resolved)

        // Written straight to the repository, not left to whatever next calls `setProfile`.
        // Anything that reads storage directly -- another tab, the anchor effect's own
        // "did predictions change" comparison -- must see the seed too, not just the screen.
        if (needsSeed) return repo.saveSettings({ ...saved, calibration: resolved }).catch(() => undefined)
        return undefined
      })

    // §8b: block outcomes now live in the durable log behind the repository rather than on
    // the profile, so the log gets the same seed treatment the profile gets above -- an
    // empty log is a fresh install, not a student with no history. Fire-and-forget and kept
    // independent of the profile load: a failure here must not stop the profile from
    // resolving, the same reasoning that makes the save below fire-and-forget too.
    repo
      .loadBlockLog()
      .then(async (log) => {
        if (log.length > 0) return
        // Sequential, not `Promise.all`: `recordBlockAnswer` is a read-modify-write over
        // one stored array, and firing every seed record at once let each read the same
        // near-empty snapshot before any `set` landed, so only the last writer survived.
        // Awaiting one at a time makes each write start from the result of the one before
        // it, the same guarantee `repositoryContract.ts` now asserts for adapters directly.
        for (const record of umBlockLog(seedAnchor())) {
          await repo.recordBlockAnswer(record)
        }
      })
      .catch(() => undefined)

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
