import { describe, expect, it } from 'vitest'
import { LOW_ENERGY_THRESHOLD, shouldUseLowEnergy } from './lowEnergy'

describe('shouldUseLowEnergy', () => {
  // §1.5: "A student at 12% reserve should not be handed a dashboard."
  it('turns itself on below the threshold', () => {
    expect(shouldUseLowEnergy(12, 'auto')).toBe(true)
  })

  it('stays off above the threshold', () => {
    expect(shouldUseLowEnergy(60, 'auto')).toBe(false)
  })

  // Defined rather than accidental, so the boundary cannot drift with a refactor.
  it('is off exactly at the threshold', () => {
    expect(shouldUseLowEnergy(LOW_ENERGY_THRESHOLD, 'auto')).toBe(false)
  })

  it('can be turned on by hand at any reserve', () => {
    expect(shouldUseLowEnergy(95, 'on')).toBe(true)
  })

  // Never coercive. An interface a struggling student cannot dismiss is one more thing
  // being done to them, which is the opposite of the point -- §5.3 makes the same
  // argument about the door and it holds here.
  it('can be turned off by hand even when depleted', () => {
    expect(shouldUseLowEnergy(2, 'off')).toBe(false)
  })
})
