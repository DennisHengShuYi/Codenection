import type { Repeat } from '../domain/recurrence'
import type { ActivityKind, LoadType } from '../engine'

/**
 * §44: which real day the horizon's day 0 is.
 *
 * Both readers needed it and neither had it. The rules computed a named weekday from
 * `today % 7`, which assumes day 0 is a Sunday; the model was told "day index from 0
 * (today)" and never told what day today was, so it had to guess -- guess Monday, and a
 * stated Thursday comes back as day 3. Either way "gym thursday" landed on the wrong day,
 * and §43's Day select is what finally showed it to the student.
 *
 * `startWeekday` is 0 for Sunday, matching `Date.getUTCDay` and `Repeat.weekdays`.
 */
export interface Calendar {
  readonly today: number
  readonly startWeekday: number
  /** How to say day 0 to a model, e.g. "Friday 11 September 2026". Absent for a week that
   *  has never been dated, where there is nothing true to say. */
  readonly todayLabel?: string
}

export interface ParsedItem {
  readonly id: string
  readonly title: string
  readonly type: LoadType
  /**
   * What residue the activity leaves, and whether it drains or recovers (§6.6). Coarser
   * than `type`: a hard session and a walk are both physical load, but opposite in what
   * they do to the study block that follows -- so this cannot be derived from `type` alone
   * and must be read from the text itself.
   */
  readonly kind: ActivityKind
  readonly hours: number
  /** Day index within the horizon, or null when nothing in the text implied one. */
  readonly deadlineDay: number | null
  /**
   * §43: the hour of the day the student actually said, or null when they said none.
   *
   * The schema carried a day and never a time, so "WIA3001 lecture Tuesday 9am" arrived as
   * Tuesday and nothing else, and `placement.ts` then picked an hour -- a free slot, or a
   * fallback constant. The app was deciding when a student's own lecture happened, and the
   * student never saw the answer before accepting it.
   *
   * Null is a real answer, not a missing one: an essay due Friday has a deadline and no
   * time of day, and the optimizer should keep its freedom to place it. A stated hour
   * removes that freedom -- see `fixed`, which the accept sets alongside it.
   *
   * A calendar import is the other producer, and the one place the hour is not a reading of
   * what somebody typed but a fact: the time is the single thing a calendar is genuinely
   * authoritative about, and importing a 9am lecture only to place it at 19:00 would throw
   * away the only reason to read a calendar at all.
   */
  readonly startHour: number | null
  /**
   * Whether this is pinned to a *time* -- a lecture, a lab, a shift.
   *
   * Distinct from `deadlineDay`, which the schema used to conflate it with under the name
   * `hard`. `fixed` means the optimizer may not move it at all; `deadlineDay` means it may
   * not move it *past* a day but is free before it. An essay with a hard deadline is
   * maximally movable, so one boolean could never have carried both -- and while it did,
   * nothing read it.
   *
   * The model's `hard` seeds this, but it is the student's answer, not the model's: it is
   * editable on the chip and the accept is what commits it. §5.1's guarantee holds on the
   * side that matters -- see `addItems`, which still refuses to create `protectedRest`
   * whatever this says.
   */
  readonly fixed: boolean
  /**
   * How often this comes round, or null for a one-off.
   *
   * §36: the schema returned one `deadlineDay`, so "WIA3001 lecture every Tuesday 9am"
   * produced a single item on a single day -- and recurring items are almost entirely the
   * fixed set that everything else is measured against. If the timetable is wrong, every
   * projection is wrong, and nothing in the app revealed it.
   *
   * Expanded at entry by `domain/recurrence`, never carried further: nothing downstream of
   * the add flow knows recurrence exists.
   */
  readonly repeat: Repeat | null
  /**
   * §39: which series this instance came from, when it came from one.
   *
   * Optional because a one-off has none. One field, and it is what makes "this class has
   * ended" a single operation rather than deleting three items by hand.
   */
  readonly seriesId?: string
  /**
   * Where this came from outside the app, when it came from somewhere.
   *
   * Carried so a second import can tell what it has already seen, and so the push side never
   * sends an event back to the calendar it was read from -- which would duplicate it, and
   * then duplicate the duplicate.
   */
  readonly sourceId?: string
  /**
   * Whether this was read with confidence.
   *
   * §1.4 requires low-confidence rows to be visibly flagged rather than silently guessed.
   * A wrong deadline quietly poisoning every projection is the fastest way to lose a
   * student's trust, and they cannot correct what they were never shown.
   */
  readonly confident: boolean
}

export interface ParseOutcome {
  readonly items: readonly ParsedItem[]
  readonly source: 'model' | 'fallback'
}

/** A brain dump, not a document. Bounds the prompt and the cost. */
export const MAX_INPUT_LENGTH = 2000

/** More than a fortnight can hold. Guards against a runaway reply becoming a runaway
 *  week. */
export const MAX_ITEMS = 25

/** A request, not a document -- shorter than the planner's brain dump, because this is
 *  one message somebody sent you. */
export const MAX_REQUEST_LENGTH = 1000

export const DEFAULT_EFFORT_HOURS = 1

/**
 * Groq's limit for a base64 image payload. Enforced in the browser as well as at the
 * endpoint, so an oversized photo is refused before it is uploaded on a student's mobile
 * data rather than after.
 */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024

/** What a phone camera actually produces. HEIC is here because iPhones default to it, and
 *  leaving it out would refuse the most common camera in the room. */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const

/**
 * What came back from a photo, or why nothing did.
 *
 * A photograph has no honest rule-based fallback the way text does, so "why not" is a
 * first-class outcome here rather than an error to be caught somewhere else.
 */
export type PhotoOutcome =
  | { readonly ok: true; readonly items: readonly ParsedItem[] }
  | { readonly ok: false; readonly reason: string }
