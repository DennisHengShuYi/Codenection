import type { MoveKind, RebalanceResult, Schedule } from './types'

const round = (value: number): number => Math.round(value)

/** Joins with commas and a final "and", so the sentence reads like a person wrote it. */
function joinParts(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : 's'}`

/**
 * §2.1: never "optimised". Always specific -- what moved, what was batched, what rest was
 * added, and what the worst day actually does as a result.
 *
 * An unexplained reshuffle is not something a student will act on, and "optimised" is a
 * claim the app cannot support to the person who has to live with the week. Where the
 * search found nothing, this says so plainly rather than dressing up a no-op.
 */
export function describeRebalance(result: RebalanceResult): string {
  if (result.moves.length === 0) {
    return 'Nothing worth moving. This is already the best arrangement of these commitments.'
  }

  const counts = new Map<MoveKind, number>()
  for (const move of result.moves) {
    counts.set(move.kind, (counts.get(move.kind) ?? 0) + 1)
  }

  const parts: string[] = []
  const moved = counts.get('shiftDay') ?? 0
  const batched = counts.get('batchErrands') ?? 0
  const rested = counts.get('insertRest') ?? 0
  const reordered = counts.get('reorderWithinDay') ?? 0

  if (moved > 0) parts.push(`moved ${plural(moved, 'thing')}`)
  if (batched > 0) parts.push(`batched ${plural(batched, 'errand')}`)
  if (rested > 0) parts.push(`added ${plural(rested, 'rest block')}`)
  if (reordered > 0) parts.push(`reordered ${plural(reordered, 'block')} within its day`)

  return (
    `I ${joinParts(parts)}. ` +
    `Your worst day goes from ${round(result.worstBefore)} to ${round(result.worstAfter)}.`
  )
}

/** §2.1: one tap to undo all of it. Exact rather than reconstructed, because the result
 *  carries the schedule the search started from. */
export function undo(result: RebalanceResult): Schedule {
  return result.before
}
