import { HORIZON_DAYS } from '../engine'
import { parseModelReply } from './schema'
import { MAX_ITEMS, type ParsedItem } from './types'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

/** §10, constraint 3: the call is time-boxed and falls back rather than hanging the
 *  confirm screen behind a model that never answers. */
const GROQ_TIMEOUT_MS = 8000

const SYSTEM_PROMPT = [
  "You turn a student's unstructured notes into a task list.",
  'Reply with JSON only, shaped {"items":[{"title","type","hours","deadlineDay","hard"}]}.',
  'type is one of: mental, physical, social, errands.',
  'hours is your estimate of effort, between 0 and 24.',
  `deadlineDay is a day index from 0 (today) to ${HORIZON_DAYS - 1}, or null if none is implied.`,
  'hard is true only when the student stated a fixed date or deadline.',
  `Return at most ${MAX_ITEMS} items. Do not invent tasks the notes do not mention.`,
].join(' ')

/**
 * The only place the Groq key is used, and it is only ever reached from `api/`.
 *
 * The reply is validated by the same schema the client uses, so a malformed answer is
 * caught here rather than travelling one hop further into the app.
 */
export async function askGroq(text: string, apiKey: string): Promise<ParsedItem[] | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS)

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        // The credential's one safe channel. In the URL it would land in logs and
        // referrers; in the body it would be echoed by anything that logs a request.
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
      }),
    })

    if (!response.ok) return null

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = body.choices?.[0]?.message?.content
    if (typeof content !== 'string') return null

    return parseModelReply(JSON.parse(content))
  } catch {
    // A timeout, a dead network, or JSON that is not JSON. All the same answer to the
    // caller: give up quietly and let the rules take over.
    return null
  } finally {
    clearTimeout(timeout)
  }
}
