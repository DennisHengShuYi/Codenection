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

  /**
   * A stated day is a *deadline*, not a pinned time -- and an essay due Friday is the
   * clearest case of the difference. It cannot move past Friday and is completely free
   * before it, which makes it one of the most movable things in the week.
   *
   * This used to set `hard: true`, which nothing read. Now that the flag is honoured under
   * its real name, setting it here would pin the essay to an hour nobody chose and forbid
   * the optimizer from touching it.
   */
  it('reads an explicit day into a deadline without pinning a time', () => {
    const item = parseWithRules('essay due friday', 0)[0]

    expect(item?.deadlineDay).not.toBeNull()
    expect(item?.fixed).toBe(false)
  })

  it('leaves items with no stated deadline undated and movable', () => {
    const item = parseWithRules('gym')[0]

    expect(item?.deadlineDay).toBeNull()
    expect(item?.fixed).toBe(false)
  })

  /** The rules cannot read a *time* out of free text, so they never pin anything at all.
   *  Whatever a fragment says, the chip's checkbox is where a class becomes fixed. */
  it('never pins a block, whatever the words say', () => {
    const items = parseWithRules('lecture monday 9am, lab tuesday, shift friday', 0)

    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => item.fixed === false)).toBe(true)
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

/**
 * Ruling 43: the clock time, read by the rules as well as by the model.
 *
 * This parser is not a lesser path -- it is what runs whenever there is no key configured,
 * no /api under `vite dev`, a timeout, or a reply that fails validation. If only the model
 * could read a time, then a student's stated 9am would survive or vanish depending on
 * whether an endpoint happened to answer.
 */
describe('the stated time', () => {
  it.each([
    ['lecture tuesday 9am', 9],
    ['lecture tuesday 9 am', 9],
    ['shift at 9pm', 21],
    ['lab at 14:00', 14],
    ['seminar 09:30', 9],
    ['gym at 7.30am', 7],
    ['midnight shift at 12am', 0],
    ['lunch thing at 12pm', 12],
  ])('reads %s as hour %i', (text, startHour) => {
    expect(parseWithRules(text)[0]?.startHour).toBe(startHour)
  })

  it('says nothing about the hour when the text states none', () => {
    expect(parseWithRules('read chapter 3')[0]?.startHour).toBeNull()
  })

  /**
   * A number that is not a time must not become one. "3 hours" is an effort estimate and
   * "chapter 3" is a chapter -- neither is a student saying when something happens.
   */
  it.each(['fyp presentation 3 hours', 'read chapter 3', 'essay worth 40%'])(
    'does not invent an hour from %s',
    (text) => {
      expect(parseWithRules(text)[0]?.startHour).toBeNull()
    },
  )

  it('refuses an hour that is not one, rather than wrapping it round', () => {
    expect(parseWithRules('meeting at 25:00')[0]?.startHour).toBeNull()
  })
})

/**
 * Ruling 44: a named weekday has to land on that weekday.
 *
 * `deadlineOf` computed `(named - today % 7 + 7) % 7`, which reads `today % 7` as today's
 * weekday -- true only if day index 0 is a Sunday, and it is whatever weekday the student's
 * week actually began on. So "gym thursday" landed on a Monday, and the app then showed the
 * student that Monday in the chip's own Day select, which is where this was finally seen.
 *
 * The anchor is passed in rather than read from a clock: the parser is pure, and the caller
 * is the one holding the week.
 */
describe('a named weekday, against the real calendar', () => {
  // 2026-09-11 is a Friday, so day 0 is a Friday: weekday 5.
  const FRIDAY = 5

  it('puts thursday on the next thursday, not on an arbitrary index', () => {
    const item = parseWithRules('gym thursday 7pm', 0, FRIDAY)[0]

    // Friday + 6 = Thursday.
    expect(item?.deadlineDay).toBe(6)
  })

  it("puts the next day's weekday on tomorrow", () => {
    const item = parseWithRules('laundry saturday', 0, FRIDAY)[0]

    expect(item?.deadlineDay).toBe(1)
  })

  /** A named day that is today means next week's one, not this morning's -- unchanged, and
   *  now measured against the real weekday rather than an index modulo seven. */
  it("reads the current weekday as next week's one", () => {
    const item = parseWithRules('call home friday', 0, FRIDAY)[0]

    expect(item?.deadlineDay).toBe(7)
  })

  it('counts from wherever today sits in the horizon', () => {
    // Day 3 of a week starting Friday is a Monday; the next Thursday is three days later.
    const item = parseWithRules('gym thursday', 3, FRIDAY)[0]

    expect(item?.deadlineDay).toBe(6)
  })

  it('still reads no day where none is named', () => {
    expect(parseWithRules('read chapter 3', 0, FRIDAY)[0]?.deadlineDay).toBeNull()
  })
})
