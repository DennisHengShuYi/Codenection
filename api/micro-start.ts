import { BLOCK_KINDS } from '../src/engine'
import { askLadder, type LadderBrief } from '../src/ai/ladderWriter'
import { MAX_ACTION_LENGTH, MAX_RUNGS } from '../src/domain/ladder'

/** Declared rather than inferred, matching api/plan.ts and api/draft.ts: the two runtimes
 *  take different handler signatures and the wrong one fails only once deployed. */
export const config = { runtime: 'edge' }

/** A block title, not a document. */
const MAX_TITLE_LENGTH = 200

/** `sleep` never reaches the grid as a block (see `BLOCK_KINDS`'s docstring), so the endpoint
 *  accepts exactly what a block can carry and nothing else. */
const KINDS: readonly string[] = BLOCK_KINDS

/**
 * The fourth and last place `GROQ_API_KEY` is read. Nothing outside `api/` reads it.
 *
 * With no key it answers 503 and the client falls back to `ruleLadder`, which is a genuine
 * equal rather than an apology -- the chain for each kind of work is written out and needs
 * no model. That is the normal path in CI, in tests, and under `vite dev` where /api is not
 * served at all.
 *
 * Every field is bounded before it reaches a prompt. A block title is text the student typed
 * or a model produced, so it arrives here untrusted whichever door it came through, and it
 * does not become trusted for having passed through the app first.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return new Response('Micro-start unavailable', { status: 503 })

  let body: Partial<LadderBrief>
  try {
    body = (await request.json()) as Partial<LadderBrief>
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const { what, kind, hours, rejected, soFar } = body

  if (typeof what !== 'string' || what.trim() === '' || what.length > MAX_TITLE_LENGTH) {
    return new Response('Bad request', { status: 400 })
  }
  if (typeof kind !== 'string' || !KINDS.includes(kind)) {
    return new Response('Bad request', { status: 400 })
  }
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return new Response('Bad request', { status: 400 })
  }

  // Optional, and bounded on the same terms as everything else here: these are strings the
  // app sent, but the endpoint is public and cannot tell one caller from another.
  const cleanRejected =
    typeof rejected === 'string' && rejected.length > 0 && rejected.length <= MAX_ACTION_LENGTH
      ? rejected
      : undefined

  const cleanSoFar =
    Array.isArray(soFar) && soFar.length <= MAX_RUNGS
      ? soFar.filter(
          (line): line is string =>
            typeof line === 'string' && line.length > 0 && line.length <= MAX_ACTION_LENGTH,
        )
      : undefined

  const steps = await askLadder(
    {
      what,
      kind,
      hours,
      ...(cleanRejected === undefined ? {} : { rejected: cleanRejected }),
      ...(cleanSoFar === undefined ? {} : { soFar: cleanSoFar }),
    },
    apiKey,
  )

  if (steps === null) return new Response('Micro-start unavailable', { status: 503 })

  return new Response(JSON.stringify({ steps }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
