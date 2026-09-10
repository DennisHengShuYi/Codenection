import { describe, expect, it } from 'vitest'
import { visibleCards } from './cardPrecedence'

const all = { recovery: true, lapsed: true, stuck: true, today: true, lowEnergy: false }

describe('visibleCards', () => {
  it('shows nothing when nothing applies', () => {
    expect(visibleCards({ ...all, recovery: false, lapsed: false, stuck: false, today: false }))
      .toEqual([])
  })

  it('caps at two, in order, when the student is not flattened', () => {
    expect(visibleCards(all)).toEqual(['recovery', 'lapsed'])
  })

  it('shows exactly one below the low-energy threshold', () => {
    expect(visibleCards({ ...all, lowEnergy: true })).toEqual(['recovery'])
  })

  it('leads with recovery, because it addresses why the others are hard', () => {
    expect(visibleCards({ ...all, recovery: true, lapsed: true })[0]).toBe('recovery')
  })

  it('puts the day s question last, because it asks rather than offers', () => {
    expect(visibleCards({ ...all, recovery: false, lapsed: false })).toEqual(['stuck', 'today'])
  })

  it('skips what does not apply rather than leaving a gap', () => {
    expect(visibleCards({ ...all, recovery: false, stuck: false })).toEqual(['lapsed', 'today'])
  })
})
