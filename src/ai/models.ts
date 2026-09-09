/**
 * Every model id this app names, in one place.
 *
 * They were three separate constants in three files, which is how two of them came to be
 * retired without anyone noticing: photo import said the model was "not set up" while the
 * planner and the drafter quietly fell back to their rule-based paths and looked fine. One
 * file means one thing to check, and it is what `models.integration.test.ts` checks.
 */

/**
 * The planner (`groq.ts`) and the request-box drafter (`writer.ts`). Text only.
 *
 * Not shared with the vision model below, despite one id being tidier: measured at ~450ms
 * against ~30s of over-capacity 503s from the Qwen family on the day this was written.
 * Both text features have a fallback, so a slow model degrades quietly rather than
 * visibly -- which is exactly why it should not be the slow one.
 */
export const GROQ_TEXT_MODEL = 'openai/gpt-oss-120b'

/**
 * Photo import (`vision.ts`). Must accept image content, which most of Groq's catalogue
 * does not -- `openai/gpt-oss-*` and `groq/compound*` answer a multimodal message with
 * "messages[0].content must be a string". The integration test covers that specifically,
 * so a swap to a text-only model fails there rather than on a student's timetable.
 *
 * Two ids accept an image: this one and `qwen/qwen3.6-27b`. Prefer this one, and know why
 * before swapping. `3.6` spends so much of its budget reasoning that it cannot finish
 * valid JSON for a full timetable inside the free tier's 1000-token-per-request output
 * limit -- Groq then rejects the truncation outright with `json_validate_failed`. This one
 * answers the same photograph in ~600 output tokens, well inside the same limit.
 *
 * When it fails, the question is whether it is retired or merely busy: it spent an hour
 * answering "currently over capacity" while this was being written, taking 30s to say so,
 * which is longer than `vision.ts` waits before giving up. That is a wait, not a swap.
 */
export const GROQ_VISION_MODEL = 'qwen/qwen3.8-27b'

/** Voice notes (`groq.ts`, the Whisper endpoint). Here for the same reason as the other
 *  two: one place to look when a model id stops working. */
export const GROQ_TRANSCRIBE_MODEL = 'whisper-large-v3-turbo'
