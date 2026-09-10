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
 */
export function useBlockLog(repo: Repository): {
  blockLog: readonly BlockRecord[]
  recordAnswer: (record: BlockRecord) => void
} {
  const [blockLog, setBlockLog] = useState<readonly BlockRecord[]>([])

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

    repo.recordBlockAnswer(record).catch(() => undefined)
  }

  return { blockLog, recordAnswer }
}
