import { describe, expect, it } from 'vitest'
import { LOAD_TYPES } from '../engine'
import { checkedInDays, outcomesFrom } from '../domain/blockLog'
import { MIN_SAMPLES, paddingFor } from '../domain/realityCheck'
import { umBlockLog } from './umBlockLog'

describe('umBlockLog', () => {
  it('has enough records per load type for Reality Check to speak', () => {
    const outcomes = outcomesFrom(umBlockLog('2026-09-01'))

    for (const type of LOAD_TYPES) {
      const forType = outcomes.filter((outcome) => outcome.type === type)
      expect(forType.length).toBeGreaterThanOrEqual(MIN_SAMPLES)
    }
  })

  it('carries a believable overrun bias, most pronounced on mental', () => {
    const outcomes = outcomesFrom(umBlockLog('2026-09-01'))

    // A student who under-estimates. Padding above 1 is what makes §2.4 visible at all.
    for (const type of LOAD_TYPES) {
      expect(paddingFor(outcomes, type)).toBeGreaterThan(1)
    }

    expect(paddingFor(outcomes, 'mental')).toBeGreaterThan(paddingFor(outcomes, 'physical'))
    expect(paddingFor(outcomes, 'mental')).toBeGreaterThan(paddingFor(outcomes, 'social'))
    expect(paddingFor(outcomes, 'mental')).toBeGreaterThan(paddingFor(outcomes, 'errands'))
  })

  it('answers days early enough that checkedInDays sees them as checked in once time passes', () => {
    const log = umBlockLog('2026-09-01')
    const today = 10
    const days = checkedInDays(log, today, 21)

    for (const record of log) {
      expect(record.dayIndex).toBeLessThan(today)
      expect(days[record.dayIndex]).toBe(true)
    }
  })
})
