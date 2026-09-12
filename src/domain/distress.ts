import type { EnergyPoint } from './energyHistory'

/**
 * The reported-energy band at or below which a day counts toward the run.
 *
 * 30 is the check-in's own "Low" answer -- the second of its five bands, below "Getting by".
 * Not the bottom one: waiting for "Running on empty" would mean only ever noticing the very
 * worst case, and the point is to notice before that.
 */
export const DISTRESS_AT_OR_BELOW = 30

/**
 * How many consecutive days at that level before the app says anything.
 *
 * Four, and the number is doing real work in both directions. Fewer and this fires on a bad
 * week, which everybody has -- and a message this heavy arriving every few weeks is one a
 * student learns to dismiss, which is worse than not having it. More and the app spends a
 * fortnight offering to move blocks around at somebody who needs something else entirely.
 *
 * The same reasoning as `realityCheck.MIN_SAMPLES`: say nothing until there is enough to
 * say it honestly.
 */
export const DISTRESS_RUN = 4

/**
 * Whether the app should stop treating this as a scheduling problem.
 *
 * The distinction it is drawing is between a student who is *overloaded* and one who is
 * *unwell*. Everything else in this app answers the first: move a block, take a rest,
 * decline a request, rebalance the fortnight. Those are good answers to too much work and
 * useless answers to depression, and the schedule looks the same either way -- so a
 * schedule can never tell them apart.
 *
 * What can be read honestly is that the student has said, four days running and in their
 * own words, that they are at the bottom. That is not a diagnosis and nothing here treats
 * it as one; it is the app noticing that its own advice has stopped being the relevant kind
 * of help.
 *
 * Read off `reported` energy rather than modelled reserves, deliberately. Reserves are the
 * app's own projection, and a claim this serious must not rest on the app's guess about
 * somebody -- only on what they actually told it.
 *
 * The run must be *current*. A student who had a terrible fortnight and has since recovered
 * does not need to be handed this; that would be the app failing to notice they got better.
 */
export function isDistressed(history: readonly EnergyPoint[]): boolean {
  if (history.length < DISTRESS_RUN) return false

  // The tail only. `energyHistory` is oldest-first, so this is the most recent run.
  const run = history.slice(-DISTRESS_RUN)

  if (!run.every((point) => point.value <= DISTRESS_AT_OR_BELOW)) return false

  return isConsecutive(run)
}

/** One day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Whether these answers are on consecutive calendar days.
 *
 * `energyHistory` keeps only the days that were answered and drops the silence between
 * them, so four low answers scattered across a fortnight reached the check looking exactly
 * like four low days running. The card then told a student they had said they were running
 * low four days in a row when they had not -- and the whole standing of this card is that it
 * only ever repeats what the student actually said.
 *
 * Skipped days now break the run, which errs toward not firing. That is the right direction
 * for a message this heavy, and it matches how a single good day is already treated: the
 * app would rather stay quiet than make a claim it cannot support.
 *
 * Compared as UTC midnights, which is safe here in a way a *clock* read would not be: these
 * are two `YYYY-MM-DD` strings being measured against each other, not a moment being turned
 * into somebody's today. §9's rule is about the latter, and `domain/calendar` remains the
 * only place that conversion happens.
 */
function isConsecutive(run: readonly EnergyPoint[]): boolean {
  return run.every((point, index) => {
    if (index === 0) return true

    const previous = run[index - 1]
    if (previous === undefined) return false

    const gap = Date.parse(`${point.date}T00:00:00Z`) - Date.parse(`${previous.date}T00:00:00Z`)

    // NaN from an unparseable date fails this comparison, which is the answer we want: a
    // date this function cannot read is not a day it can vouch for being next in a run.
    return gap === DAY_MS
  })
}
