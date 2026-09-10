import { describe, expect, it } from 'vitest'
import { BLOCK_KINDS, HORIZON_DAYS, type BlockKind } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import type { BlockRecord } from './blockLog'
import {
  effectiveDeadline,
  missedSoftDeadlines,
  RHYTHM_KINDS,
  SOFT_DEADLINE_INTERVALS,
  stampSoftDeadlines,
} from './softDeadlines'

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'a',
  title: 'Study',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 3,
  startHour: 10,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const record = (over: Partial<BlockRecord> = {}): BlockRecord => ({
  blockId: 'a',
  type: 'mental',
  plannedHours: 2,
  dayIndex: 0,
  answer: 'right',
  answeredAt: 0,
  ...over,
})

const find = (schedule: Schedule, id: string): ScheduledItem =>
  schedule.items.find((candidate) => candidate.id === id) as ScheduledItem

describe('SOFT_DEADLINE_INTERVALS', () => {
  it('covers every kind a block may carry', () => {
    // Walks BLOCK_KINDS rather than listing them, so a new kind cannot be added to the
    // engine without an interval here -- the failure this table exists to prevent is a
    // kind that silently gets no deadline and so goes back to costing nothing.
    for (const kind of BLOCK_KINDS) {
      expect(SOFT_DEADLINE_INTERVALS[kind], kind).toBeGreaterThan(0)
    }
  })

  it('treats only rhythms as regenerating', () => {
    for (const kind of RHYTHM_KINDS) {
      expect(BLOCK_KINDS).toContain(kind)
    }

    expect(RHYTHM_KINDS).not.toContain('studyBlock' satisfies BlockKind)
  })
})

describe('effectiveDeadline', () => {
  it('prefers a real deadline over a synthetic one', () => {
    expect(effectiveDeadline(item({ deadlineDay: 4, softDeadlineDay: 9 }))).toBe(4)
  })

  it('falls back to the synthetic one', () => {
    expect(effectiveDeadline(item({ deadlineDay: null, softDeadlineDay: 9 }))).toBe(9)
  })

  it('is null when the item has neither', () => {
    expect(effectiveDeadline(item({ deadlineDay: null }))).toBeNull()
  })
})

describe('stampSoftDeadlines', () => {
  it('leaves an item that already has a real deadline alone', () => {
    const stamped = stampSoftDeadlines(
      week({ items: [item({ id: 'x', deadlineDay: 5 })] }),
      0,
      [],
    )

    // Charging it here as well as in deadlinePressure would double-count one effect.
    expect(find(stamped, 'x').softDeadlineDay).toBeUndefined()
  })

  it('gives a fixed block its own day', () => {
    const stamped = stampSoftDeadlines(
      week({ items: [item({ id: 'x', fixed: true, dayIndex: 6 })] }),
      0,
      [],
    )

    expect(find(stamped, 'x').softDeadlineDay).toBe(6)
  })

  it('gives an undated task the interval for its kind, counted from today', () => {
    const stamped = stampSoftDeadlines(
      week({ items: [item({ id: 'x', kind: 'errands', type: 'errands' })] }),
      2,
      [],
    )

    expect(find(stamped, 'x').softDeadlineDay).toBe(2 + SOFT_DEADLINE_INTERVALS.errands)
  })

  it('does not move a task deadline it has already set', () => {
    // The whole point of the feature. If re-stamping pushed the wall forward every time
    // the week was loaded, deferring would stay free and nothing would have changed.
    const once = stampSoftDeadlines(week({ items: [item({ id: 'x' })] }), 0, [])
    const twice = stampSoftDeadlines(once, 6, [])

    expect(find(twice, 'x').softDeadlineDay).toBe(find(once, 'x').softDeadlineDay)
  })

  it('dates a rhythm from the start of the fortnight when nothing was ever confirmed', () => {
    const stamped = stampSoftDeadlines(
      week({ items: [item({ id: 'r', kind: 'rest', dayIndex: 4 })] }),
      2,
      [],
    )

    // Anchored at the fortnight rather than at today, and that is the whole mechanism.
    // Anchoring "never done" at yesterday would re-date the rhythm on every load, so its
    // deadline would walk forward with the calendar and could never actually be missed.
    expect(find(stamped, 'r').softDeadlineDay).toBe(SOFT_DEADLINE_INTERVALS.rest - 1)
  })

  it('pushes the next rest forward when one was confirmed done', () => {
    const stamped = stampSoftDeadlines(
      week({
        items: [
          item({ id: 'done', kind: 'rest', dayIndex: 3 }),
          item({ id: 'next', kind: 'rest', dayIndex: 5 }),
        ],
      }),
      4,
      [record({ blockId: 'done', dayIndex: 3, answer: 'right' })],
    )

    // Rested on day 3, so the next one is not due until day 4.
    expect(find(stamped, 'next').softDeadlineDay).toBe(4)
  })

  it('does not let a merely scheduled rest push the deadline forward', () => {
    // A plan is not evidence. Crediting one would let a student satisfy the model by
    // intending to rest.
    const stamped = stampSoftDeadlines(
      week({
        items: [
          item({ id: 'planned', kind: 'rest', dayIndex: 3 }),
          item({ id: 'next', kind: 'rest', dayIndex: 5 }),
        ],
      }),
      4,
      [],
    )

    // Nothing confirmed, so the clock still runs from the fortnight's start -- unlike the
    // case above, where a confirmed rest moved it to day 4.
    expect(find(stamped, 'next').softDeadlineDay).toBe(SOFT_DEADLINE_INTERVALS.rest - 1)
  })

  it('does not credit a rest the student said did not happen', () => {
    const stamped = stampSoftDeadlines(
      week({ items: [item({ id: 'r', kind: 'rest', dayIndex: 5 })] }),
      4,
      [record({ blockId: 'r', dayIndex: 3, answer: 'didnt' })],
    )

    // Identical to having no record at all. An answer of `didnt` is evidence the rest did
    // not happen, so it must not move the clock the way `right` does.
    expect(find(stamped, 'r').softDeadlineDay).toBe(SOFT_DEADLINE_INTERVALS.rest - 1)
  })

  it('spaces successive rhythm blocks one interval apart', () => {
    const stamped = stampSoftDeadlines(
      week({
        items: [
          item({ id: 'first', kind: 'socialRestorative', type: 'social', dayIndex: 2 }),
          item({ id: 'second', kind: 'socialRestorative', type: 'social', dayIndex: 9 }),
        ],
      }),
      0,
      [],
    )

    const interval = SOFT_DEADLINE_INTERVALS.socialRestorative
    expect(find(stamped, 'first').softDeadlineDay).toBe(interval - 1)
    expect(find(stamped, 'second').softDeadlineDay).toBe(interval * 2 - 1)
  })

  it('leaves a past block on the day it was due', () => {
    const stamped = stampSoftDeadlines(
      week({ items: [item({ id: 'x', kind: 'rest', dayIndex: 1 })] }),
      5,
      [],
    )

    expect(find(stamped, 'x').softDeadlineDay).toBe(1)
  })

  it('stamps a week saved before soft deadlines existed', () => {
    const stamped = stampSoftDeadlines(week({ items: [item({ id: 'x' })] }), 0, [])

    expect(find(stamped, 'x').softDeadlineDay).toBeDefined()
  })
})

describe('missedSoftDeadlines', () => {
  it('reports nothing for a week that is keeping up', () => {
    const schedule = stampSoftDeadlines(
      week({ items: [item({ id: 'x', kind: 'rest', dayIndex: 0 })] }),
      0,
      [],
    )

    expect(missedSoftDeadlines(schedule, 0, [])).toEqual([])
  })

  it('reports a block whose day went by without it happening', () => {
    const schedule = stampSoftDeadlines(
      week({ items: [item({ id: 'x', kind: 'errands', type: 'errands', dayIndex: 9 })] }),
      0,
      [],
    )

    const errand = missedSoftDeadlines(schedule, 12, []).find((miss) => miss.itemId === 'x')

    expect(errand?.daysLate).toBe(12 - SOFT_DEADLINE_INTERVALS.errands)
  })

  it('does not report a block that is still ahead, however late it is scheduled', () => {
    // A plan running late, not a failure. Reporting it meant the app went on saying "you
    // have not rested in nine days" after the student had booked the rest.
    const schedule = stampSoftDeadlines(
      week({ items: [item({ id: 'x', kind: 'errands', type: 'errands', dayIndex: 20 })] }),
      0,
      [],
    )

    expect(missedSoftDeadlines(schedule, 12, []).map((miss) => miss.itemId)).not.toContain('x')
  })

  it('does not report a block the student confirmed done', () => {
    const schedule = stampSoftDeadlines(
      week({ items: [item({ id: 'x', kind: 'errands', type: 'errands', dayIndex: 9 })] }),
      0,
      [],
    )

    const missed = missedSoftDeadlines(schedule, 12, [record({ blockId: 'x', dayIndex: 9 })])

    expect(missed.map((miss) => miss.itemId)).not.toContain('x')
  })

  it('reports a rhythm with nothing scheduled for it at all', () => {
    // The case prescribe actually needs: nine days without seeing anyone, and no social
    // block in the week to hang the miss on.
    const missed = missedSoftDeadlines(stampSoftDeadlines(week(), 0, []), 9, [])
    const social = missed.find((miss) => miss.kind === 'socialRestorative')

    expect(social?.itemId).toBeNull()
    expect(social?.daysLate).toBe(9 - (SOFT_DEADLINE_INTERVALS.socialRestorative - 1))
  })

  it('puts the most neglected first', () => {
    const missed = missedSoftDeadlines(stampSoftDeadlines(week(), 0, []), 9, [])

    const late = missed.map((miss) => miss.daysLate)
    expect(late).toEqual([...late].sort((a, b) => b - a))
  })
})
