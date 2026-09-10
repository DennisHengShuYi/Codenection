import { askGroq } from '../src/ai/groq'
import { MAX_INPUT_LENGTH, type Calendar } from '../src/ai/types'

/**
 * The server side of the planner, and one of the two places `GROQ_API_KEY` is read — the
 * other is `api/read-photo.ts`. Nothing outside `api/` reads it at all.
 *
 * §10's first constraint is that no API key reaches the browser, because a client-side call
 * leaks it in devtools. That is the whole reason this file exists rather than the client
 * calling Groq directly, and it is why the variable has no `VITE_` prefix -- adding one
 * would publish it into the bundle.
 *
 * With no key configured it answers 503 rather than erroring, because the client treats an
 * unavailable endpoint as an ordinary state and falls back to its rule-based parser. That
 * is the normal path in tests, in CI, and under `vite dev` where /api is not served at all.
 */
/**
 * Declared rather than left to inference, because the two runtimes take different handler
 * signatures and the wrong one fails only once deployed. Edge takes the web-standard
 * Request/Response pair this file is written against.
 *
 * This is deliberately the whole of the deployment configuration. The approved plan called
 * for a `vercel.json`, and building it showed that was the one change able to break a
 * deployment that currently works with none at all -- Vite is detected on its own and `api/`
 * is picked up on its own. A line in the file it describes is the smaller blast radius.
 */
export const config = { runtime: 'edge' }

/**
 * §44: the client says which real day day 0 is, so a stated weekday means something.
 *
 * Validated rather than trusted, like every other value arriving over this boundary:
 * anything can POST here, and this string goes into a prompt. A label longer than a date
 * or a weekday outside 0-6 is not a calendar, it is someone using the prompt as a channel.
 */
const readCalendar = (raw: unknown): Calendar | undefined => {
  if (typeof raw !== 'object' || raw === null) return undefined

  const { today, startWeekday, todayLabel } = raw as Record<string, unknown>
  if (typeof today !== 'number' || !Number.isInteger(today) || today < 0 || today > 365) {
    return undefined
  }
  if (typeof startWeekday !== 'number' || !Number.isInteger(startWeekday)) return undefined
  if (startWeekday < 0 || startWeekday > 6) return undefined

  const label =
    typeof todayLabel === 'string' && todayLabel.length > 0 && todayLabel.length <= 40
      ? todayLabel
      : undefined

  return { today, startWeekday, ...(label === undefined ? {} : { todayLabel: label }) }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return new Response('Planner unavailable', { status: 503 })

  let text: unknown
  let calendar: unknown
  try {
    const body = (await request.json()) as { text?: unknown; calendar?: unknown }
    text = body.text
    calendar = body.calendar
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  // Bounded before it reaches the model. This is user input arriving over the network, and
  // the length cap is what stops one request costing whatever somebody chooses to paste.
  if (typeof text !== 'string' || text.trim() === '' || text.length > MAX_INPUT_LENGTH) {
    return new Response('Bad request', { status: 400 })
  }

  const items = await askGroq(text, apiKey, readCalendar(calendar))
  if (items === null) return new Response('Planner unavailable', { status: 503 })

  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
