import { MAX_RUNG_MINUTES, MAX_RUNGS, MIN_RUNGS, type Rung } from '../domain/ladder'
import { parseLadderReply } from './ladderSchema'
import { GROQ_TEXT_MODEL } from './models'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

/** Matches the planner's and the drafter's budget: this is text, not an image. §10's third
 *  constraint. A stuck student waiting on a spinner is more stuck, not less. */
const LADDER_TIMEOUT_MS = 8000

/**
 * Everything the model is told about the block, and nothing else.
 *
 * Not the week, not the reserves, not the student. Breaking one task into first moves has no
 * use for any of it -- and a prompt that carried the week would be sending a great deal
 * about somebody's life to answer "how do I start this".
 */
export interface LadderBrief {
  readonly what: string
  readonly kind: string
  readonly hours: number
  /** Set only when the student pressed "that one doesn't fit": the rung being rejected. */
  readonly rejected?: string
  /** The rungs already done, so a replacement does not repeat one. */
  readonly soFar?: readonly string[]
}

const SYSTEM_PROMPT = [
  'A student is unable to start one task. You break it into the smallest physical first moves.',
  'Reply with JSON only, shaped {"steps":[{"action","minutes"}]}.',
  `Give between ${MIN_RUNGS} and ${MAX_RUNGS} steps, in the order they are done.`,
  `minutes is a whole number from 1 to ${MAX_RUNG_MINUTES}. Never more.`,
  'Each step is a physical move a person could do without deciding anything:',
  'open the document, put your shoes on, find the phone number.',
  'A step is never a smaller version of the task. "Outline the essay" is still the essay.',
  'Never ask the student to plan, decide, choose, prioritise or think about anything.',
  'Write to them directly, in the second person, plainly and without encouragement or praise.',
  'The last step ends the task or ends the session honestly. Never promise it will be easy.',
  'If the task is rest or sleep, every step lowers the bar to resting.',
  'Never tell somebody to finish, complete or get through their rest.',
].join(' ')

const briefLines = (brief: LadderBrief): string => {
  const lines = [`Task: ${brief.what}`, `Kind: ${brief.kind}`, `Estimated effort: ${brief.hours} hours`]

  if (brief.soFar !== undefined && brief.soFar.length > 0) {
    lines.push(`Already done: ${brief.soFar.join('; ')}`)
  }
  if (brief.rejected !== undefined) {
    lines.push(`This step did not fit, give a different one in its place: ${brief.rejected}`)
  }

  return lines.join('\n')
}

/**
 * The fourth and last place a Groq key is used, and only ever reached from `api/`.
 *
 * The reply goes through the same schema the client would use, so a malformed chain is
 * caught here rather than travelling one hop further into the app.
 */
export async function askLadder(brief: LadderBrief, apiKey: string): Promise<Rung[] | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LADDER_TIMEOUT_MS)

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_TEXT_MODEL,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: briefLines(brief) },
        ],
      }),
    })

    if (!response.ok) return null

    const body = (await response.json()) as { choices?: readonly { message?: { content?: string } }[] }
    const content = body.choices?.[0]?.message?.content
    if (typeof content !== 'string') return null

    return parseLadderReply(JSON.parse(content) as unknown)
  } catch {
    // A timeout, a network failure, or JSON the model did not close. All the same answer: no
    // chain, and the client falls back to the rules.
    return null
  } finally {
    clearTimeout(timeout)
  }
}
