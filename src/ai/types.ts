import type { LoadType } from '../engine'

export interface ParsedItem {
  readonly id: string
  readonly title: string
  readonly type: LoadType
  readonly hours: number
  /** Day index within the horizon, or null when nothing in the text implied one. */
  readonly deadlineDay: number | null
  readonly hard: boolean
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

export const DEFAULT_EFFORT_HOURS = 1
