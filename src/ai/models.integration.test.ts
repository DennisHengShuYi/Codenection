import { describe, expect, it } from 'vitest'
import { GROQ_TEXT_MODEL, GROQ_VISION_MODEL } from './models'

/**
 * The one thing the ordinary suite structurally cannot tell you: whether the models this
 * app names still exist.
 *
 * Every other test in `src/ai` stubs `fetch`, which is right -- they are about how a reply
 * is validated, not about Groq. But it means a model id can be retired by the provider and
 * the whole suite stays green while all three AI features are dead in production. That is
 * exactly what happened: `meta-llama/llama-4-scout-17b-16e-instruct` returned
 * `model_not_found`, photo import showed "reading photos needs the model to be set up" on
 * a perfectly readable timetable, and the planner and the drafter fell silently back to
 * their rule-based paths while appearing to work.
 *
 * A test asserting the constant equals a hard-coded string would have caught none of that
 * -- it would have agreed with the dead id. Only a real call can answer the question, so
 * this file makes one.
 *
 * ## Running it
 *
 *     npm run test:integration
 *
 * Skipped unless GROQ_API_KEY is set, so it never runs in CI (no secrets there, by design)
 * and never under `npm test`, which blanks the variable precisely so the ordinary suite
 * cannot spend money.
 *
 * These calls are billable. They are deliberately the smallest ones that can answer the
 * question: a one-word text reply, and an 8x8 image.
 */
const apiKey = process.env.GROQ_API_KEY ?? ''
const describeIfKeyed = apiKey === '' ? describe.skip : describe

/**
 * A valid 8x8 PNG. The question is whether the endpoint accepts image content at all,
 * which needs a real image but not a large one -- and not a 1x1 either: Groq answers that
 * with "Image must have at least 2 pixels in each dimension", which is a fact about the
 * fixture rather than about the model, and would fail this test for the wrong reason.
 */
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGM4gQMwDC0JAJwulgGh6TLjAAAAAElFTkSuQmCC'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

async function ask(model: string, content: unknown): Promise<Response> {
  return fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_completion_tokens: 16,
      messages: [{ role: 'user', content }],
    }),
  })
}

/**
 * Groq answers a retired or unreachable id with 404 `model_not_found`, which is the
 * failure this file exists to surface -- reported with the message rather than as a bare
 * status, because the message names the model and is what makes the fix obvious.
 *
 * A 503 "over capacity" reads the same way and is not our bug, but it is deliberately not
 * tolerated here either: if the only image-capable model on the key is unavailable, photo
 * import is down for students whatever the reason, and a test that passed anyway would be
 * telling us something we cannot act on.
 */
async function reasonFor(response: Response): Promise<string> {
  const body = (await response.json()) as { error?: { message?: string } }
  return `${response.status} ${body.error?.message ?? ''}`
}

describeIfKeyed('the models this app names', () => {
  it('serves the text model the planner and the drafter use', async () => {
    const response = await ask(GROQ_TEXT_MODEL, 'Reply with the single word: ok')

    expect(response.ok ? 'ok' : await reasonFor(response)).toBe('ok')
  })

  it('serves the vision model, and that model accepts an image', async () => {
    const response = await ask(GROQ_VISION_MODEL, [
      { type: 'text', text: 'Reply with the single word: ok' },
      { type: 'image_url', image_url: { url: PIXEL } },
    ])

    // Both failures this catches are 4xx with a message: a retired id, and a model that
    // exists but rejects multimodal content ("messages[0].content must be a string"). The
    // second is the one worth naming -- most of Groq's catalogue is text-only, so a
    // careless swap of this constant fails here rather than on a student's timetable.
    expect(response.ok ? 'ok' : await reasonFor(response)).toBe('ok')
  })
})
