import { useEffect, useRef, useState } from 'react'
import type { Repository, Session } from '../data'
import { freshWeek } from '../domain/freshWeek'
import { umCrunchWeek } from '../fixtures/umWeek'
import type { Schedule } from '../optimizer'

/** Said to the student when a change could not be written. The week they are looking at is
 *  still the one they edited -- this is about whether it will still be there tomorrow. */
export const SAVE_FAILED =
  'I could not save that change, so it may not be here next time you open the app.'

/**
 * Loads the week once, falling back to the seeded fortnight on first run.
 *
 * §0's no-cold-start rule: a student opening the app for the first time sees a real week
 * rather than a blank state. This said the seed "stands in until §1.4's import paths and
 * §3's planner exist to replace it" -- they exist now (`AddSheet`'s three ways in), and the
 * seed stayed anyway, deliberately: Ruling 14 keeps it for the demo, and it is what a visitor
 * looking around with no account is shown before they have typed anything.
 *
 * `session` gates which first run that is, and the gate belongs here for the reason
 * `useProfile` states over its own: "a signed-in account is a real student, not a preview".
 * That hook already refused to write the fabricated profile and the ~20 invented
 * `BlockRecord`s into a live account -- but the week carried the other half of the same seed
 * and had no gate at all, so a student signing up was shown `umCrunchWeek`'s UM timetable,
 * its three invented assignments, and `CRUNCH_START`'s 41/44/32/55 read onto the dial as
 * their own depletion. Half the seed was gated and half was missed.
 *
 * So a visitor still gets the demo fortnight and a real first run gets `freshWeek` -- empty,
 * at full reserve, and honest about having measured nothing yet. §0 still holds either way:
 * both are a week the room can draw, neither is a blank state.
 */
export function useSchedule(
  repo: Repository,
  session: Session | null = null,
): {
  schedule: Schedule | null
  setSchedule: (next: Schedule) => void
  /** Null while every write so far has landed. A sentence a student can act on otherwise. */
  problem: string | null
} {
  const [schedule, setLocal] = useState<Schedule | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  /**
   * The newest week not yet written, and whether a write is already out.
   *
   * Refs rather than state: these coordinate writes, and re-rendering the screen because
   * the queue moved would be a render nobody asked for.
   */
  const pending = useRef<Schedule | null>(null)
  const writing = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

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
        if (!cancelled) setLocal(saved ?? (session === null ? umCrunchWeek() : freshWeek()))
      })

    return () => {
      cancelled = true
    }
  }, [repo, session])

  /**
   * Writes the newest week, one write at a time.
   *
   * The hook has always declined to await its write, and that part was right: a slow save
   * must not block the screen the student is looking at. What was wrong was issuing every
   * write the moment it was asked for, which put two in flight at once as soon as a student
   * made two edits in a row -- and then whichever landed last won. Against IndexedDB that is
   * a narrow window; against Supabase every write is a network round trip, so an older week
   * overwriting a newer one is an ordinary outcome. Editing a block, removing another and
   * adding a third is now the normal way to use the week, so "two edits in a row" is not an
   * edge case.
   *
   * Superseded weeks are dropped rather than queued. Each write is a whole snapshot, not a
   * delta, so a week that a later edit has already replaced has nothing left to contribute
   * -- writing it would be a round trip whose result is immediately overwritten, and one
   * more moment in which a reload loses the newest edit.
   */
  async function drain(repository: Repository) {
    if (writing.current) return
    writing.current = true

    try {
      while (pending.current !== null) {
        const next = pending.current
        pending.current = null

        try {
          await repository.saveWeek(next)
          // Cleared on success as well as set on failure: a message about a failure that is
          // over is its own kind of dishonesty, and this is the only place that knows the
          // difference.
          if (mounted.current) setProblem(null)
        } catch {
          /*
           * `useBlockLog` recorded why this used to be dropped: "the week is rewritten on
           * the next change, so a lost save retries by itself." That holds for every change
           * except the last one -- and the last change is precisely the one a student makes
           * before closing the tab, so for that change the retry never comes. Said out loud
           * instead, per the project's own rule against swallowing errors.
           *
           * The failed week is not re-queued. The next edit writes a whole fresh snapshot
           * anyway, and retrying this one in a loop would spin against a store that is down.
           */
          if (mounted.current) setProblem(SAVE_FAILED)
        }
      }
    } finally {
      writing.current = false
    }
  }

  function setSchedule(next: Schedule) {
    setLocal(next)
    pending.current = next
    void drain(repo)
  }

  return { schedule, setSchedule, problem }
}
