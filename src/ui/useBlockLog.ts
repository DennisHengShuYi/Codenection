import { useEffect, useState } from 'react'
import type { Repository } from '../data'
import type { BlockRecord } from '../domain/blockLog'

/**
 * Reads §8b's durable block log and lets the screen record a new answer without waiting on
 * a reload to see it.
 *
 * Ruling 12: `RoomShell` makes `blockLog` a required prop rather than defaulting to `[]`,
 * so something above it has to load a real one -- this is that something, shaped like
 * `useProfile` and `useSchedule`: unreachable storage keeps the app working on an empty log
 * rather than rejecting, and a write is applied to local state immediately so the screen
 * that just recorded an answer sees it on the very next render.
 *
 * A FAILED write is not treated the same way `useSchedule` treats its own. There, dropping
 * the error is defensible and says so: the week is rewritten on the next change, so a lost
 * save retries by itself. A block answer has no next change to ride along on. It is a
 * one-shot event, and it is the evidence §8's published accuracy figure is scored against,
 * so losing one silently means the app prints a number derived from data it only thinks it
 * kept. `problem` is that failure said out loud, per the project's own "never silently
 * swallow errors" rule.
 *
 * The optimistic entry stays in local state when the write fails. Rolling it back would
 * erase what the student just said in order to be truthful about storage, which trades one
 * lie for a worse one -- they would see their answer disappear and be told nothing. Saying
 * it did not save, while leaving it on screen, is the honest combination.
 */
export function useBlockLog(repo: Repository): {
  blockLog: readonly BlockRecord[]
  recordAnswer: (record: BlockRecord) => void
  /** Null while every write so far has landed. A sentence a student can act on otherwise. */
  problem: string | null
} {
  const [blockLog, setBlockLog] = useState<readonly BlockRecord[]>([])
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    repo
      .loadBlockLog()
      .catch(() => [])
      .then((loaded) => {
        if (!cancelled) setBlockLog(loaded)
      })

    return () => {
      cancelled = true
    }
  }, [repo])

  function recordAnswer(record: BlockRecord) {
    // Upserts on `blockId`, matching the repository's own contract (`Repository.recordBlockAnswer`):
    // correcting an answer replaces it in local state rather than stacking a second entry.
    setBlockLog((current) => [
      ...current.filter((entry) => entry.blockId !== record.blockId),
      record,
    ])

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

  return { blockLog, recordAnswer, problem }
}
