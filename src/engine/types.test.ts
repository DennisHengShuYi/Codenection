import { describe, expect, it } from 'vitest'
import { ACTIVITY_KINDS, BLOCK_KINDS } from './types'

/**
 * Ruling 46's drift guard.
 *
 * `BLOCK_KINDS` is written out as a literal tuple because `z.enum` needs one, which means
 * it cannot derive itself from `ACTIVITY_KINDS` the way `ItemChip`'s old local filter did.
 * That trade is only safe with this test: a kind added to the engine and forgotten here
 * would be silently unofferable in the picker AND silently rejected at the model boundary,
 * with nothing failing to say so.
 */
describe('BLOCK_KINDS', () => {
  it('is every ActivityKind except sleep, in the same order', () => {
    expect(BLOCK_KINDS).toEqual(ACTIVITY_KINDS.filter((kind) => kind !== 'sleep'))
  })

  // Stated separately from the equality above, because that one would still pass if both
  // lists gained sleep together.
  it('does not contain sleep, which enters through Schedule.sleepByDay', () => {
    expect(BLOCK_KINDS).not.toContain('sleep')
  })
})
