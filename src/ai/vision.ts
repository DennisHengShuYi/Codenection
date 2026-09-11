import { BLOCK_KINDS, HORIZON_DAYS } from '../engine'
import { GROQ_VISION_MODEL } from './models'
import { parseModelReply } from './schema'
import { anchorLines } from './calendarAnchor'
import { MAX_ITEMS, type Calendar, type ParsedItem } from './types'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

/** Longer than the planner's eight seconds, because an image is far more to process --
 *  still bounded, per §10's third constraint. */
const VISION_TIMEOUT_MS = 20000

/**
 * §1.4's photo-of-anything entry point lives here rather than in branching code: the model
 * does the identifying, so the instruction has to permit a brief, a planner page, a
 * whiteboard or a slide without the code needing to know which it got.
 */
const SYSTEM_PROMPT = [
  "You read a photograph of a student's work and turn it into a task list.",
  'It may be an assignment brief, a handwritten planner page, a whiteboard, a lecture',
  'slide, a shift roster or a sticky note. Read whatever is actually there.',
  'Reply with JSON only, shaped {"items":[{"title","type","kind","hours","deadlineDay","startHour","hard","confident"}]}.',
  'type is one of: mental, physical, social, errands.',
  // Derived from `BLOCK_KINDS` rather than typed out, so the prompt cannot go on asking
  // for a kind `ai/schema.ts` rejects. It used to offer `sleep`, which the boundary now
  // refuses -- and `parseModelReply` is all-or-nothing, so one nap would have taken the
  // whole reply down with it (Ruling 46).
  `kind is one of: ${BLOCK_KINDS.join(', ')}.`,
  'Choose kind by what the activity actually is, not by its type: a gym session is hardExercise, a walk is lightExercise, a nap is rest.',
  'When unsure about physical work choose hardExercise, and for anything social choose socialDraining.',
  'hours is your estimate of effort, between 0 and 24. Use stated word counts or weightings',
  'where the page gives them.',
  `deadlineDay is a day index from 0 (today) to ${HORIZON_DAYS - 1}, or null if the page`,
  'does not state one. hard is true only where a fixed date is actually printed.',
  // §43, ported from the text planner, which asked for this and this did not -- so every
  // photographed timetable lost the one thing a timetable is mostly made of. A printed
  // clock time is stronger evidence than a typed one, and this is the reader §44's comment
  // calls "the reader that needed the anchor most": a roster gives the weekday AND the hour.
  'startHour is the hour of day printed on the page, 0-23, or null where none is printed.',
  'Read it only from a real clock time ("9am", "14:00", "0900-1100" gives 9). Never from an',
  'effort estimate ("3 hours") or a number that is part of the task itself ("chapter 3").',
  'For a range, give the hour it starts.',
  'repeat is {"weekdays":[1,3],"untilDay":null} for a row that recurs weekly on those days',
  '(0 is Sunday), and null otherwise. A timetable grid is the usual case: read the column',
  'the row sits under. untilDay is a day index the series stops on, or null.',
  `Return at most ${MAX_ITEMS} items.`,
  // Per row, so the confirm screen can point at the two it should not trust rather than
  // flagging all twenty. A timetable photo is mostly legible with a few cells that are
  // not, and those few are the ones worth a student's attention.
  'confident is false when the row was hard to read -- blurred, cut off, ambiguous, or a',
  'time or title you had to infer -- and true when it is plainly legible in the image.',
  // The line that matters most, and the one the test pins. A model filling in a plausible
  // deadline is exactly the silent poisoning §1.4 exists to prevent.
  'Never invent a task, a date or a number that is not visible in the image.',
].join(' ')

/**
 * One of the two places a Groq key is used, and only ever reached from `api/`.
 *
 * The reply goes through the planner's own schema rather than a second copy: one schema
 * means a vision reply cannot quietly become the unvalidated path by drifting away from a
 * duplicate, and it is what makes a photographed brief produce exactly the items a typed
 * brain dump does.
 */
/**
 * §44: the prompt, with today's real date when the caller knows it.
 *
 * The same gap the planner had, in the reader that needed it most: a photographed
 * timetable says "Tuesday" far more often than anything a student types, and this prompt
 * described `deadlineDay` as "a day index from 0 (today)" without ever saying what today
 * was. Shared with `groq.ts` rather than restated -- the wording was corrected against a
 * live model once, and a second copy would not have carried the correction.
 */
const systemPromptFor = (calendar?: Calendar): string => {
  const anchor = anchorLines(calendar)

  return anchor === '' ? SYSTEM_PROMPT : `${SYSTEM_PROMPT} ${anchor}`
}

export async function askVision(
  dataUrl: string,
  apiKey: string,
  /** §44: which real day day 0 is, so a weekday printed on a timetable lands on it. */
  calendar?: Calendar,
): Promise<ParsedItem[] | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS)

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPromptFor(calendar) },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this picture? Return the JSON.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
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

    return parseModelReply(JSON.parse(content))
  } catch {
    // A timeout, a dead network, or JSON that is not JSON. All the same answer to the
    // caller, which turns it into a sentence rather than a stack trace.
    return null
  } finally {
    clearTimeout(timeout)
  }
}
