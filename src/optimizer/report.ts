import { summarise, type EngineParams } from '../engine'
import { ALL_PRESENT, toDayInputs } from './objective'
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
/**
 * What the change bought, in the terms that are still true.
 *
 * Normally that is the worst day. But once a student has bottomed out the floor is
 * pinned at zero and stays there whatever the solver does, so "your worst day goes from
 * 0 to 0" is both useless and faintly insulting to the person it is shown to. Days out
 * of deficit still move, so that is what gets said instead.
 */
function describeGain(result: RebalanceResult, params: EngineParams): string {
  const before = round(result.worstBefore)
  const after = round(result.worstAfter)

  if (after > before) {
    return `Your worst day goes from ${before} to ${after}.`
  }

  const daysBefore = summarise(
    result.before.start,
    toDayInputs(result.before, ALL_PRESENT),
    params,
  ).deficitDays
  const daysAfter = summarise(
    result.schedule.start,
    toDayInputs(result.schedule, ALL_PRESENT),
    params,
  ).deficitDays

  if (daysAfter < daysBefore) {
    const saved = daysBefore - daysAfter
    return `That is ${plural(saved, 'day')} less underwater, though this fortnight is still beyond what rearranging can fix.`
  }

  return 'This fortnight is beyond what rearranging can fix. Something needs to come out of it.'
}

export function describeRebalance(result: RebalanceResult, params: EngineParams): string {
  if (result.moves.length === 0) {
    // "Already the best arrangement" is true but reads as reassurance, and reassurance
    // is the wrong register for someone whose fortnight is underwater. Same finding,
    // opposite meaning: nothing left to move is good news for a healthy week and bad
    // news for an overloaded one, so the two get different sentences.
    const deficitDays = summarise(
      result.schedule.start,
      toDayInputs(result.schedule, ALL_PRESENT),
      params,
    ).deficitDays

    return deficitDays > 0
      ? 'There is nothing left to move. This fortnight is beyond what rearranging can fix — something needs to come out of it.'
      : 'Nothing worth moving. This is already the best arrangement of these commitments.'
  }

  const counts = new Map<MoveKind, number>()
  for (const move of result.moves) {
    counts.set(move.kind, (counts.get(move.kind) ?? 0) + 1)
  }

  const parts: string[] = []
  const moved = counts.get('shiftDay') ?? 0
  const batched = counts.get('batchErrands') ?? 0
  const rested = counts.get('insertRest') ?? 0
  const social = counts.get('insertSocial') ?? 0
  const reordered = counts.get('reorderWithinDay') ?? 0

  if (moved > 0) parts.push(`moved ${plural(moved, 'thing')}`)
  if (batched > 0) parts.push(`batched ${plural(batched, 'errand')}`)
  if (rested > 0) parts.push(`added ${plural(rested, 'rest block')}`)
  if (social > 0) parts.push(`made time to see someone on ${plural(social, 'day')}`)
  if (reordered > 0) parts.push(`reordered ${plural(reordered, 'block')} within its day`)

  return `I ${joinParts(parts)}. ${describeGain(result, params)}`
}

/** §2.1: one tap to undo all of it. Exact rather than reconstructed, because the result
 *  carries the schedule the search started from. */
export function undo(result: RebalanceResult): Schedule {
  return result.before
}
