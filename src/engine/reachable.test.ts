import { describe, expect, it } from 'vitest'
import { parseWithRules } from '../ai/fallbackParser'
import { ADVICE_KINDS } from '../domain/prescribe'
import { ACTIVITY_KINDS, LOAD_TYPES, type ActivityKind } from './types'

/**
 * Phrases a student would plausibly type, one per kind the parser is meant to reach.
 * Deliberately ordinary: if the guard needs contrived input to pass, the path it is
 * guarding is not one a real student will take either.
 */
const PHRASES = [
  'essay due friday',
  'gym',
  'walk',
  'coffee with sarah',
  'laundry',
  'nap for an hour',
]

/**
 * Kinds that are correctly unreachable as an *activity*, with the reason.
 *
 * This map is the point of the test. An entry here is a decision somebody made on purpose
 * and wrote down; a kind that is merely forgotten has no entry and fails.
 */
const INTENTIONALLY_ABSENT: Partial<Record<ActivityKind, string>> = {
  sleep: 'Enters through Schedule.sleepByDay, never as a scheduled activity.',
}

describe('every ActivityKind is reachable', () => {
  it('can be produced by the parser or by a prescription', () => {
    const fromRules = PHRASES.flatMap((phrase) => parseWithRules(phrase)).map((item) => item.kind)
    const fromAdvice = LOAD_TYPES.map((type) => ADVICE_KINDS[type]).filter(
      (kind): kind is ActivityKind => kind !== undefined,
    )
    const reachable = new Set<ActivityKind>([...fromRules, ...fromAdvice])

    const orphans = ACTIVITY_KINDS.filter(
      (kind) => !reachable.has(kind) && INTENTIONALLY_ABSENT[kind] === undefined,
    )

    expect(orphans).toEqual([])
  })
})
