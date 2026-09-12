import type { BlockAnswer } from '../../domain/blockLog'
import type { ActivityKind, LoadType } from '../../engine'

/**
 * The engine's vocabulary in a student's words. "Mental load" is a modelling term; "study
 * and thinking" is what someone recognises as their own week.
 *
 * Shared rather than local since the manual edit form needed the same four words. Two
 * copies of one vocabulary is how the planner and the week come to call the same thing
 * different things -- the fault Ruling 46 recorded for `BLOCK_KINDS`.
 */
export const LOAD_TYPE_LABELS: Record<LoadType, string> = {
  mental: 'Study & thinking',
  physical: 'Body & movement',
  social: 'People',
  errands: 'Life admin',
}

/**
 * §6.6's kinds in a student's words -- what the activity leaves behind, not the modelling
 * term for it. A gym session and a walk are both "Body & movement" above, but this is where
 * the student says which one it actually was.
 *
 * Keyed on every `ActivityKind` rather than only the selectable ones, so a picker cannot
 * render blank for a kind it was handed but does not offer.
 */
export const BLOCK_KIND_LABELS: Record<ActivityKind, string> = {
  hardExercise: 'Hard exercise',
  lightExercise: 'Light exercise',
  studyBlock: 'Study',
  socialDraining: 'Seeing people (draining)',
  socialRestorative: 'Seeing people (restorative)',
  errands: 'Life admin',
  rest: 'Rest',
  sleep: 'Sleep',
}

/**
 * An hour of the day as a student reads a clock.
 *
 * Shared because the block sheet and the edit form both show one, and two copies of a
 * formatter is how "09:00" and "9:00" end up on two screens describing the same block.
 * `telegram/render.ts` keeps its own, deliberately: it floors a possibly-fractional hour
 * for a text message, which is a different question from labelling a whole-hour picker.
 */
export const hourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`

/**
 * §8b②'s four answers, in one place.
 *
 * They were declared inside `TodayCard` and again, as a different shape, inside
 * `BlockSheet` -- two copies of one vocabulary, which this file's own docstring calls out as
 * how the planner and the week come to call the same thing different things. Answering is a
 * list row now, so a third copy was one edit away.
 *
 * Ruling 22: no primary variant among them, and they are ordered from least to most done. A
 * highlighted answer is a nudge toward one, and the value of this record is that it is what
 * happened rather than what reads well.
 *
 * Three, not four. "Didn't happen" was removed from the block sheet first, where it sat a
 * row above Remove doing the same job, and then from here: the question this asks is how
 * long something took, which is the one thing Reality Check reads.
 *
 * `didnt` remains a `BlockAnswer` and is still written by the bot, because `softDeadlines`
 * reads it by name -- a rest answered `didnt` must not satisfy the rest rhythm. A block
 * nobody answers does not satisfy it either, so removing the button costs the distinction
 * between "I skipped it" and "I never said", not the rhythm itself.
 */
export const BLOCK_ANSWERS: readonly { answer: BlockAnswer; label: string }[] = [
  { answer: 'less', label: 'Took less' },
  { answer: 'right', label: 'About right' },
  { answer: 'longer', label: 'Took longer' },
]
