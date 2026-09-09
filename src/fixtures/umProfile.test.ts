import { describe, expect, it } from 'vitest'
import { meanAbsoluteError } from '../domain/predictions'
import { umProfile } from './umProfile'

describe('umProfile', () => {
  it('publishes a real accuracy number instead of "not enough data"', () => {
    const profile = umProfile('2026-09-01')

    const error = meanAbsoluteError(profile.predictions)
    expect(error).not.toBeNull()
    expect(error as number).toBeGreaterThan(0)
    expect(error as number).toBeLessThan(20)
  })

  it('dates its predictions from the anchor it is given', () => {
    const profile = umProfile('2026-09-01')

    for (const prediction of profile.predictions) {
      expect(prediction.forDate >= '2026-09-01').toBe(true)
    }
  })
})
