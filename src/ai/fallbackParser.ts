import { HORIZON_DAYS, type ActivityKind, type LoadType } from '../engine'
import { DEFAULT_EFFORT_HOURS, MAX_ITEMS, type ParsedItem } from './types'

/**
 * A real parser, not a stub.
 *
 * §10 requires a hardcoded fallback for every external dependency, and this one does
 * double duty: it is what makes the test suite runnable with no secrets, what keeps CI
 * green, and what keeps the demo alive if the network dies on stage. A student with no key
 * configured still gets a structured week -- worse than the model's, and far better than
 * nothing.
 */

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * Words that reliably indicate a load type. Deliberately short: a longer list guesses more
 * often and is wrong more often, and every wrong guess spends the trust §1.4 exists to
 * protect.
 */
const SIGNALS: ReadonlyArray<{ type: LoadType; words: readonly string[] }> = [
  {
    type: 'mental',
    words: [
      'essay',
      'assignment',
      'report',
      'revision',
      'study',
      'exam',
      'reading',
      'lecture',
      'thesis',
      'chapter',
    ],
  },
  {
    type: 'physical',
    // `kindOf` below splits this by hardness: walk and yoga are light, the rest are hard.
    // §6.6: a hard session and a walk are both physical load, but opposite in what they
    // leave behind.
    words: ['gym', 'run', 'walk', 'swim', 'football', 'training', 'exercise', 'yoga'],
  },
  {
    type: 'social',
    words: ['coffee', 'dinner', 'birthday', 'party', 'meeting', 'friend', 'family', 'call'],
  },
  {
    type: 'errands',
    words: ['laundry', 'shopping', 'groceries', 'bank', 'post', 'clean', 'tidy', 'bills'],
  },
]

/** Words that mean the student is describing recovery, not work. Checked ahead of
 *  `SIGNALS` because none of these overlap it -- "nap" and "downtime" say nothing about
 *  mental, physical, social or errand load. */
const REST_WORDS = ['nap', 'rest', 'break', 'downtime']

/** The only physical words that leave the light residue (§6.6's `lightExercise` row).
 *  Every other physical word takes the dearer `hardExercise` default in `kindOf`. */
const PHYSICAL_LIGHT_WORDS = ['walk', 'yoga']

/** Splits on the punctuation people actually use in a dump. */
const splitFragments = (text: string): string[] =>
  text
    .split(/[,;\n]+/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 0)

function typeOf(lower: string): { type: LoadType; confident: boolean } {
  for (const signal of SIGNALS) {
    if (signal.words.some((word) => lower.includes(word))) {
      return { type: signal.type, confident: true }
    }
  }

  // Nothing recognisable. Errands is the least disruptive default -- it is the cheapest
  // load type, so a wrong guess distorts the projection least -- and it is flagged so the
  // student can correct it before it counts.
  return { type: 'errands', confident: false }
}

/**
 * What residue the activity leaves (§6.6), derived from the same words `typeOf` already
 * read rather than a separate guess.
 *
 * The doctrine `addItems` states outright, applied here at the source: crediting recovery
 * that never happened reports a student as fine while they sink, whereas under-crediting
 * only errs toward caution. So physical work defaults to the dearer `hardExercise` unless
 * a light word says otherwise, and social stays pessimistic at `socialDraining` -- a parse
 * cannot tell a restorative coffee from an obligation.
 */
function kindOf(type: LoadType, lower: string): ActivityKind {
  if (type === 'physical') {
    return PHYSICAL_LIGHT_WORDS.some((word) => lower.includes(word)) ? 'lightExercise' : 'hardExercise'
  }
  if (type === 'social') return 'socialDraining'
  if (type === 'errands') return 'errands'
  return 'studyBlock'
}

function deadlineOf(lower: string, today: number): number | null {
  const named = WEEKDAYS.findIndex((day) => lower.includes(day))
  if (named === -1) return null

  const ahead = (named - (today % 7) + 7) % 7

  // A named day that is today means next week's one, not this morning's.
  return Math.min(today + (ahead === 0 ? 7 : ahead), HORIZON_DAYS - 1)
}

function hoursOf(lower: string): number {
  const words = lower.match(/(\d{3,5})\s*words?/)
  if (words?.[1]) {
    // Roughly 500 words an hour, counting the thinking rather than only the typing.
    return Math.max(1, Math.round(Number(words[1]) / 500))
  }

  const hours = lower.match(/(\d+)\s*(?:hours?|hrs?)/)
  if (hours?.[1]) return Math.min(24, Math.max(1, Number(hours[1])))

  return DEFAULT_EFFORT_HOURS
}

let counter = 0

export function parseWithRules(text: string, today = 0): ParsedItem[] {
  return splitFragments(text)
    .slice(0, MAX_ITEMS)
    .map((fragment) => {
      const lower = fragment.toLowerCase()
      const isRest = REST_WORDS.some((word) => lower.includes(word))
      // A stated rest word is its own signal, read ahead of `typeOf`: "nap" and "downtime"
      // say nothing about mental, physical, social or errand load, but they say everything
      // about kind.
      const { type, confident } = isRest ? { type: 'mental' as const, confident: true } : typeOf(lower)
      const kind: ActivityKind = isRest ? 'rest' : kindOf(type, lower)
      const deadlineDay = deadlineOf(lower, today)

      counter += 1

      return {
        id: `rule-${counter}`,
        title: fragment,
        type,
        kind,
        hours: hoursOf(lower),
        deadlineDay,
        // A stated day is the student saying it is fixed. Everything else stays soft until
        // they say otherwise.
        hard: deadlineDay !== null,
        confident,
      }
    })
}
