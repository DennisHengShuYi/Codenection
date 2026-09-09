import { askWriter, type DraftBrief } from '../src/ai/writer'

/** Declared rather than inferred, matching api/plan.ts: the two runtimes take different
 *  handler signatures and the wrong one fails only once deployed. */
export const config = { runtime: 'edge' }

/** A request title, not a document. */
const MAX_WHAT_LENGTH = 1000

/**
 * The third and last place `GROQ_API_KEY` is read.
 *
 * With no key it answers 503, and the client falls back to templates that are a genuine
 * equal rather than an apology -- a decline can honestly be written by rules, because the
 * app already knows what was asked and what it would cost.
 *
 * Nothing here sends a message. §2.3 rejected messaging integration outright, so this
 * endpoint writes words and hands them back; the student sends them.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return new Response('Drafting unavailable', { status: 503 })

  let body: Partial<DraftBrief>
  try {
    body = (await request.json()) as Partial<DraftBrief>
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  // Bounded before it reaches the model: user input arriving over the network.
  if (typeof body.what !== 'string' || body.what.trim() === '' || body.what.length > MAX_WHAT_LENGTH) {
    return new Response('Bad request', { status: 400 })
  }

  const drafts = await askWriter(
    {
      what: body.what,
      hours: typeof body.hours === 'number' ? body.hours : 1,
      evenings: typeof body.evenings === 'number' ? body.evenings : 0,
      deficitDay: typeof body.deficitDay === 'number' ? body.deficitDay : null,
      absorbable: body.absorbable === true,
    },
    apiKey,
  )

  if (drafts === null) return new Response('Drafting unavailable', { status: 503 })

  return new Response(JSON.stringify({ drafts }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
