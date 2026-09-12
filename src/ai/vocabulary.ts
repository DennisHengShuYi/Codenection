/**
 * The names a student already uses, sent to the model so it can reuse them.
 *
 * §2.4's narrow rungs group answers by title, and on this path the title is the model's
 * phrasing rather than the student's: one gym habit becomes "Gym session" this week and
 * "Workout" the next, each a bucket starting at zero answers.
 *
 * This is the softer of the two defences and worth being honest about: a prompt is advice,
 * and a model that ignores it costs nothing here, because `domain/snapTitle` runs on the
 * reply and holds the naming together whatever came back. This only raises the odds the
 * model gets there itself, which keeps the snap from having to rename half the list.
 *
 * Lives beside `calendarAnchor`, which does the same job for dates and for the same reason:
 * the browser holds the context, the endpoint holds the credential, and what travels between
 * them is checked on arrival.
 */

/** Enough for a student's real vocabulary -- their modules, a gym habit, a weekly shift --
 *  and short enough that the prompt stays a prompt. Unbounded input reaching a model is a
 *  bill somebody else writes. */
const MOST_SENT = 12

/** A title is a handful of words. Anything longer is not a name a student typed, and a
 *  prompt is the wrong place to find out what it is instead. */
const LONGEST_NAME = 60

/**
 * What arrived, once it has been checked.
 *
 * Untrusted at the boundary like everything else over the wire, and nothing downstream
 * re-checks it -- this ends up inside a system prompt, which is exactly where an unbounded
 * list or a long enough entry stops being data.
 */
export function readVocabulary(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return []

  return raw
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '' && entry.length <= LONGEST_NAME)
    .slice(0, MOST_SENT)
}

/**
 * The instruction, or nothing at all when there are no names.
 *
 * "Otherwise write a new one" is load-bearing. Without it a model told to reuse a list will
 * force a rock-climbing session into "Gym" to obey, which is worse than the phrasing drift
 * this is here to stop -- it would put two different activities in one bucket rather than
 * one activity in two.
 */
export function vocabularyLines(names: readonly string[]): string {
  if (names.length === 0) return ''

  return [
    'This student already uses these names:',
    names.map((name) => `"${name}"`).join(', '),
    '. If something in the notes is one of these, reply with that exact name.',
    ' Otherwise write a new one — do not force a different activity into a name on the list.',
  ].join('')
}
