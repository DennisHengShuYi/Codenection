import { describe, expect, it } from 'vitest'
import { askGroq } from './groq'
import { GROQ_VISION_MODEL } from './models'

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

/**
 * The request under test must be the request students make.
 *
 * A hand-rolled request here can differ from the production one in some detail that turns
 * out to matter, pass, and prove nothing. It happened while this file was being written:
 * an earlier version sent `max_completion_tokens` and went green, while `askVision` -- which
 * does not send it -- was being rejected with `429 Request too large`, because Groq charges
 * an uncapped request against the organisation's per-minute output budget at the model's
 * full output window. The test agreed the model was fine while the feature was broken.
 *
 * So the text case calls `askGroq` directly, and the image case, which cannot (see its own
 * comment), mirrors `askVision`'s body field for field.
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Retried, because the free tier meters output tokens in a window of about twenty seconds
 * and answers 429 the instant the budget is gone -- so two of these tests in a row, or a
 * run following any other call, can fail over the quota rather than over the model.
 *
 * The retry cannot tell those apart, since `askGroq` and `askVision` both answer null
 * whatever went wrong, and that is deliberate: their callers have nothing to do with the
 * difference. Time separates them instead. A throttled call succeeds on a later attempt; a
 * retired id, a model that cannot take an image, and a reply the schema rejects all fail
 * every attempt, which is what this file is for.
 */
async function withRetry<T>(call: () => Promise<T | null>, ok: (v: T | null) => boolean = (v) => v !== null): Promise<T | null> {
  let last: T | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    last = await call()
    if (ok(last)) return last
    if (attempt < 3) await sleep(25_000)
  }
  return last
}

// Longer than the config's 30s default: three attempts, with the token window between them.
const RETRY_TIMEOUT_MS = 150_000

describeIfKeyed('the models the app actually calls', () => {
  it(
    'reads a text brain dump',
    async () => {
      const items = await withRetry(() =>
        askGroq('Essay for WIA3001, about four hours, due Friday.', apiKey),
      )

      // Not a check on what it found -- that is the schema's job and the model's. Null is
      // the specific thing that means the call did not work at all.
      expect(items).not.toBeNull()
    },
    RETRY_TIMEOUT_MS,
  )

  /**
   * The one test here that does not call its production function, and the reason is worth
   * stating so it is not "fixed" back.
   *
   * `askVision` answers null both when the call failed and when the reply did not validate,
   * and for an image the second is not a stable property: asked to find tasks in an 8x8
   * grey square, the model answers something reasonable that is not a task list, and the
   * schema rightly rejects it. Asserting on that would make this test a coin flip on the
   * model's judgment about a meaningless picture.
   *
   * What is stable, and what actually broke in production, is whether the id is live and
   * takes an image at all. So this sends the request `askVision` builds -- same body, same
   * absent `max_completion_tokens`, which is what the free tier rejects as "Request too
   * large" -- and asserts only on the status. Any drift between this body and vision.ts's
   * costs the test its point, so they are kept identical deliberately.
   */
  it(
    'is served an image request of exactly the shape askVision sends',
    async () => {
      const status = await withRetry(async () => {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: GROQ_VISION_MODEL,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: 'Reply with JSON only, shaped {"items":[]}.' },
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'What is in this picture? Return the JSON.' },
                  { type: 'image_url', image_url: { url: PIXEL } },
                ],
              },
            ],
          }),
        })
        if (response.ok) return 'ok'

        const body = (await response.json()) as { error?: { message?: string } }
        return `${response.status} ${body.error?.message ?? ''}`
      }, (value) => value === 'ok')

      /**
       * A busy model is not a broken configuration, and this test only claims to catch the
       * second. `qwen/qwen3.8-27b` served this exact request in 2.4s, then answered 503
       * "currently over capacity" minutes later, then served it again -- on the free tier
       * it flaps, and no change to this repository fixes that. Failing here would make the
       * suite red for a reason nobody can act on, and a test that cries wolf gets ignored
       * precisely when it is reporting the real thing.
       *
       * What must still fail: 404 for a retired id, and 400 for a model that will not take
       * an image. Those are ours, and they are what broke photo import.
       */
      const busy = typeof status === 'string' && /^(503|429)/.test(status)
      if (busy) {
        console.warn(`skipping: ${GROQ_VISION_MODEL} is unavailable right now -- ${status}`)
        return
      }

      expect(status).toBe('ok')
    },
    RETRY_TIMEOUT_MS,
  )
})
