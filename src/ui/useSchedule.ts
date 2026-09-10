import { useEffect, useState } from 'react'
import type { Repository } from '../data'
import { umCrunchWeek } from '../fixtures/umWeek'
import type { Schedule } from '../optimizer'

/**
 * Loads the week once, falling back to the seeded fortnight on first run.
 *
 * §0's no-cold-start rule: a student opening the app for the first time sees a real week
 * rather than a blank state. This said the seed "stands in until §1.4's import paths and
 * §3's planner exist to replace it" -- they exist now (`AddSheet`'s three ways in), and the
 * seed stayed anyway, deliberately: §14 keeps it for the demo, and it is what a visitor
 * looking around with no account is shown before they have typed anything.
 */
export function useSchedule(repo: Repository): {
  schedule: Schedule | null
  setSchedule: (next: Schedule) => void
} {
  const [schedule, setLocal] = useState<Schedule | null>(null)

  useEffect(() => {
    // Guarded because the load can finish after the component has gone -- setting state
    // then is a leak and, in tests, a warning that looks like a real failure.
    let cancelled = false

    repo
      .loadWeek()
      // Unreachable storage falls back to the seed rather than leaving the screen
      // waiting. The local adapter essentially never rejects, but the Supabase one
      // throws on every error path, so without this a student with a bad network would
      // stare at the loading sentence forever. The seeded week is worse than their real
      // data and far better than a screen that never resolves.
      .catch(() => null)
      .then((saved) => {
        if (!cancelled) setLocal(saved ?? umCrunchWeek())
      })

    return () => {
      cancelled = true
    }
  }, [repo])

  function setSchedule(next: Schedule) {
    setLocal(next)
    // Fire and forget, but explicitly caught: a failed write must not block the screen
    // the student is looking at, and an uncaught rejection here would surface as a
    // console error on a screen that is otherwise working fine. The next change retries.
    repo.saveWeek(next).catch(() => undefined)
  }

  return { schedule, setSchedule }
}
