import { describe, expect, it } from 'vitest'
import { MAX_INSIGHT_LINE, parseInsightReply } from './insightSchema'

/**
 * Where a rephrasing stops being a rephrasing.
 *
 * The facts come from `domain/reserveInsight`; the model may only say them better. One line
 * for one line is what makes that checkable -- §8.2 forbids the app describing a week the
 * model did not simulate, and a sentence a language model added about somebody's reserves
 * is exactly that however plausible it reads.
 */
describe('parseInsightReply', () => {
  it('takes a reply that says the same number of things', () => {
    expect(parseInsightReply({ lines: ['a', 'b'] }, 2)).toEqual(['a', 'b'])
  })

  it('refuses a reply that added a claim of its own', () => {
    expect(parseInsightReply({ lines: ['a', 'b', 'c'] }, 2)).toBeNull()
  })

  /** A dropped line is a deleted warning, and the student would never know one was missing. */
  it('refuses a reply that quietly dropped one', () => {
    expect(parseInsightReply({ lines: ['a'] }, 2)).toBeNull()
  })

  it('accepts the bare array models keep sending instead of the wrapper', () => {
    expect(parseInsightReply(['a'], 1)).toEqual(['a'])
  })

  it('refuses an essay in place of a line', () => {
    expect(parseInsightReply({ lines: ['x'.repeat(MAX_INSIGHT_LINE + 1)] }, 1)).toBeNull()
  })

  it('refuses an empty line, which would render as a gap in the block', () => {
    expect(parseInsightReply({ lines: ['  '] }, 1)).toBeNull()
  })

  it('refuses anything that is not the shape at all', () => {
    expect(parseInsightReply('sure, here you go', 1)).toBeNull()
    expect(parseInsightReply(null, 1)).toBeNull()
  })
})
