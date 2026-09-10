import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type Repository } from '../data'
import type { Ladder } from '../domain/ladder'

/**
 * Reads the stored ladders and writes them back as the student moves through one.
 *
 * Shaped exactly like `useLowEnergy`, including the failure behaviour: unreachable storage
 * keeps the empty default rather than rejecting, and a change is applied on screen whether
 * or not it persists. A student who ticks a step must see the next one even if the write
 * fails -- the alternative is a page that appears frozen at the moment they finally moved.
 */
export function useLadders(repo: Repository): {
  ladders: readonly Ladder[]
  saveLadder: (ladder: Ladder) => void
  dropLadder: (blockId: string) => void
} {
  const [ladders, setLadders] = useState<readonly Ladder[]>([])

  useEffect(() => {
    let cancelled = false

    repo
      .loadSettings()
      .catch(() => DEFAULT_SETTINGS)
      .then((saved) => {
        // Settings written before this feature have no `ladders` at all, and land on the
        // empty array rather than taking the screen down.
        if (!cancelled) setLadders(saved.ladders ?? [])
      })

    return () => {
      cancelled = true
    }
  }, [repo])

  const write = (next: readonly Ladder[]) => {
    setLadders(next)

    // Read-modify-write against storage rather than against the settings this hook happens
    // to hold: `useProfile` and `useLowEnergy` write the same blob, and starting from a
    // stale copy here would silently drop whichever of them wrote last.
    repo
      .loadSettings()
      .catch(() => DEFAULT_SETTINGS)
      .then((saved) => repo.saveSettings({ ...saved, ladders: next }))
      .catch(() => undefined)
  }

  return {
    ladders,
    // Upsert on `blockId`. Advancing a rung saves the same ladder again, and appending a
    // second copy would leave two records disagreeing about where the student got to.
    saveLadder: (ladder: Ladder) =>
      write([...ladders.filter((existing) => existing.blockId !== ladder.blockId), ladder]),
    dropLadder: (blockId: string) => write(ladders.filter((existing) => existing.blockId !== blockId)),
  }
}
