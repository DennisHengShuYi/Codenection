import { parseInsightReply } from './insightSchema'

/**
 * How long the browser waits before keeping the wording it already has.
 *
 * Longer than `insightWriter`'s eight-second bound on the Groq call, deliberately: that
 * bound is inside the function, so cutting the browser off first would abandon a request the
 * server was about to answer. This is the outer limit on the whole round trip, and it exists
 * because a stalled connection never rejects -- every *answer* already falls back, but a
 * request that simply hangs would leave the promise unsettled and a `setState` free to land
 * minutes later, rewriting a block the student has long since read.
 */
export const INSIGHT_REQUEST_TIMEOUT_MS = 10_000

/**
 * The Reserves sheet's insight block, phrased by the model where there is one.
 *
 * Returns the computed lines unchanged on every failure -- no endpoint, no key, no network,
 * a reply that added a claim or dropped a warning. Unlike photo import, that fallback is not
 * a degraded mode: the facts are identical either way and were computed before this was
 * called, so what a student loses is a warmer sentence, never a reading.
 *
 * Deliberately returns the lines rather than a null the caller has to remember to handle.
 * The caller renders a block that must never be empty, and an API that can hand it nothing
 * is an API that will eventually hand it nothing.
 */
export async function phraseInsight(lines: readonly string[]): Promise<readonly string[]> {
  if (lines.length === 0) return lines

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), INSIGHT_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch('/api/insight', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines }),
    })

    if (!response.ok) return lines

    return parseInsightReply((await response.json()) as unknown, lines.length) ?? lines
  } catch {
    // A refusal, no endpoint, no network, a body that is not JSON, or the abort above. Every
    // one of them is the same answer: the reading the student already has.
    return lines
  } finally {
    // Cleared whichever way this ended, so a resolved request does not leave a timer holding
    // the process open in tests or firing an abort at a controller nobody is listening to.
    clearTimeout(timeout)
  }
}
