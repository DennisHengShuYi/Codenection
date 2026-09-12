import { MAX_INSIGHT_LINE, parseInsightReply } from './insightSchema'
import { GROQ_TEXT_MODEL } from './models'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

/** The same budget the planner, the drafter and the ladder writer keep: this is text, and a
 *  sheet the student has already opened is waiting on it. §10's third constraint. */
const INSIGHT_TIMEOUT_MS = 8000

/**
 * Everything the model is told, and it is already true.
 *
 * Not the schedule, not the block titles, not the student. The facts have been computed by
 * `domain/reserveInsight` from the projection the sheet is drawing; the model's entire job
 * is to say them in a way a tired person can take in. It is given no number it is not
 * repeating and no room to reach a conclusion of its own.
 */
export interface InsightBrief {
  readonly lines: readonly string[]
}

const SYSTEM_PROMPT = [
  "You rewrite a few computed facts about a student's energy reserves so they read like a person wrote them.",
  'Reply with JSON only, shaped {"lines":["..."]}.',
  'Return EXACTLY as many lines as you were given, in the same order, one rewritten line per given line.',
  'Every number, name and day in a line must survive into your version unchanged.',
  'Add nothing. Do not infer, predict, diagnose, reassure, or give advice that was not in the line you were given.',
  'Second person, plain and warm, no jargon and no exclamation marks. Never mention an app, a model, or a forecast.',
  `Keep each line under ${MAX_INSIGHT_LINE} characters.`,
].join(' ')

/**
 * The fifth place a Groq key is used, and like the other four it is only ever reached from
 * `api/`.
 *
 * The reply goes through the same schema the client would use, so a reply that added a claim
 * or dropped a warning is refused here rather than one hop further in. Null on every failure
 * -- no key, a timeout, a malformed reply, a line count that does not match -- and the
 * caller falls back to the computed wording, which is a genuine equal rather than an
 * apology: those lines are what CI and `vite dev` have always shown.
 */
export async function askInsight(
  brief: InsightBrief,
  apiKey: string,
): Promise<readonly string[] | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), INSIGHT_TIMEOUT_MS)

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_TEXT_MODEL,
        // Lower than the drafter's, because this is a rewrite rather than a composition:
        // every degree of freedom here is a degree of freedom to drift off the facts.
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: brief.lines.map((line, index) => `${index + 1}. ${line}`).join('\n'),
          },
        ],
      }),
    })

    if (!response.ok) return null

    const body = (await response.json()) as {
      choices?: readonly { message?: { content?: string } }[]
    }
    const content = body.choices?.[0]?.message?.content
    if (typeof content !== 'string') return null

    return parseInsightReply(JSON.parse(content) as unknown, brief.lines.length)
  } catch {
    // A timeout, a network failure, or JSON the model did not close. All the same answer to
    // the caller, and none of them is an error worth putting in front of a tired student.
    return null
  } finally {
    clearTimeout(timeout)
  }
}
