import { useEffect, useState } from 'react'
import type { Repository } from '../data'
import { umCrunchWeek } from '../fixtures/umWeek'
import type { Schedule } from '../optimizer'

/**
 * Loads the week once, falling back to the seeded fortnight on first run.
 *
 * §0's no-cold-start rule: a student opening the app for the first time sees a real week
 * rather than a blank state. The seed stands in until §1.4's import paths and §3's
 * planner exist to replace it.
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

    void repo.loadWeek().then((saved) => {
      if (!cancelled) setLocal(saved ?? umCrunchWeek())
    })

    return () => {
      cancelled = true
    }
  }, [repo])

  function setSchedule(next: Schedule) {
    setLocal(next)
    // Fire and forget: a failed write must not block the screen the student is looking
    // at, and the next change will try again.
    void repo.saveWeek(next)
  }

  return { schedule, setSchedule }
}
