import { describe, expect, it } from 'vitest'
import { parseWithRules } from './fallbackParser'

// §3.1's own example, near enough verbatim.
const brainDump =
  "essay due friday 2000 words haven't started, mums birthday sunday need a present, " +
  'gym been skipping, group meeting sometime this week, laundry, that internship application'

/**
 * The parser that runs when there is no key: in the test suite, in CI, in local
 * development, and on stage if the network dies. §10 requires a hardcoded fallback for
 * every external dependency, and this is the one that matters most -- a student with no
 * model available still gets a structured week.
 */
describe('parseWithRules', () => {
  it('splits a brain dump into separate items', () => {
    expect(parseWithRules(brainDump).length).toBeGreaterThanOrEqual(5)
  })

  it('keeps what the student wrote as the title', () => {
    expect(parseWithRules('laundry')[0]?.title.toLowerCase()).toContain('laundry')
  })

  it('splits on newlines as well as commas, because people type both', () => {
    expect(parseWithRules('essay\ngym\nlaundry')).toHaveLength(3)
  })

  it('ignores empty fragments from trailing punctuation', () => {
    expect(parseWithRules('laundry,,,')).toHaveLength(1)
  })

  it('returns nothing for an empty dump', () => {
    expect(parseWithRules('')).toEqual([])
    expect(parseWithRules('   ')).toEqual([])
  })

  // Load types are what the engine reasons in, so reading them is the parser's most
  // valuable job -- a gym session counted as study would distort the whole projection.
  it('reads study work as mental load', () => {
    expect(parseWithRules('finish the essay')[0]?.type).toBe('mental')
  })

  it('reads exercise as physical load', () => {
    expect(parseWithRules('gym been skipping')[0]?.type).toBe('physical')
  })

  it('reads seeing people as social load', () => {
    expect(parseWithRules('coffee with sarah')[0]?.type).toBe('social')
  })

  it('reads chores as errands', () => {
    expect(parseWithRules('laundry')[0]?.type).toBe('errands')
  })

  it('falls back to errands when nothing in the words says otherwise', () => {
    expect(parseWithRules('that thing i keep forgetting')[0]?.type).toBe('errands')
  })

  it('reads an explicit day into a deadline', () => {
    const item = parseWithRules('essay due friday', 0)[0]

    expect(item?.deadlineDay).not.toBeNull()
    expect(item?.hard).toBe(true)
  })

  it('leaves items with no stated deadline undated and soft', () => {
    const item = parseWithRules('gym')[0]

    expect(item?.deadlineDay).toBeNull()
    expect(item?.hard).toBe(false)
  })

  it('reads a word count into a bigger effort estimate', () => {
    const essay = parseWithRules('essay 2000 words')[0]
    const chore = parseWithRules('laundry')[0]

    expect(essay?.hours).toBeGreaterThan(chore?.hours ?? 0)
  })

  it('reads a stated number of hours', () => {
    expect(parseWithRules('revision 3 hours')[0]?.hours).toBe(3)
  })

  /**
   * §1.4: low-confidence rows are flagged rather than silently guessed. Both directions
   * are tested, because a flag that is always on carries no information.
   */
  it('flags a guess it is not sure about', () => {
    expect(parseWithRules('that internship application')[0]?.confident).toBe(false)
  })

  it('is confident about something it read a real signal from', () => {
    expect(parseWithRules('gym')[0]?.confident).toBe(true)
  })

  it('gives every item its own id', () => {
    const ids = parseWithRules(brainDump).map((item) => item.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never returns more items than a fortnight can hold', () => {
    const huge = Array.from({ length: 60 }, (_, i) => `task ${i}`).join(', ')

    expect(parseWithRules(huge).length).toBeLessThanOrEqual(25)
  })

  it('tells hard training from a walk, using signal words it already has', () => {
    expect(parseWithRules('gym')[0]?.kind).toBe('hardExercise')
    expect(parseWithRules('walk')[0]?.kind).toBe('lightExercise')
  })

  it('lets a student type rest and get rest, rather than a study block', () => {
    const [nap] = parseWithRules('nap for an hour')

    expect(nap?.kind).toBe('rest')
  })

  it('keeps social pessimistic, because a parse cannot tell a friend from a group project', () => {
    expect(parseWithRules('coffee with sarah')[0]?.kind).toBe('socialDraining')
  })

  /**
   * §1.4/doctrine in `addItems`: crediting recovery that never happened reports a student as
   * fine while they sink. `REST_WORDS` matched with bare `includes`, so "restaurant" and
   * "breakfast" silently became confident rest -- a social obligation recorded as recovery,
   * unflagged for correction. Word-boundary matching closes it.
   */
  it('does not read "restaurant" as rest just because it contains "rest"', () => {
    const item = parseWithRules('dinner at the restaurant')[0]

    expect(item?.kind).not.toBe('rest')
  })

  it('does not read "breakfast" as rest just because it contains "break"', () => {
    const item = parseWithRules('breakfast with mum')[0]

    expect(item?.kind).not.toBe('rest')
    // Nothing in "breakfast with mum" is a real signal word, so it must be flagged rather
    // than confidently misread.
    expect(item?.confident).toBe(false)
  })
})
