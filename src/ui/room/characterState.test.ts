import { describe, expect, it } from 'vitest'
import { characterStateFor } from './characterState'

describe('characterStateFor', () => {
  it('is flattened when there is nothing left', () => {
    expect(characterStateFor(4)).toBe('flattened')
  })

  it('is running low just above that', () => {
    expect(characterStateFor(18)).toBe('runningLow')
  })

  it('is holding on in the middle', () => {
    expect(characterStateFor(35)).toBe('holdingOn')
  })

  it('is steady when things are fine', () => {
    expect(characterStateFor(60)).toBe('steady')
  })

  it('is rested when they are genuinely well', () => {
    expect(characterStateFor(85)).toBe('rested')
  })

  it('covers the whole range without a gap', () => {
    for (let value = 0; value <= 100; value += 1) {
      expect(characterStateFor(value)).toBeTruthy()
    }
  })

  /**
   * §1.3: the character reflects, never scolds. There is deliberately no state below
   * "flattened" -- no death, nothing the student can fail at or kill. A sixth, worse
   * state would quietly turn a mirror into something you can lose at, and this is the
   * assertion most likely to be "improved" away by someone adding rock bottom.
   */
  it('has no state worse than flattened, however bad things get', () => {
    expect(characterStateFor(0)).toBe('flattened')
    expect(characterStateFor(-50)).toBe('flattened')
  })
})
