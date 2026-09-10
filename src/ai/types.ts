import type { ActivityKind, LoadType } from '../engine'

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
