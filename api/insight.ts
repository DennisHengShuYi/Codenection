import { MAX_INSIGHT_LINE, MAX_INSIGHT_LINES } from '../src/ai/insightSchema'
import { askInsight } from '../src/ai/insightWriter'

/** Declared rather than inferred, matching the other four: the two runtimes take different
 *  handler signatures and the wrong one fails only once deployed. */
export const config = { runtime: 'edge' }

/**
 * The fifth place `GROQ_API_KEY` is read. Nothing outside `api/` reads it.
 *
 * With no key it answers 503 and the sheet shows the computed wording, which is the normal
 * path in CI, in the tests, and under `vite dev` where /api is not served at all. That
 * fallback is a genuine equal: the facts are the same either way, and what the student loses
 * is only that they are phrased by a template.
 *
 * Like `api/micro-start.ts`, this spends the Groq budget unauthenticated with no
 * server-side quota -- stated here in place rather than left to be discovered.
 *
 * Every field is bounded before it reaches a prompt. These lines were written by this app's
 * own domain code, but the endpoint is public and cannot tell one caller from another, so
 * they arrive untrusted like anything else.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return new Response('Insight unavailable', { status: 503 })

  let body: { lines?: unknown }
  try {
    body = (await request.json()) as { lines?: unknown }
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const { lines } = body

  if (!Array.isArray(lines) || lines.length === 0 || lines.length > MAX_INSIGHT_LINES) {
    return new Response('Bad request', { status: 400 })
  }

  // Every line, not most of them. Filtering would change the count the reply is checked
  // against, and that count is the one thing keeping the model from adding a claim of its
  // own -- a request half-rejected would be a guard quietly loosened.
  const clean = lines.every(
    (line: unknown): line is string =>
      typeof line === 'string' && line.trim() !== '' && line.length <= MAX_INSIGHT_LINE,
  )
  if (!clean) return new Response('Bad request', { status: 400 })

  const phrased = await askInsight({ lines: lines as readonly string[] }, apiKey)

  if (phrased === null) return new Response('Insight unavailable', { status: 503 })

  return new Response(JSON.stringify({ lines: phrased }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
