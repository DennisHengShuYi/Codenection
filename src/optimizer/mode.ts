import type { Schedule } from '../optimizer'

/**
 * What kind of fortnight this is, read off its shape.
 *
 * `studying` is the case the app was designed around: a timetable of short fixed blocks on
 * most days. `shifts` is long fixed blocks on few days, which is what part-time work looks
 * like. `lowStructure` is almost nothing fixed at all -- and it is the one that matters,
 * because burnout there comes from drift rather than overload, so the objective ought to be
 * defending a floor rather than flattening peaks.
 */
export type Mode = 'studying' | 'shifts' | 'lowStructure'

/** Below this much fixed load there is no frame to speak of, whatever else the week holds. */
const ENOUGH_TO_BE_A_FRAME = 4

/** Past this a fixed block is a shift rather than a class. Nothing timetabled runs seven
 *  hours; nothing part-time runs two. */
const SHIFT_HOURS = 6

/**
 * §21, without asking anybody anything.
 *
 * The mode picker was cut for the right reason: nothing read it, so it was a question put to
 * every student for no effect. This is the same idea taken from the other end -- the shape
 * of a fortnight's fixed load already says which kind of week it is, and the student has
 * already told the app that by entering their timetable.
 *
 * Reads *fixed* load only. Movable work is what a student is trying to fit; fixed work is
 * the frame they must fit it into, and the frame is what distinguishes a timetable from a
 * roster from an empty diary. A fortnight of essays and no classes is a low-structure week
 * however full it looks.
 *
 * `protectedRest` is excluded for the same reason it is excluded from the week screen's
 * empty-timetable notice: rest the optimizer pinned is fixed load the app put there itself,
 * and counting it would let the app infer a timetable from its own suggestions.
 *
 * Nothing reads this yet, and that is stated rather than hidden -- §21 is marked roadmap in
 * the list it came from. It is here as a pure, tested answer to "which kind of week is
 * this", ready for the objective to ask. Wiring it into the objective would change what the
 * solver optimises for, which is a decision to take deliberately rather than as a side
 * effect of adding a function.
 */
export function modeOf(schedule: Schedule): Mode {
  const frame = schedule.items.filter((item) => item.fixed && !item.protectedRest)
  if (frame.length < ENOUGH_TO_BE_A_FRAME) return 'lowStructure'

  const longBlocks = frame.filter((item) => item.hours >= SHIFT_HOURS).length

  // Judged on the balance of the frame rather than any single block: a student with one
  // long lab among ten lectures is still studying.
  return longBlocks * 2 >= frame.length ? 'shifts' : 'studying'
}
