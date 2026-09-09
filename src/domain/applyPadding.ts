import type { ParsedItem } from '../ai'
import { LOAD_TYPES, type LoadType } from '../engine'
import type { BlockOutcome } from './calibration'
import { paddingFor } from './realityCheck'

export type PaddingTable = Record<LoadType, number>

/** Every type's multiplier in one pass, so a list of items is not re-deriving the same
 *  figure for each entry. */
export function paddingTable(outcomes: readonly BlockOutcome[]): PaddingTable {
  return Object.fromEntries(
    LOAD_TYPES.map((type) => [type, paddingFor(outcomes, type)]),
  ) as PaddingTable
}

/**
 * §2.4's second surface, and the one that actually changes the week.
 *
 * "Surfaced as a padding multiplier **applied silently**, and as a line on the how-you-work
 * screen." The line shipped first and was, on its own, only half the feature: telling a
 * student they underestimate writing by 1.7× while still planning their week at 1.0× leaves
 * them to do the correction themselves, which is exactly what §2.4 says not to ask of them.
 *
 * Applied where estimates enter the week, so a student who consistently overruns gets a
 * fortnight built on what their work actually costs rather than on what they hoped.
 *
 * Silent by design: §2.4 is explicit that the student need not know the parameter exists.
 * They are told the *conclusion* on the how-you-work screen, not asked to act on it.
 */
export function padEstimates(
  items: readonly ParsedItem[],
  padding: PaddingTable,
): ParsedItem[] {
  return items.map((item) => {
    const multiplier = padding[item.type]
    if (multiplier === 1) return { ...item }

    return {
      ...item,
      // Rounded to the half hour: a padded estimate is still an estimate, and 3.4 reads as
      // a measurement it is not.
      hours: Math.round(item.hours * multiplier * 2) / 2,
    }
  })
}
