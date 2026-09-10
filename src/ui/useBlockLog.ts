import { useCallback, useEffect, useState } from 'react'
import type { Repository } from '../data'
import type { BlockRecord } from '../domain/blockLog'

/** Said to the student, and the one string the read's own message is recognised by when a
 *  later read succeeds. */
export const UNREADABLE =
  'I could not read your check-in answers, so I cannot work out what your week costs right now.'

/**
 * Reads §8b's durable block log and lets the screen record a new answer without waiting on
 * a reload to see it.
 *
 * Ruling 12: `RoomShell` makes `blockLog` a required prop rather than defaulting to `[]`,
 * so something above it has to load a real one -- this is that something. A write is
 * applied to local state immediately, so the screen that just recorded an answer sees it
 * on the very next render.
 *
 * A FAILED READ is `null`, not `[]` (Ruling 49). This is where it differs from `useProfile`
 * and `useSchedule`, and where it agrees with the other door: `api/telegram.ts` says it
 * outright -- "an empty log and an unreadable one mean opposite things. Collapsing them
 * would price a request as though the student had answered nothing, which is a real number
 * computed from an assumption nobody made" -- and `src/telegram/handle.ts` obeys it by
 * refusing to price. This hook used to `.catch(() => [])`, so the web drew a whole room,
 * gauge and price from a log it had not read: the same student, the same week, two answers
 * depending on which door they came through.
 *
 * `useLowEnergy` falling back to `DEFAULT_SETTINGS` is right and is not this: a missing
 * preference genuinely means "not set, infer it". A missing block log does not mean the
 * student answered nothing.
 *
 * A FAILED write is said out loud rather than dropped. This file used to explain that
 * `useSchedule` could get away with dropping its own -- "the week is rewritten on the next
 * change, so a lost save retries by itself" -- and that reasoning turned out to have a hole
 * in it: it holds for every change except the last one, and the last change is exactly the
 * one a student makes before closing the tab. `useSchedule` now reports its failures too,
 * so the two hooks agree.
 *
 * The argument was always weaker here anyway. A block answer has no next change to ride
 * along on at all: it is a one-shot event, and it is the evidence §8's published accuracy
 * figure is scored against, so losing one silently means the app prints a number derived
 * from data it only thinks it kept. Per the project's own "never silently swallow errors"
 * rule.
 *
 * The optimistic entry stays in local state when the write fails. Rolling it back would
 * erase what the student just said in order to be truthful about storage, which trades one
 * lie for a worse one -- they would see their answer disappear and be told nothing. Saying
 * it did not save, while leaving it on screen, is the honest combination.
 */
export function useBlockLog(repo: Repository): {
  /** The answers, or `null` when they could not be read -- never `[]` standing in for both. */
  blockLog: readonly BlockRecord[] | null
  recordAnswer: (record: BlockRecord) => void
  /** Null while every read and write so far has landed. A sentence a student can act on otherwise. */
  problem: string | null
  /** Asks storage again. A read fails for a dropped connection as readily as a missing table. */
  retry: () => void
} {
  const [blockLog, setBlockLog] = useState<readonly BlockRecord[] | null>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => setAttempt((current) => current + 1), [])

  useEffect(() => {
    let cancelled = false

    repo
      .loadBlockLog()
      .then((loaded) => {
        if (cancelled) return
        setBlockLog(loaded)
        // Only the read's own message is cleared: a failed WRITE is still true, and
        // clearing it here would take a message about live data off the screen.
        setProblem((current) => (current === UNREADABLE ? null : current))
      })
      .catch(() => {
        if (cancelled) return
        setBlockLog(null)
        setProblem(UNREADABLE)
      })

    return () => {
      cancelled = true
    }
  }, [repo, attempt])

  function recordAnswer(record: BlockRecord) {
    // Upserts on `blockId`, matching the repository's own contract (`Repository.recordBlockAnswer`):
    // correcting an answer replaces it in local state rather than stacking a second entry.
    // An unreadable log stays unreadable: one answer is not the log, and pretending it is
    // would be the collapse this hook exists to refuse. The write below still goes out.
    setBlockLog((current) =>
      current === null ? null : [...current.filter((entry) => entry.blockId !== record.blockId), record],
    )

    repo
      .recordBlockAnswer(record)
      // Cleared on success as well as set on failure: a message about a failure that is
      // over is its own kind of dishonesty, and this is the only place that knows the
      // difference.
      .then(() => setProblem(null))
      .catch(() =>
        setProblem(
          'I could not save that answer, so it may not be here next time you open the app.',
        ),
      )
  }

  return { blockLog, recordAnswer, problem, retry }
}
