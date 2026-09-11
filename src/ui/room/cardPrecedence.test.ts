import { describe, expect, it } from 'vitest'
import { visibleCards } from './cardPrecedence'

const all = {
  distress: false,
  lapsed: true,
  stuck: true,
  today: true,
  lowEnergy: false,
}

describe('visibleCards', () => {
  it('shows nothing when nothing applies', () => {
    expect(visibleCards({ ...all, lapsed: false, stuck: false, today: false })).toEqual([])
  })

  it('caps at two, in order, when the student is not flattened', () => {
    expect(visibleCards(all)).toEqual(['lapsed', 'stuck'])
  })

  it('shows exactly one below the low-energy threshold', () => {
    expect(visibleCards({ ...all, lowEnergy: true })).toEqual(['lapsed'])
  })

  it("puts the day's question last, because it asks rather than offers", () => {
    expect(visibleCards({ ...all, lapsed: false })).toEqual(['stuck', 'today'])
  })

  it('skips what does not apply rather than leaving a gap', () => {
    expect(visibleCards({ ...all, stuck: false })).toEqual(['lapsed', 'today'])
  })

  /**
   * Above everything.
   *
   * A student who has reported the bottom four days running is not helped by being told
   * what is lapsed or what is stuck, and leading with either would read as the app not
   * having heard them.
   */
  it('leads with distress', () => {
    expect(visibleCards({ ...all, distress: true })[0]).toBe('distress')
  })

  /** §1.5's cap of one still holds, and this is the one worth keeping. */
  it('is the only card left when the student is flattened', () => {
    expect(visibleCards({ ...all, distress: true, lowEnergy: true })).toEqual(['distress'])
  })

  it('changes nothing when it does not apply', () => {
    expect(visibleCards({ ...all, distress: false })).toEqual(['lapsed', 'stuck'])
  })
})
