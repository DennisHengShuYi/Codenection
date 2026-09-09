import { MAX_IMAGE_BYTES } from '../src/ai/types'
import { askVision } from '../src/ai/vision'

/** Declared rather than inferred, matching api/plan.ts: the two runtimes take different
 *  handler signatures and the wrong one fails only once deployed. */
export const config = { runtime: 'edge' }

/** A data URL for one of the types the picker accepts. Checked here as well as in the
 *  browser, because the browser check is a courtesy and this one is the boundary. */
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp|heic);base64,[A-Za-z0-9+/=]*$/

/**
 * A base64 payload is about four thirds of the bytes it encodes, plus the prefix. This
 * compares like with like against the browser's own cap.
 */
const MAX_PAYLOAD_CHARS = Math.ceil(MAX_IMAGE_BYTES * 1.4)

/**
 * The second place `GROQ_API_KEY` is read, and the second thing on the far side of §10's
 * key boundary.
 *
 * With no key it answers 503, and unlike the planner the client has nothing to fall back
 * to -- so that 503 becomes a sentence explaining that reading a photo needs the model.
 * There is no honest rule-based substitute for reading an image, and inventing one would
 * mean inventing tasks that are not in the picture: precisely the failure §1.4's
 * never-import-silently rule exists to prevent.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return new Response('Photo reading unavailable', { status: 503 })

  let image: unknown
  try {
    image = ((await request.json()) as { image?: unknown }).image
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  if (typeof image !== 'string' || !IMAGE_DATA_URL.test(image)) {
    return new Response('Bad request', { status: 400 })
  }

  // Bounded before it reaches the model. This is user input arriving over the network, and
  // the cap is what stops one request costing whatever somebody chooses to send.
  if (image.length > MAX_PAYLOAD_CHARS) {
    return new Response('Image too large', { status: 413 })
  }

  const items = await askVision(image, apiKey)
  if (items === null) return new Response('Photo reading unavailable', { status: 503 })

  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
