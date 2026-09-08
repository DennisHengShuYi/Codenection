import { parseWithRules } from './fallbackParser'
import { parseModelReply } from './schema'
import { MAX_INPUT_LENGTH, type ParseOutcome } from './types'

/**
 * Asks the endpoint, and falls back to rules whenever it cannot.
 *
 * "Cannot" covers far more than an outage: no key configured, running under `vite dev`
 * where /api is not served, a timeout, or a reply that fails validation. Every one of those
 * is an ordinary state rather than an error, and every one has to produce a usable week --
 * §10's instinct that nothing is called live on stage, applied to the one path a student
 * cannot do without.
 */
export async function parseBrainDump(text: string): Promise<ParseOutcome> {
  const trimmed = text.trim()

  // Nothing to do, and no reason to spend a request finding that out.
  if (trimmed === '' || trimmed.length > MAX_INPUT_LENGTH) {
    return { items: [], source: 'fallback' }
  }

  try {
    const response = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: trimmed }),
    })

    if (response.ok) {
      const items = parseModelReply(await response.json())
      if (items !== null) return { items, source: 'model' }
    }
  } catch {
    // A dead network, or no endpoint at all. Falls through to the rules below.
  }

  return { items: parseWithRules(trimmed), source: 'fallback' }
}
