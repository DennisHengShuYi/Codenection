import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS, type Reserves } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { MAX_REST_HOURS, prescribeRest } from './prescribe'

const block = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'b1',
  title: 'Study',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 0,
  startHour: 9,
  fixed: true,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: readonly ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const reserves = (over: Partial<Reserves> = {}): Reserves => ({
  mental: 70,
  physical: 70,
  social: 70,
  errands: 70,
  ...over,
})

/** A day with nothing on it, so a gap is always available unless a test says otherwise. */
const emptyDay = week([])

describe('prescribeRest, choosing what to prescribe', () => {
  // §5.2: matched to the depleted type, not to whatever is convenient.
  it('prescribes a person when social is lowest', () => {
    const result = prescribeRest(emptyDay, reserves({ social: 20 }), 0)

    expect(result?.type).toBe('social')
    expect(result?.kind).toBe('socialRestorative')
  })

  it('prescribes movement when physical is lowest', () => {
    const result = prescribeRest(emptyDay, reserves({ physical: 20 }), 0)

    expect(result?.type).toBe('physical')
    expect(result?.kind).toBe('lightExercise')
  })

  // §5.2 is explicit that mental low means actual downtime, not a different screen.
  it('prescribes downtime when mental is lowest', () => {
    const result = prescribeRest(emptyDay, reserves({ mental: 20 }), 0)

    expect(result?.type).toBe('mental')
    expect(result?.kind).toBe('rest')
  })

  /**
   * §1.2: most trackers would count low social load as healthy, and flagging it instead is
   * what proves the model understands burnout rather than summing hours. The same has to be
   * true of what it prescribes.
   */
  it('treats low social as a deficit rather than as being unbothered', () => {
    const result = prescribeRest(emptyDay, reserves({ social: 14, mental: 80, physical: 80 }), 0)

    expect(result?.type).toBe('social')
  })

  // Errands is a load type but not something rest repairs, so it never decides the
  // prescription -- the lowest of the three that recovery actually serves does.
  it('never prescribes for errands, even when errands is lowest', () => {
    const result = prescribeRest(emptyDay, reserves({ errands: 5, mental: 30 }), 0)

    expect(result?.type).toBe('mental')
  })
})

describe('prescribeRest, fitting it into the day', () => {
  it('fits the suggestion into a real gap', () => {
    // Solid from the start of the day until 15:00, so the only room is after it. The block
    // starts at 8 rather than 9 on purpose: an earlier start would leave 08:00-09:00 free,
    // and finding *that* gap would be correct behaviour rather than the bug this asserts
    // against -- which is what the first version of this test got wrong.
    const day = week([block({ startHour: 8, hours: 7 })])

    const result = prescribeRest(day, reserves({ mental: 20 }), 0)

    expect(result?.startHour).toBeGreaterThanOrEqual(15)
  })

  it('offers nothing when the day has no gap at all', () => {
    const solid = week([block({ startHour: 8, hours: 14 })])

    expect(prescribeRest(solid, reserves({ mental: 20 }), 0)).toBeNull()
  })

  /**
   * §5.1: recovery has a ceiling as well as a floor. Past a point the returns go flat and
   * then negative, so an empty day must not produce an absurd twelve-hour suggestion.
   */
  it('does not suggest more rest than is useful, however long the gap', () => {
    const result = prescribeRest(emptyDay, reserves({ mental: 20 }), 0)

    expect(result?.hours).toBeLessThanOrEqual(MAX_REST_HOURS)
  })

  it('does not offer a gap too short to be worth taking', () => {
    // Ten minutes free between two long blocks, and nothing else all day.
    const day = week([
      block({ startHour: 8, hours: 6 }),
      block({ id: 'b2', startHour: 14.2, hours: 8 }),
    ])

    expect(prescribeRest(day, reserves({ mental: 20 }), 0)).toBeNull()
  })

  it('only considers the day it was asked about', () => {
    const day = week([block({ dayIndex: 1, startHour: 8, hours: 14 })])

    // Day 1 is full; day 0 is empty, so asking about day 0 still finds room.
    expect(prescribeRest(day, reserves({ mental: 20 }), 0)).not.toBeNull()
  })
})

describe('prescribeRest, what it produces', () => {
  // §5.2: one option only. A depleted person cannot choose from a menu, and every extra
  // option lowers the odds of any action at all.
  it('is one suggestion, not a list', () => {
    const result = prescribeRest(emptyDay, reserves({ mental: 20 }), 0)

    expect(Array.isArray(result)).toBe(false)
    expect(result).not.toBeNull()
  })

  it('names something concrete enough to actually do', () => {
    const result = prescribeRest(emptyDay, reserves({ physical: 20 }), 0)

    expect((result?.title.length ?? 0)).toBeGreaterThan(3)
  })

  // §5.1's most important design decision: recovery is structurally protected, so what is
  // scheduled has to be protected rest rather than an ordinary block the optimizer may move.
  it('is protected rest, which the optimizer may not move', () => {
    const result = prescribeRest(emptyDay, reserves({ mental: 20 }), 0)

    expect(result?.protectedRest).toBe(true)
  })

  it('gives the same answer for the same day and reserves', () => {
    const first = prescribeRest(emptyDay, reserves({ mental: 20 }), 0)
    const second = prescribeRest(emptyDay, reserves({ mental: 20 }), 0)

    expect(second).toEqual(first)
  })
})
