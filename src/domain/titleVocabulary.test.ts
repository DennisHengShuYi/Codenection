import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import type { BlockRecord } from './blockLog'
import { titleVocabulary } from './titleVocabulary'

/** Most of these are about which name comes back and in what order, so they read the titles
 *  out of the entries. The kind on each is covered on its own below. */
const titles = (input: Parameters<typeof titleVocabulary>[0]): string[] =>
  titleVocabulary(input).map((entry) => entry.title)

/**
 * What this student has called things before.
 *
 * §2.4's narrow rungs group answers by title, and `taskKey` does what it can with the words
 * -- but the cheapest fix for "gym" and "Gym session" ending up in two buckets is the
 * student never typing the second one. Offered back while they type, the obvious name is one
 * tap away and the split never happens.
 *
 * It reads two places on purpose. The block log is what they have answered for, which is
 * what the buckets are actually made of; the week is what they have written down since,
 * including things typed an hour ago and not yet lived. A vocabulary drawn from the log
 * alone would forget a name until the first answer came in -- which is exactly the window
 * where a second spelling gets invented.
 */
const item = (title: string, over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: title,
  title,
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 1,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const answered = (title: string, answeredAt: number): BlockRecord => ({
  blockId: `${title}-${answeredAt}`,
  type: 'mental',
  kind: 'studyBlock',
  title,
  plannedHours: 2,
  dayIndex: 0,
  answer: 'right',
  answeredAt,
})

describe('titleVocabulary', () => {
  it('offers what the student has answered for', () => {
    expect(titles({ schedule: week([]), blockLog: [answered('Gym', 1)] })).toContain('Gym')
  })

  it('offers what is written down but not yet lived', () => {
    expect(titles({ schedule: week([item('WIA3001 lab')]), blockLog: [] })).toContain(
      'WIA3001 lab',
    )
  })

  it('says each name once, however often it was used', () => {
    const vocabulary = titles({
      schedule: week([item('Gym')]),
      blockLog: [answered('Gym', 1), answered('Gym', 2)],
    })

    expect(vocabulary.filter((name) => name === 'Gym')).toHaveLength(1)
  })

  /** The point of the whole thing: one spelling comes back, so the student taps rather than
   *  inventing a second. The one they use most is the one they meant. */
  it('keeps the spelling used most often', () => {
    const vocabulary = titles({
      schedule: week([]),
      blockLog: [answered('gym', 1), answered('Gym', 2), answered('Gym', 3)],
    })

    expect(vocabulary).toContain('Gym')
    expect(vocabulary).not.toContain('gym')
  })

  it('puts what is used most at the top', () => {
    const vocabulary = titles({
      schedule: week([]),
      blockLog: [answered('Gym', 1), answered('Gym', 2), answered('Essay', 3)],
    })

    expect(vocabulary[0]).toBe('Gym')
  })

  /** A tie on frequency goes to whatever was touched last: this term's modules beat last
   *  term's, without anything having to know what a term is. */
  it('breaks a tie with whatever was used most recently', () => {
    const vocabulary = titles({
      schedule: week([]),
      blockLog: [answered('Old module', 1), answered('New module', 9)],
    })

    expect(vocabulary[0]).toBe('New module')
  })

  it('leaves out blank titles rather than offering an empty line', () => {
    expect(titles({ schedule: week([item('   ')]), blockLog: [] })).toEqual([])
  })

  it('stops at a length a dropdown can actually be read at', () => {
    const many = Array.from({ length: 40 }, (_, index) => item(`Thing ${index}`, { id: `i${index}` }))

    expect(titles({ schedule: week(many), blockLog: [] }).length).toBeLessThanOrEqual(12)
  })
})

/**
 * The week is now; the log is the past.
 *
 * Recency inside the log is a real timestamp, and the week has none -- its order is all
 * there is. Standing that order in directly made every week-only name older than every
 * answered one, so something typed an hour ago sank below a module last answered in
 * September. Whatever is in the week the student is looking at is the most recent thing
 * there is.
 */
describe('a name from the current week against one from history', () => {
  it('ranks the one in this week as the more recent', () => {
    const vocabulary = titles({
      schedule: week([item('Typed just now')]),
      blockLog: [answered('Answered in September', 9_999_999)],
    })

    expect(vocabulary[0]).toBe('Typed just now')
  })

  it('still ranks by how often, before how recently', () => {
    const vocabulary = titles({
      schedule: week([item('Typed just now')]),
      blockLog: [answered('Gym', 1), answered('Gym', 2)],
    })

    expect(vocabulary[0]).toBe('Gym')
  })
})
