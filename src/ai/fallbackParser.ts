import { WEEKDAY_NAMES } from '../domain/calendar'
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

const WEEKDAYS = WEEKDAY_NAMES.map((day) => day.toLowerCase())

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

/**
 * Whole-word membership, not `String.includes`. A bare substring check reads "restaurant"
 * as containing "rest" and "breakfast" as containing "break" -- silently turning a social
 * obligation into confident recovery, which is exactly what the doctrine above warns
 * against. Every signal list in this file is checked through this, not just `REST_WORDS`:
 * the same hazard sits behind "exam" in "example" and "call" in "recall".
 */
/**
 * Semgrep flags this as `detect-non-literal-regexp` (possible ReDoS). Triaged as a false
 * positive, and worth stating so the next scan does not re-litigate it:
 *
 * `word` is never user input. Every call site passes a literal from `SIGNALS`,
 * `PHYSICAL_LIGHT_WORDS` or `REST_WORDS` -- module-level `const` arrays of plain lowercase
 * words. The student's text is `lower`, the *subject*, not the pattern. ReDoS needs either
 * an attacker-controlled pattern or catastrophic backtracking, and `\bword\b` over a bare
 * literal has neither: no nesting, no alternation, no overlapping quantifiers, so matching
 * is linear. The subject is bounded too, by `MAX_INPUT_LENGTH`.
 *
 * If these lists ever take a value from outside this file, that reasoning is void.
 */
// Triaged, not ignored. Semgrep reads the interpolation and warns about ReDoS from an
// injected pattern, but `word` is never user input: all three call sites pass a literal from
// a module-level constant (`SIGNALS`, `PHYSICAL_LIGHT_WORDS`, `REST_WORDS`). The student's
// text is `lower`, the haystack, and `\bword\b` has no nested quantifier to backtrack on. If
// a signal word ever comes from anywhere but a constant in this file, this stops being true.
// nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
const hasSignalWord = (lower: string, word: string): boolean => new RegExp(`\\b${word}\\b`).test(lower)

/** Splits on the punctuation people actually use in a dump. */
const splitFragments = (text: string): string[] =>
  text
    .split(/[,;\n]+/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 0)

function typeOf(lower: string): { type: LoadType; confident: boolean } {
  for (const signal of SIGNALS) {
    if (signal.words.some((word) => hasSignalWord(lower, word))) {
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
    return PHYSICAL_LIGHT_WORDS.some((word) => hasSignalWord(lower, word)) ? 'lightExercise' : 'hardExercise'
  }
  if (type === 'social') return 'socialDraining'
  if (type === 'errands') return 'errands'
  return 'studyBlock'
}

/**
 * §44: the day index a named weekday falls on.
 *
 * This read `(named - today % 7 + 7) % 7`, treating `today % 7` as today's weekday -- true
 * only if day index 0 were a Sunday, and it is whatever weekday the student's week actually
 * began on. "gym thursday" therefore landed on whatever day the arithmetic produced, and
 * once the chip started showing the day (§43) the student could finally see it: a Thursday
 * offered as Monday.
 *
 * `startWeekday` is that anchor -- the weekday of day index 0, 0 for Sunday -- passed in
 * rather than read from a clock, because this parser is pure and the caller is the one
 * holding the dated week.
 */
function deadlineOf(lower: string, today: number, startWeekday: number): number | null {
  const named = WEEKDAYS.findIndex((day) => lower.includes(day))
  if (named === -1) return null

  const weekdayOfToday = (startWeekday + today) % 7
  const ahead = (named - weekdayOfToday + 7) % 7

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


/**
 * §43: the hour a fragment states, or null when it states none.
 *
 * Two shapes, and nothing else counts. `9am` / `7.30pm` is a clock time with a meridiem;
 * `14:00` is a 24-hour clock. A bare number is deliberately NOT read: "3 hours" is an
 * effort estimate and "chapter 3" is a chapter, and turning either into a time of day
 * would pin a block to an hour the student never mentioned -- the exact failure `fixed`
 * exists to avoid.
 *
 * Minutes are dropped rather than rounded. The week is modelled in whole hours, and 09:30
 * belongs in the 9 o'clock block; rounding 09:30 up to 10 would move a lecture out of the
 * hour it starts in.
 */
const timeOf = (lower: string): number | null => {
  const meridiem = lower.match(/\b(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)\b/)
  if (meridiem?.[1] !== undefined) {
    const stated = Number(meridiem[1])
    if (stated < 1 || stated > 12) return null

    // 12am is midnight and 12pm is noon: the only two the arithmetic does not cover.
    const hour = stated === 12 ? 0 : stated
    return meridiem[3] === 'pm' ? hour + 12 : hour
  }

  const clock = lower.match(/\b(\d{1,2}):(\d{2})\b/)
  if (clock?.[1] !== undefined) {
    const hour = Number(clock[1])
    return hour >= 0 && hour <= 23 ? hour : null
  }

  return null
}

let counter = 0

/**
 * `startWeekday` defaults to Sunday only so a caller with no dated week still gets a usable
 * answer -- which is what the seeded fortnight is. Every caller that HAS a week passes its
 * real anchor, and `parseBrainDump` threads it through.
 */
export function parseWithRules(text: string, today = 0, startWeekday = 0): ParsedItem[] {
  return splitFragments(text)
    .slice(0, MAX_ITEMS)
    .map((fragment) => {
      const lower = fragment.toLowerCase()
      const isRest = REST_WORDS.some((word) => hasSignalWord(lower, word))
      // A stated rest word is its own signal, read ahead of `typeOf`: "nap" and "downtime"
      // say nothing about mental, physical, social or errand load, but they say everything
      // about kind.
      const { type, confident } = isRest ? { type: 'mental' as const, confident: true } : typeOf(lower)
      const kind: ActivityKind = isRest ? 'rest' : kindOf(type, lower)
      const deadlineDay = deadlineOf(lower, today, startWeekday)
      const startHour = timeOf(lower)

      counter += 1

      return {
        id: `rule-${counter}`,
        title: fragment,
        type,
        kind,
        hours: hoursOf(lower),
        deadlineDay,
        startHour,
        // Never pre-pinned. The rules here can spot a stated *day*, which is a deadline
        // and is carried by `deadlineDay` already -- they cannot tell that from a stated
        // *time*, which is what `fixed` means. Guessing would pin blocks the optimizer may
        // not move on the strength of the word "Tuesday", so this stays off and the chip's
        // checkbox is where a class becomes fixed.
        fixed: false,
        confident,
        repeat: null,
      }
    })
}
