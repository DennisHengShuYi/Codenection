import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type Repository, type StoredSettings } from '../data'
import { recordNight, type SleepNight } from '../domain/sleepLog'
import { SLEEP_HOURS, type SleepBucket } from '../domain/sleepPlan'
import { DEFAULT_SLEEP_HOURS } from '../engine'
import { SAVE_FAILED } from './useSchedule'

/**
 * The student's stated sleep target, and the nights they have reported.
 *
 * All of it lives on the settings blob rather than in the week, because all of it has to
 * survive the fortnight rolling over -- `Schedule.sleepByDay` does not. That field holds what
 * the app ASSUMES, which `domain/sleepAssumed` derives from these facts on every render; this
 * hook owns the facts and knows nothing about a week.
 *
 * Every write re-reads the blob before saving, following `useProfile.setProfile`. Spreading a
 * cached snapshot is precisely the defect just fixed in `useLowEnergy`, and this hook writes
 * the same blob far more often than that one does.
 */
export function useSleepPlan(repo: Repository): {
  /** The stated target, or `DEFAULT_SLEEP_HOURS` when nobody has stated one. */
  targetHours: number
  /**
   * Whether the figure above was actually stated.
   *
   * Reported separately because defaulted and stated are different facts: `sleepReality`
   * compares against a stated target, and `roomState` keeps its population norm without one.
   * A hook answering only "8" would make every student look as though they had set it.
   */
  hasTarget: boolean
  nights: readonly SleepNight[]
  /** Hours the student chose for the night that began on each date. What the page shows; what
   *  the app assumes is derived from it by `domain/sleepAssumed`. */
  chosenByDate: Readonly<Record<string, number>>
  setTarget: (hours: number) => void
  /** Records a night the student spoke about, keyed by the date it began. */
  setChosen: (isoDate: string, hours: number) => void
  reportNight: (isoDate: string, bucket: SleepBucket) => void
  /** Null while every write has landed. A sentence a student can act on otherwise -- the
   *  convention `useSchedule`, `useBlockLog` and `useLowEnergy` share. */
  problem: string | null
} {
  const [target, setStoredTarget] = useState<number | null>(null)
  const [nights, setNights] = useState<readonly SleepNight[]>([])
  const [chosen, setChosen] = useState<Readonly<Record<string, number>>>({})
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    repo
      .loadSettings()
      // Unreachable storage keeps the defaults rather than rejecting, for `useLowEnergy`'s
      // reason: an assumed night is a product behaviour, not a stored preference that stops
      // existing because a fetch failed.
      .catch(() => DEFAULT_SETTINGS)
      .then((saved) => {
        if (cancelled) return
        setStoredTarget(saved.sleepTargetHours ?? null)
        setNights(saved.sleepNights ?? [])
        setChosen(saved.sleepChosenByDate ?? {})
      })

    return () => {
      cancelled = true
    }
  }, [repo])

  /** Applied on screen whether or not it persists, with the failure reported rather than
   *  dropped. Re-reads first so a field another writer added is not lost. */
  const write = (patch: Partial<StoredSettings>) => {
    repo
      .loadSettings()
      .catch(() => DEFAULT_SETTINGS)
      .then((saved) => repo.saveSettings({ ...saved, ...patch }))
      .then(() => setProblem(null))
      .catch(() => setProblem(SAVE_FAILED))
  }

  return {
    targetHours: target ?? DEFAULT_SLEEP_HOURS,
    hasTarget: target !== null,
    nights,
    chosenByDate: chosen,
    setChosen: (isoDate: string, hours: number) => {
      const next = { ...chosen, [isoDate]: hours }
      setChosen(next)
      write({ sleepChosenByDate: next })
    },
    setTarget: (hours: number) => {
      setStoredTarget(hours)
      write({ sleepTargetHours: hours })
    },
    reportNight: (isoDate: string, bucket: SleepBucket) => {
      // Through `recordNight` rather than appending here: it upserts on the night, so
      // answering one twice corrects the first answer instead of stacking a second that
      // would double-count in every average `sleepReality` takes.
      const next = recordNight(nights, {
        isoDate,
        hours: SLEEP_HOURS[bucket],
        answeredAt: Date.now(),
      })
      setNights(next)
      write({ sleepNights: next })
    },
    problem,
  }
}
