import { describe, expect, it } from 'vitest'
import { visibleCards } from './cardPrecedence'

const all = {
  distress: false,
  overfull: true,
  stuck: true,
  today: true,
  lowEnergy: false,
}

describe('visibleCards', () => {
  it('shows nothing when nothing applies', () => {
    expect(visibleCards({ ...all, overfull: false, stuck: false, today: false })).toEqual([])
  })

  it('shows everything that applies, in order, when the student is not flattened', () => {
    expect(visibleCards(all)).toEqual(['overfull', 'stuck', 'today'])
  })

  /**
   * Nothing is crowded out above the low-energy threshold.
   *
   * This capped at two, then at three, and each number quietly decided which of four real
   * things a student would not be told: at two the micro-start card lost to distress and a
   * overfull day together, and at three the sleep question did. Both were the wrong
   * trade, and picking a different one would only move the loss somewhere else -- these are
   * four different facts about the day, and there is no order in which the fourth deserves
   * to vanish.
   *
   * What still holds the line is §1.5's cap of one, which is the rule that was ever really
   * doing the work: a student at 12% reserve gets one card. Above that threshold the sheet
   * shows what is true, and it sits behind a button precisely so it is read when asked for.
   */
  it('shows all four when the day is bad enough to raise all four', () => {
    expect(visibleCards({ ...all, distress: true })).toEqual([
      'distress',
      'overfull',
      'stuck',
      'today',
    ])
  })

  it('shows exactly one below the low-energy threshold', () => {
    expect(visibleCards({ ...all, lowEnergy: true })).toEqual(['overfull'])
  })

  it("puts the day's question last, because it asks rather than offers", () => {
    expect(visibleCards({ ...all, overfull: false })).toEqual(['stuck', 'today'])
  })

  it('skips what does not apply rather than leaving a gap', () => {
    expect(visibleCards({ ...all, stuck: false })).toEqual(['overfull', 'today'])
  })

  /**
   * The lapse card is gone, and this is what stops it coming back by accident.
   *
   * Its trigger was a seven-day timer on a request-box commitment, which meant it could
   * never appear for a student who had not used the request box, lapsed every due commitment
   * at once because it could not tell which one tipped the week, and fired on a deficit that
   * might sit nowhere near the thing being withdrawn. The slot it held is now the overfull
   * day, which answers the question that timer was reaching for.
   */
  it('has no card for a lapsed commitment', () => {
    expect(visibleCards({ ...all, distress: true })).not.toContain('lapsed')
  })

  /**
   * Above everything.
   *
   * A student who has reported the bottom four days running is not helped by being told
   * which day is overfull or what is stuck, and leading with either would read as the app not
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
    expect(visibleCards({ ...all, distress: false })).toEqual(['overfull', 'stuck', 'today'])
  })
})
