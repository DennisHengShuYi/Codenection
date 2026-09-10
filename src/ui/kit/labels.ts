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
