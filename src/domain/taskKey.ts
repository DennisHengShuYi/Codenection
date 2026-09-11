/**
 * Which blocks are the same kind of work, read off what the student called them.
 *
 * §2.4 learns one multiplier per load type, so a student whose essays run 3x over and whose
 * lab reports land on time is told one averaged number about "study and writing". A finer
 * bucket needs a name, and the only name anyone reliably gives is the title they typed.
 *
 * **Derived, never stored.** `BlockRecord` keeps the title; this runs when the log is read.
 * Storing the bucket would freeze every grouping decision at the moment it was made, so
 * sharpening these rules would help only future answers -- this way a better rule regroups
 * a whole semester of history the next time the app opens.
 *
 * The rules are few on purpose. Every one of them is a guess about what somebody meant, and
 * a wrong guess costs nothing: a bucket that never fills falls through to the kind, and then
 * to the load type, which is where the app was before any of this existed.
 */

/** A course code as students write them: letters then digits, `WIA3001`, `CS2040`. */
const COURSE = /^[a-z]{2,4}\d{3,5}$/

/**
 * Words that mark which instance or which stage, rather than what the work is.
 *
 * "Essay draft" and "Essay final" are one task measured twice; splitting them halves the
 * evidence for both and neither reaches the threshold. Same for the week number people put
 * in front of a reading.
 */
const STAGE_WORDS = new Set([
  'draft',
  'final',
  'part',
  'week',
  'no',
  'the',
  'my',
  'a',
  'an',
])

/** Everything a student would not think of as part of the name. */
const stripPunctuation = (word: string): string => word.replace(/[^a-z0-9]/g, '')

const isInstanceMarker = (word: string): boolean => /^\d+$/.test(word) || STAGE_WORDS.has(word)

export interface TaskKey {
  /** The module this belongs to, or null when the title never said. */
  readonly course: string | null
  /** What the work is, with instance and stage words removed. */
  readonly task: string
}

export function taskKeyOf(title: string): TaskKey {
  const words = title
    .toLowerCase()
    .split(/\s+/)
    .map(stripPunctuation)
    .filter((word) => word !== '')

  const course = words.find((word) => COURSE.test(word)) ?? null

  const task = words
    .filter((word) => word !== course && !isInstanceMarker(word))
    .join(' ')

  // A title made only of things this strips -- "Draft 2" -- would become the empty bucket,
  // which every other such title would then join. Falling back to the normalised title keeps
  // it a bucket of its own, which is the honest answer: nothing here said what the work is.
  return { course, task: task === '' ? words.join(' ') : task }
}

const wordsOf = (task: string): readonly string[] => task.split(' ').filter((word) => word !== '')

const within = (inner: readonly string[], outer: readonly string[]): boolean =>
  inner.length > 0 && inner.every((word) => outer.includes(word))

/**
 * Whether two keys describe the same family of work.
 *
 * Containment rather than equality, because the same thing gets typed two ways: "gym" and
 * "gym with sam", "call" and "call home", "essay" and "wia3001 essay". Equality leaves those
 * as separate buckets, neither of which ever fills.
 *
 * A course named on both sides has to agree -- learning WIA3001's essays from WIA2005's is
 * exactly what this split was asked to stop -- while one side naming it and the other not is
 * the commonest way a student writes the same work twice, so that still matches.
 *
 * Callers pair this with the block's kind, which is the guardrail that keeps "run" and "run
 * errands" apart: containment alone would merge them.
 */
export function sameFamily(left: TaskKey, right: TaskKey): boolean {
  if (left.course !== null && right.course !== null && left.course !== right.course) return false

  const leftWords = wordsOf(left.task)
  const rightWords = wordsOf(right.task)

  return within(leftWords, rightWords) || within(rightWords, leftWords)
}
