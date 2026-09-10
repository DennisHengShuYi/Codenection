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
  /**
   * Whether storage has actually answered yet.
   *
   * Reported rather than left to be inferred from an empty list, because "no ladders" and
   * "not asked yet" are different facts and the caller acts on them differently. A browser
   * test caught the difference: on a cold open of a micro-start address the page mounted
   * before this resolved, found nothing to resume, generated a fresh chain and wrote it over
   * the stored one -- throwing away everything the student had done, which is precisely what
   * persisting it was for.
   */
  loaded: boolean
  saveLadder: (ladder: Ladder) => void
  dropLadder: (blockId: string) => void
} {
  const [ladders, setLadders] = useState<readonly Ladder[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    repo
      .loadSettings()
      .catch(() => DEFAULT_SETTINGS)
      .then((saved) => {
        if (cancelled) return

        // Settings written before this feature have no `ladders` at all, and land on the
        // empty array rather than taking the screen down.
        setLadders(saved.ladders ?? [])
        // Set even when the read failed: the defaults ARE the answer in that case, and
        // leaving this false would hold the page on its working state for good.
        setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [repo])

  /**
   * Applies a change to the list and writes the result back.
   *
   * The update runs inside `setLadders` rather than against the `ladders` this render closed
   * over. Two changes in one tick -- a rung ticked twice quickly, or a block completed and
   * its ladder dropped in the same handler -- would otherwise both start from the same stale
   * snapshot and the second would silently undo the first.
   */
  const write = (change: (current: readonly Ladder[]) => readonly Ladder[]) => {
    setLadders((current) => {
      const next = change(current)

      // Read-modify-write against storage rather than against the settings this hook happens
      // to hold: `useProfile` and `useLowEnergy` write the same blob, and starting from a
      // stale copy here would silently drop whichever of them wrote last.
      repo
        .loadSettings()
        .catch(() => DEFAULT_SETTINGS)
        .then((saved) => repo.saveSettings({ ...saved, ladders: next }))
        .catch(() => undefined)

      return next
    })
  }

  return {
    ladders,
    loaded,
    // Upsert on `blockId`. Advancing a rung saves the same ladder again, and appending a
    // second copy would leave two records disagreeing about where the student got to.
    saveLadder: (ladder: Ladder) =>
      write((current) => [...current.filter((existing) => existing.blockId !== ladder.blockId), ladder]),
    dropLadder: (blockId: string) =>
      write((current) => current.filter((existing) => existing.blockId !== blockId)),
  }
}
