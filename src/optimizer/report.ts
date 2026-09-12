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

/**
 * One phrase per move kind, in both the tense that reports and the tense that proposes.
 *
 * Two lists would be two chances for the preview and the report to disagree about what the
 * same solve did -- and the preview's whole job is to be the thing the report will later
 * confirm. The order is the order the sentence reads in, and is deliberately the order the
 * past-tense sentence has always used.
 */
const PHRASES: readonly {
  readonly kind: MoveKind
  readonly did: string
  readonly would: string
  readonly object: (count: number) => string
}[] = [
  { kind: 'shiftDay', did: 'moved', would: 'move', object: (n) => plural(n, 'thing') },
  { kind: 'batchErrands', did: 'batched', would: 'batch', object: (n) => plural(n, 'errand') },
  { kind: 'insertRest', did: 'added', would: 'add', object: (n) => plural(n, 'rest block') },
  {
    kind: 'insertSocial',
    did: 'made',
    would: 'make',
    object: (n) => `time to see someone on ${plural(n, 'day')}`,
  },
  {
    kind: 'reorderWithinDay',
    did: 'reordered',
    would: 'reorder',
    object: (n) => `${plural(n, 'block')} within its day`,
  },
  {
    // First in the sentence would be wrong -- this is housekeeping, not the point of the
    // rebalance -- but it must be in it. A block that changed day without being mentioned is
    // exactly the reshuffle §2.1 says a student will not act on because they cannot see it.
    kind: 'clearClash',
    did: 'took',
    would: 'take',
    object: (n) => `${plural(n, 'block')} off something it was sitting on`,
  },
]

/** The "moved 20 things, batched 3 errands and ..." half, in whichever tense was asked for. */
function movesClause(result: RebalanceResult, tense: 'did' | 'would'): string {
  const counts = new Map<MoveKind, number>()
  for (const move of result.moves) {
    counts.set(move.kind, (counts.get(move.kind) ?? 0) + 1)
  }

  const parts = PHRASES.flatMap((phrase) => {
    const count = counts.get(phrase.kind) ?? 0
    return count === 0 ? [] : [`${phrase[tense]} ${phrase.object(count)}`]
  })

  return joinParts(parts)
}

/**
 * What to say when the search found nothing.
 *
 * "Already the best arrangement" is true but reads as reassurance, and reassurance is the
 * wrong register for someone whose fortnight is underwater. Same finding, opposite meaning:
 * nothing left to move is good news for a healthy week and bad news for an overloaded one,
 * so the two get different sentences.
 *
 * Shared by both tenses because it is in neither: there is no move to report and none to
 * propose, so the sentence is about the week rather than about the solver.
 */
function nothingToMove(result: RebalanceResult, params: EngineParams): string {
  const deficitDays = summarise(
    result.schedule.start,
    toDayInputs(result.schedule, ALL_PRESENT),
    params,
  ).deficitDays

  return deficitDays > 0
    ? 'There is nothing left to move. This fortnight is beyond what rearranging can fix — something needs to come out of it.'
    : 'Nothing worth moving. This is already the best arrangement of these commitments.'
}

export function describeRebalance(result: RebalanceResult, params: EngineParams): string {
  if (result.moves.length === 0) return nothingToMove(result, params)

  return `I ${movesClause(result, 'did')}. ${describeGain(result, params)}`
}

/**
 * The same finding, before it has happened.
 *
 * §2.1's rule that the app never says "optimised" cuts both ways: a preview that borrowed
 * the past-tense sentence would be claiming a change the student has not agreed to yet. The
 * counts and the gain are identical -- only the verb moves.
 */
export function describeProposal(result: RebalanceResult, params: EngineParams): string {
  if (result.moves.length === 0) return nothingToMove(result, params)

  return `I'd ${movesClause(result, 'would')}. ${describeGain(result, params)}`
}

/** §2.1: one tap to undo all of it. Exact rather than reconstructed, because the result
 *  carries the schedule the search started from. */
export function undo(result: RebalanceResult): Schedule {
  return result.before
}
