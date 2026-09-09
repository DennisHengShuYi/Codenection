import { describe, expect, it } from 'vitest'
import type { ParsedItem } from '../ai'
import type { BlockOutcome } from './calibration'
import { paddingTable, padEstimates } from './applyPadding'

const parsed = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  id: 'r1',
  title: 'WIA3001 essay',
  type: 'mental',
  hours: 2,
  deadlineDay: null,
  hard: false,
  confident: true,
  ...over,
})

const overran = (count: number, type: BlockOutcome['type'] = 'mental'): BlockOutcome[] =>
  Array.from({ length: count }, () => ({ type, plannedHours: 2, actualHours: 4 }))

/**
 * §2.4 has two surfaces and both are required: a line on the "how you work" screen, and a
 * padding multiplier **applied silently**. The line shipped first; this is the half that
 * actually changes what the student's week looks like.
 */
describe('padEstimates', () => {
  it('leaves estimates alone when nothing has been measured', () => {
    expect(padEstimates([parsed()], paddingTable([]))[0]?.hours).toBe(2)
  })

  it('pads an estimate once a bias has actually been shown', () => {
    const padded = padEstimates([parsed()], paddingTable(overran(5)))

    expect(padded[0]?.hours).toBeGreaterThan(2)
  })

  it('pads by roughly what was measured', () => {
    // Planned 2, took 4, so about twice: a two-hour estimate becomes about four.
    expect(padEstimates([parsed()], paddingTable(overran(5)))[0]?.hours).toBeCloseTo(4, 0)
  })

  // §2.4: applied silently. The student is not asked to be more realistic.
  it('changes nothing else about the item', () => {
    const padded = padEstimates([parsed()], paddingTable(overran(5)))[0]

    expect(padded?.title).toBe('WIA3001 essay')
    expect(padded?.type).toBe('mental')
    expect(padded?.deadlineDay).toBeNull()
  })

  it('pads each type by its own measured bias, not one figure for everything', () => {
    const table = paddingTable(overran(5, 'mental'))
    const padded = padEstimates([parsed({ type: 'mental' }), parsed({ id: 'r2', type: 'errands' })], table)

    expect(padded[0]?.hours).toBeGreaterThan(2)
    expect(padded[1]?.hours).toBe(2)
  })

  it('does not modify the items it was given', () => {
    const before = [parsed()]
    const snapshot = JSON.stringify(before)

    padEstimates(before, paddingTable(overran(5)))

    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('handles an empty list', () => {
    expect(padEstimates([], paddingTable(overran(5)))).toEqual([])
  })

  // Rounded to something a student would recognise on the chip rather than 4.0000001.
  it('rounds to a half hour, so the number reads like an estimate', () => {
    const hours = padEstimates([parsed({ hours: 1 })], paddingTable(overran(5)))[0]?.hours ?? 0

    expect(hours * 2).toBe(Math.round(hours * 2))
  })
})

describe('paddingTable', () => {
  it('gives every load type a multiplier', () => {
    const table = paddingTable([])

    expect(table.mental).toBe(1)
    expect(table.physical).toBe(1)
    expect(table.social).toBe(1)
    expect(table.errands).toBe(1)
  })

  it('reflects a measured bias for the type it was measured on', () => {
    const table = paddingTable(overran(5, 'errands'))

    expect(table.errands).toBeGreaterThan(1)
    expect(table.mental).toBe(1)
  })
})
