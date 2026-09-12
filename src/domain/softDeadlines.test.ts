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
    )

    // Charging it here as well as in deadlinePressure would double-count one effect.
    expect(find(stamped, 'x').softDeadlineDay).toBeUndefined()
  })

  it('gives a fixed block its own day', () => {
    const stamped = stampSoftDeadlines(
      week({ items: [item({ id: 'x', fixed: true, dayIndex: 6 })] }),
      0,
    )

    expect(find(stamped, 'x').softDeadlineDay).toBe(6)
  })

  /**
   * From the block's own day, not from today.
   *
   * Counted from today, one number covered the whole fortnight: on day 7 every study block
   * anywhere in the week was stamped due on day 12 -- the one on day 9 and the one on day 20
   * alike -- so everything past day 12 was born already late. Three quarters of a real
   * account's movable blocks were in that state, and `deferItem` refused them all, because a
   * deadline behind the block leaves it no later day to search.
   *
   * The interval answers "how long may this kind of thing wait", and the thing it has to wait
   * from is when it is scheduled.
   */
  it('gives an undated task the interval for its kind, counted from its own day', () => {
    const stamped = stampSoftDeadlines(
      week({ items: [item({ id: 'x', kind: 'errands', type: 'errands', dayIndex: 9 })] }),
      2,
    )

    expect(find(stamped, 'x').softDeadlineDay).toBe(9 + SOFT_DEADLINE_INTERVALS.errands)
  })

  /** The property the old rule broke, stated directly: a block is never born late. */
  it('never dates a block before the day it sits on', () => {
    const stamped = stampSoftDeadlines(
      week({
        items: [
          item({ id: 'far', kind: 'studyBlock', dayIndex: 19 }),
          item({ id: 'soon', kind: 'rest', dayIndex: 8 }),
        ],
      }),
      7,
    )

    for (const id of ['far', 'soon']) {
      const found = find(stamped, id)
      expect(found.softDeadlineDay).toBeGreaterThan(found.dayIndex)
    }
  })

  it('does not move a task deadline it has already set', () => {
    // The whole point of the feature. If re-stamping pushed the wall forward every time
    // the week was loaded, deferring would stay free and nothing would have changed.
    const once = stampSoftDeadlines(week({ items: [item({ id: 'x' })] }), 0)
    const twice = stampSoftDeadlines(once, 6)

    expect(find(twice, 'x').softDeadlineDay).toBe(find(once, 'x').softDeadlineDay)
  })

  /**
   * Rhythms are dated the same way now, and that is the change.
   *
   * They used to be dated from the last confirmed occurrence plus an interval, which ignored
   * where the block was scheduled entirely: badminton last played on day 4 with a 3-day
   * interval was "due day 7" even when the next game sat on day 11, so it was four days late
   * before anybody touched it.
   *
   * The signal that rule carried is not lost. `missedSoftDeadlines` keeps its own
   * last-confirmed check for a rhythm with *nothing scheduled at all* -- which is the case
   * that actually means "you have not exercised in a while" -- and that is where it belongs:
   * a question about the gap between occurrences, not about one scheduled block.
   */
  it('dates a rhythm from its own day too', () => {
    const stamped = stampSoftDeadlines(
      week({ items: [item({ id: 'r', kind: 'rest', dayIndex: 4 })] }),
      2,
    )

    expect(find(stamped, 'r').softDeadlineDay).toBe(4 + SOFT_DEADLINE_INTERVALS.rest)
  })

  /** Unchanged, and the reason the rule above is "set once": recomputing on every load would
   *  walk the wall forward with the block, and deferring would be free again. */
  it('does not move a rhythm deadline it has already set', () => {
    const once = stampSoftDeadlines(
      week({ items: [item({ id: 'r', kind: 'rest', dayIndex: 4 })] }),
      2,
    )
    const moved = {
      ...once,
      items: once.items.map((entry) => ({ ...entry, dayIndex: 9 })),
    }

    expect(find(stampSoftDeadlines(moved, 3), 'r').softDeadlineDay).toBe(
      find(once, 'r').softDeadlineDay,
    )
  })

  it('leaves a past block on the day it was due', () => {
    const stamped = stampSoftDeadlines(
      week({ items: [item({ id: 'x', kind: 'rest', dayIndex: 1 })] }),
      5,
    )

    expect(find(stamped, 'x').softDeadlineDay).toBe(1)
  })

  it('stamps a week saved before soft deadlines existed', () => {
    const stamped = stampSoftDeadlines(week({ items: [item({ id: 'x' })] }), 0)

    expect(find(stamped, 'x').softDeadlineDay).toBeDefined()
  })
})

describe('missedSoftDeadlines', () => {
  it('reports nothing for a week that is keeping up', () => {
    const schedule = stampSoftDeadlines(
      week({ items: [item({ id: 'x', kind: 'rest', dayIndex: 0 })] }),
      0,
    )

    expect(missedSoftDeadlines(schedule, 0, [])).toEqual([])
  })

  /**
   * Late means past the day *and* past the grace the kind allows, which is what dating from
   * the block's own day now means: an errand planned for day 9 may wait its seven days, so it
   * is not a miss until day 16. Under the old rule its deadline came from the day the week
   * happened to be stamped, so the same block could read as late before its own day arrived.
   */
  it('reports a block whose day went by and whose grace has run out', () => {
    const schedule = stampSoftDeadlines(
      week({ items: [item({ id: 'x', kind: 'errands', type: 'errands', dayIndex: 9 })] }),
      0,
    )

    expect(missedSoftDeadlines(schedule, 12, []).map((miss) => miss.itemId)).not.toContain('x')

    const errand = missedSoftDeadlines(schedule, 20, []).find((miss) => miss.itemId === 'x')
    expect(errand?.daysLate).toBe(20 - (9 + SOFT_DEADLINE_INTERVALS.errands))
  })

  it('does not report a block that is still ahead, however late it is scheduled', () => {
    // A plan running late, not a failure. Reporting it meant the app went on saying "you
    // have not rested in nine days" after the student had booked the rest.
    const schedule = stampSoftDeadlines(
      week({ items: [item({ id: 'x', kind: 'errands', type: 'errands', dayIndex: 20 })] }),
      0,
    )

    expect(missedSoftDeadlines(schedule, 12, []).map((miss) => miss.itemId)).not.toContain('x')
  })

  it('does not report a block the student confirmed done', () => {
    const schedule = stampSoftDeadlines(
      week({ items: [item({ id: 'x', kind: 'errands', type: 'errands', dayIndex: 9 })] }),
      0,
    )

    const missed = missedSoftDeadlines(schedule, 12, [record({ blockId: 'x', dayIndex: 9 })])

    expect(missed.map((miss) => miss.itemId)).not.toContain('x')
  })

  it('reports a rhythm with nothing scheduled for it at all', () => {
    // The case prescribe actually needs: nine days without seeing anyone, and no social
    // block in the week to hang the miss on.
    const missed = missedSoftDeadlines(stampSoftDeadlines(week(), 0), 9, [])
    const social = missed.find((miss) => miss.kind === 'socialRestorative')

    expect(social?.itemId).toBeNull()
    expect(social?.daysLate).toBe(9 - (SOFT_DEADLINE_INTERVALS.socialRestorative - 1))
  })

  /**
   * The clock runs from the *last* time it happened, not the first.
   *
   * `lastConfirmedByKind` keeps the greatest confirmed day per kind, and this is the case
   * that tells the two apart: rested on day 1 and again on day 3, a student is three days
   * in, not one. Taking the earlier one would report them overdue while they were keeping up.
   */
  it('dates an absent rhythm from the latest confirmed one, not the earliest', () => {
    const rest = (id: string, dayIndex: number): ScheduledItem => ({
      ...item({ id, kind: 'rest', dayIndex }),
    })
    const schedule = stampSoftDeadlines(
      week({ items: [rest('early', 1), rest('late', 3)] }),
      0,
    )
    const answered = (blockId: string, dayIndex: number): BlockRecord =>
      record({ blockId, dayIndex, answer: 'right' })

    const missed = missedSoftDeadlines(schedule, 9, [answered('early', 1), answered('late', 3)])
    const gap = missed.find((miss) => miss.kind === 'rest')

    expect(gap?.itemId).toBeNull()
    expect(gap?.daysLate).toBe(9 - (3 + SOFT_DEADLINE_INTERVALS.rest))
  })

  it('puts the most neglected first', () => {
    const missed = missedSoftDeadlines(stampSoftDeadlines(week(), 0), 9, [])

    const late = missed.map((miss) => miss.daysLate)
    expect(late).toEqual([...late].sort((a, b) => b - a))
  })
})
