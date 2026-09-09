import { parseDraftReply } from './draftSchema'
import type { Draft } from './draftTemplates'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

/** Matches the planner's budget: this is text, not an image. §10's third constraint. */
const DRAFT_TIMEOUT_MS = 8000

/** Everything the drafter is told. Deliberately not the week, the schedule, or anything
 *  about the student beyond the one request being answered. */
export interface DraftBrief {
  readonly what: string
  readonly hours: number
  readonly evenings: number
  readonly deficitDay: number | null
  readonly absorbable: boolean
}

const SYSTEM_PROMPT = [
  'You draft three short replies a student can send to whoever asked them for something.',
  'Write in the first person, as the student, in their own voice — plain, warm and direct.',
  'Never mention an app, a planner, a model, or any tool. The student is speaking.',
  'Reply with JSON only, shaped {"drafts":[{"tone","text"}]}.',
  'Provide exactly three, one of each tone: "decline" (a soft no),',
  '"defer" (yes but later, naming a specific time), and "accept" (yes, naming the cost out loud).',
  'The accept reply must state the trade-off honestly rather than hiding it.',
  'Keep each reply under 80 words. Do not invent facts beyond what you are given.',
].join(' ')

/**
 * One of the places a Groq key is used, and only ever reached from `api/`.
 *
 * The reply goes through the same schema the client uses, so a malformed set is caught here
 * rather than travelling one hop further into a box the student may copy and send.
 */
export async function askWriter(brief: DraftBrief, apiKey: string): Promise<Draft[] | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DRAFT_TIMEOUT_MS)

  const cost =
    brief.evenings >= 1
      ? `about ${brief.evenings} evenings of my downtime`
      : 'time I do not really have'

  const crossing =
    brief.deficitDay === null ? '' : ` It would put me into deficit around day ${brief.deficitDay}.`

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `I have been asked to do this: ${brief.what}. It is about ${brief.hours} hours of work and would cost me ${cost}.${crossing} My fortnight ${brief.absorbable ? 'can just about take it' : 'cannot really take it'}.`,
          },
        ],
      }),
    })

    if (!response.ok) return null

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = body.choices?.[0]?.message?.content
    if (typeof content !== 'string') return null

    return parseDraftReply(JSON.parse(content))
  } catch {
    // A timeout, a dead network, or JSON that is not JSON. The caller falls back to the
    // templates, which are a genuine equal here rather than an apology.
    return null
  } finally {
    clearTimeout(timeout)
  }
}
