/**
 * §4.1's Micro-Start: permission at task level.
 *
 * "You don't have to write the essay. You have to open the document and write the title.
 * Eight minutes." The point is to reduce what somebody is carrying *right now*, so the
 * answer is always one action, never a list -- a stuck person cannot choose from a menu any
 * more than a depleted one can (§5.2).
 *
 * The prompt and the reading are here; the model call is not. `groq.ts` is imported only by
 * files under `api/`, so that nothing in the browser bundle can reach a credential, and
 * keeping this module free of the call is what lets all of it be tested without one.
 */

/** §4.1: a time box under ten minutes. Eight is the spec's own example, and being under
 *  the threshold rather than at it matters -- "ten minutes" reads like a round estimate,
 *  "eight" reads like somebody meant it. */
export const MICRO_START_MINUTES = 8

/** A task title, not an essay. Anything longer is a paste rather than a task. */
export const MAX_TASK_LENGTH = 120

/** Long enough for a real instruction, short enough to read on a lock screen. */
const MAX_ACTION_LENGTH = 200

const shorten = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit - 1)}…`

export function microStartPrompt(task: string): string {
  return [
    `A student is stuck on this task: "${shorten(task.trim(), MAX_TASK_LENGTH)}".`,
    `Reply with ONE concrete first action they could finish in ${MICRO_START_MINUTES} minutes.`,
    'One sentence. No list, no numbering, no preamble, no encouragement.',
    'It must be something physical they can start now, like opening a file or writing a title.',
  ].join(' ')
}

/**
 * The rule-based answer, used whenever the model is unavailable.
 *
 * This is not a degraded path in practice: with no key configured -- which is CI, the demo,
 * and any deployment before its variables are set -- it is the only path, so it has to be
 * a real answer rather than an apology.
 */
function fallbackAction(task: string): string {
  const named = shorten(task.trim(), MAX_TASK_LENGTH)

  return `Open ${named} and spend ${MICRO_START_MINUTES} minutes writing the first line — a title, a heading, anything. Then stop.`
}

/** Strips numbering and bullets so the reply reads as a sentence rather than as item one
 *  of a plan the student did not ask for. */
const stripMarker = (line: string): string => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()

export function microStartFrom(
  task: string,
  modelReply: string | null,
): { action: string; source: 'model' | 'fallback' } {
  const first = (modelReply ?? '')
    .split('\n')
    .map(stripMarker)
    .find((line) => line !== '')

  if (first === undefined) return { action: fallbackAction(task), source: 'fallback' }

  // Only the first line survives, whatever the model returned. §4.1's "one action, never a
  // list" is the product decision, not a request the model is trusted to have honoured.
  return { action: shorten(first, MAX_ACTION_LENGTH), source: 'model' }
}
