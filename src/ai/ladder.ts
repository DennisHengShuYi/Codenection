import { currentRung, isComplete, replaceCurrent, ruleLadder, type Ladder, type Rung } from '../domain/ladder'
import type { ScheduledItem } from '../optimizer'
import { parseLadderReply } from './ladderSchema'

export interface LadderOutcome {
  readonly ladder: Ladder
  readonly source: 'model' | 'fallback'
}

/**
 * Everything the endpoint is sent about a block, and nothing else.
 *
 * Not the week, not the reserves, not the student. Deliberately mirrors `briefFor` in
 * `drafts.ts`: a call that breaks one task into first moves has no use for the rest and no
 * business seeing it.
 *
 * Protected rest is sent as `rest` for the same reason `ruleLadder` treats it that way -- a
 * restorative coffee the optimizer has protected must not be handed a chain that asks the
 * student to get through it.
 */
const briefFor = (item: ScheduledItem) => ({
  what: item.title,
  kind: item.protectedRest ? 'rest' : item.kind,
  hours: item.hours,
})

/**
 * How long the browser waits for a chain before taking the one it already has.
 *
 * Longer than `ladderWriter`'s eight-second bound on the Groq call, deliberately: that bound
 * is inside the function, so cutting the browser off first would abandon a request the
 * server was about to answer. This is the outer limit on the whole round trip.
 *
 * It exists because a stalled connection never rejects. Every *answer* already fell back --
 * a refusal, a 503, a body that is not JSON -- but a request that simply hangs left the
 * promise unsettled, `MicroStartPage` on "Working out where to start." and a student who
 * cannot begin a task reading a sentence about not being able to begin it. Waiting
 * indefinitely for the better half of an either/or is the wrong trade when the other half is
 * written out in the domain and needs no network at all.
 */
export const LADDER_REQUEST_TIMEOUT_MS = 10_000

const askEndpoint = async (payload: object): Promise<Rung[] | null> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LADDER_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch('/api/micro-start', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) return null

    return parseLadderReply((await response.json()) as unknown)
  } catch {
    // No endpoint, no network, a body that is not JSON, or the abort above. Every one of
    // them is the same answer to the caller, and none of them is an error a stuck student
    // needs to read.
    return null
  } finally {
    // Cleared whichever way this ended, so a resolved request does not leave a timer holding
    // the process open in tests or firing an abort at a controller nobody is listening to.
    clearTimeout(timeout)
  }
}

/**
 * The chain for this block: the model's if it can be had, the rules' otherwise.
 *
 * Like the drafter and unlike photo import, the fallback here is a genuine equal rather than
 * an apology -- the chain for each kind of work is written out in the domain and needs no
 * model at all. So this works with no key configured, and what the student loses is that the
 * steps name their actual task rather than their kind of task.
 */
export async function buildLadder(item: ScheduledItem): Promise<LadderOutcome> {
  const rungs = await askEndpoint(briefFor(item))

  if (rungs === null) return { ladder: ruleLadder(item), source: 'fallback' }

  return { ladder: { blockId: item.id, rungs, done: 0, fromModel: true }, source: 'model' }
}

/**
 * "That one doesn't fit": one replacement rung, in place.
 *
 * Returns the ladder unchanged when there is no model, rather than swapping in the rule rung
 * that is already on screen. A button that visibly does nothing is worse than one that
 * quietly declines -- and the caller offers this only when a model chain was received, so
 * this path is the race, not the normal case.
 */
export async function replaceRung(item: ScheduledItem, ladder: Ladder): Promise<Ladder> {
  const rejected = currentRung(ladder)
  if (rejected === null || isComplete(ladder)) return ladder

  const rungs = await askEndpoint({
    ...briefFor(item),
    rejected: rejected.action,
    soFar: ladder.rungs.slice(0, ladder.done).map((rung) => rung.action),
  })

  const replacement = rungs?.[0]
  if (replacement === undefined) return ladder

  return replaceCurrent(ladder, replacement)
}
