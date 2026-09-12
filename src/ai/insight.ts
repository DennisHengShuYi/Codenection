import { parseInsightReply } from './insightSchema'

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

  try {
    const response = await fetch('/api/insight', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines }),
    })

    if (!response.ok) return lines

    return parseInsightReply((await response.json()) as unknown, lines.length) ?? lines
  } catch {
    return lines
  }
}
