import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, type CalibrationProfile } from '../../domain/calibration'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { CLUTTER_PLACEHOLDER, isClutterId, OBJECT_ORDER, type ObjectId } from './objects'
import { roomModel, type RoomModelInput } from './roomModel'

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'laundry',
  title: 'Laundry',
  type: 'errands',
  kind: 'errands',
  hours: 1,
  intensity: 1,
  dayIndex: 2,
  startHour: 17,
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

const profile = (over: Partial<CalibrationProfile> = {}): CalibrationProfile => ({
  ...DEFAULT_PROFILE,
  ...over,
})

const input = (over: Partial<RoomModelInput> = {}): RoomModelInput => ({
  schedule: week(),
  profile: DEFAULT_PROFILE,
  today: 0,
  ...over,
})

/**
 * Nine hand-built situations rather than generated ones. Each is a state a student can
 * actually be in, and naming them is what makes a parity failure legible -- a random seed
 * would say "these disagreed" without saying when.
 */
const SCENARIOS: ReadonlyArray<{ name: string; input: RoomModelInput }> = [
  { name: 'a comfortable week', input: input() },
  {
    name: 'a depleted week',
    input: input({ schedule: week({ start: { mental: 22, physical: 22, social: 22, errands: 22 } }) }),
  },
  {
    name: 'the door lit',
    input: input({ schedule: week({ start: { mental: 70, physical: 20, social: 20, errands: 70 } }) }),
  },
  { name: 'a task to clear', input: input({ schedule: week({ items: [item()] }) }) },
  {
    name: 'a block awaiting confirmation',
    input: input({ schedule: week({ items: [item({ dayIndex: 0 })] }) }),
  },
  {
    name: 'a lapsed commitment',
    input: input({
      schedule: week({
        start: { mental: 22, physical: 22, social: 22, errands: 22 },
        commitments: [{ id: 'c1', title: 'Committee', reviewDay: -1, itemId: 'x' }],
      }),
    }),
  },
  {
    name: 'a prediction awaiting a report',
    input: input({
      profile: profile({ predictions: [{ forDate: '2026-09-09', predicted: 60, reported: null }] }),
      schedule: { ...week(), startedOn: '2026-09-09' },
    }),
  },
  { name: 'calibration untouched', input: input({ profile: DEFAULT_PROFILE }) },
  {
    name: 'calibration done',
    input: input({ profile: profile({ modeChosen: true, painted: true }) }),
  },
]

describe('roomModel', () => {
  /**
   * Attention is asserted per situation, naming the object that should be signalling.
   *
   * My first attempt here compared `attentiveObjects(model)` with the marked rows -- which
   * is a tautology, because both derive from `model.rows`. It could never have failed. The
   * real parity worth testing is between what the *room renders* and what the *sidebar
   * renders*, and that belongs at component level, not here.
   *
   * What is worth testing at this level is that each situation lights the right object.
   */
  const marked = (over: Partial<RoomModelInput> = {}) =>
    new Set(roomModel(input(over)).rows.filter((row) => row.attention).map((row) => row.id))

  it('lights the door when getting outside is the move', () => {
    expect(marked(SCENARIOS[2]!.input)).toContain('door')
  })

  it('marks the phone when a commitment has lapsed', () => {
    expect(marked(SCENARIOS[5]!.input)).toContain('phone')
  })

  it('marks the papers when a block is waiting to be confirmed', () => {
    expect(marked(SCENARIOS[4]!.input)).toContain('papers')
  })

  it('marks the character when a prediction needs scoring', () => {
    expect(marked(SCENARIOS[6]!.input)).toContain('character')
  })

  it('marks the mirror while calibration is thin, and stops once it is not', () => {
    expect(marked(SCENARIOS[7]!.input)).toContain('mirror')
    expect(marked(SCENARIOS[8]!.input)).not.toContain('mirror')
  })

  /** These carry state and nothing more, so they must never ask for anybody. */
  it('never asks for attention on the objects that only report', () => {
    for (const scenario of SCENARIOS) {
      const attentive = marked(scenario.input)

      for (const id of ['plant', 'light', 'window', 'desk'] as const) {
        expect(attentive, `${scenario.name}: ${id}`).not.toContain(id)
      }
    }
  })

  it('gives every row a reading, so the list says something before anything is tapped', () => {
    for (const scenario of SCENARIOS) {
      for (const row of roomModel(scenario.input).rows) {
        expect(row.reading.length, `${scenario.name}: ${row.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('gives every row the label its object carries', () => {
    for (const row of roomModel(input()).rows) {
      expect(row.label.length, row.id).toBeGreaterThan(2)
    }
  })

  /**
   * Fixed order, and it must not move when attention changes -- a list that reorders itself
   * has to be re-learned every visit.
   */
  it('lists rows in the fixed order', () => {
    const positionOf = (id: ObjectId) =>
      OBJECT_ORDER.indexOf((isClutterId(id) ? CLUTTER_PLACEHOLDER : id) as never)

    for (const scenario of SCENARIOS) {
      const positions = roomModel(scenario.input).rows.map((row) => positionOf(row.id))

      expect([...positions], scenario.name).toEqual([...positions].sort((a, b) => a - b))
    }
  })

  it('does not reorder when something starts asking for attention', () => {
    const calm = roomModel(input()).rows.map((row) => row.id)
    const busy = roomModel(SCENARIOS[1]!.input).rows.map((row) => row.id)

    expect(busy.filter((id) => !isClutterId(id))).toEqual(calm.filter((id) => !isClutterId(id)))
  })

  it('expands clutter into one row per task', () => {
    const rows = roomModel(input({ schedule: week({ items: [item(), item({ id: 'bins' })] }) })).rows

    expect(rows.filter((row) => isClutterId(row.id))).toHaveLength(2)
  })

  it('has no clutter rows for a week with nothing to clear', () => {
    expect(roomModel(input()).rows.filter((row) => isClutterId(row.id))).toHaveLength(0)
  })

  it('carries the room state the drawing needs', () => {
    const model = roomModel(input())

    expect(model.state.lightLevel).toBeGreaterThan(0)
    expect(model.state.character).toBeTruthy()
  })

  // Silence is a real answer: nothing wrong means nothing marked.
  it('marks nothing in a calm, calibrated week', () => {
    expect(marked({ profile: profile({ modeChosen: true, painted: true }) }).size).toBe(0)
  })
})
