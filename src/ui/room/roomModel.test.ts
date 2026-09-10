import { describe, expect, it } from 'vitest'
import type { BlockRecord } from '../../domain/blockLog'
import { DEFAULT_PROFILE, type BlockOutcome, type CalibrationProfile } from '../../domain/calibration'
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

  // Task 17: the mirror's "% tuned" reading fed `calibrationProgress`, which fed only its
  // own progress bar. Deleted along with the rest of calibration -- the mirror now renders
  // no row at all, and never asks for attention.
  it('never marks the mirror -- it has nothing left to report', () => {
    for (const scenario of SCENARIOS) {
      expect(marked(scenario.input), scenario.name).not.toContain('mirror')
    }
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
  it('marks nothing in a calm week', () => {
    expect(marked().size).toBe(0)
  })

  /**
   * §8b/Task 17: the block log is the only record of which blocks have already been asked
   * about. The profile's own `confirmedItemIds` was unioned with it until this task, when
   * every caller pointed at the log became the only source.
   */
  describe('the block log', () => {
    const block: BlockRecord = {
      blockId: 'laundry',
      type: 'errands',
      plannedHours: 1,
      dayIndex: 0,
      answer: 'right',
      answeredAt: 0,
    }

    it('stops asking about a block once the log carries an answer for it', () => {
      expect(marked(SCENARIOS[4]!.input)).toContain('papers')

      expect(marked({ ...SCENARIOS[4]!.input, blockLog: [block] })).not.toContain('papers')
    })

    it('defaults to an empty log when none is given, so every existing caller keeps working', () => {
      expect(marked(input())).toEqual(marked({ ...input(), blockLog: [] }))
    })

    /**
     * Ruling 10/16: `paramsFor` must read only the durable log. This used to be unioned
     * with `profile.confirmations` -- a field the profile no longer has, but a stored
     * settings blob saved before this task can still carry it (the loader ignores unknown
     * keys, per `useProfile.test.tsx`). Casting it back on here proves the union is really
     * gone rather than just untyped: reintroducing `...profile.confirmations` at this call
     * site makes this fail, because five overrunning "confirmations" measure a 2x mental
     * bias which -- against this heavy a mental schedule -- is enough to push the fortnight
     * into deficit where the log-only figure does not.
     */
    it('ignores confirmations carried on the profile, even a legacy blob with real ones', () => {
      const overrun: readonly BlockOutcome[] = Array.from({ length: 5 }, () => ({
        type: 'mental' as const,
        plannedHours: 2,
        actualHours: 4,
      }))
      const legacyProfile = { ...DEFAULT_PROFILE, confirmations: overrun } as unknown as CalibrationProfile
      const heavyMental = week({
        items: Array.from({ length: HORIZON_DAYS }, (_, day): ScheduledItem => ({
          id: `mental-${day}`,
          title: `mental-${day}`,
          type: 'mental',
          kind: 'studyBlock',
          hours: 6,
          intensity: 1,
          dayIndex: day,
          startHour: 9,
          fixed: false,
          deadlineDay: null,
          protectedRest: false,
        })),
      })

      const withLegacyField = roomModel(input({ profile: legacyProfile, schedule: heavyMental }))
      const withoutLegacyField = roomModel(input({ schedule: heavyMental }))

      const ceiling = (model: ReturnType<typeof roomModel>) =>
        model.rows.find((row) => row.id === 'ceiling')!.attention

      expect(ceiling(withLegacyField)).toBe(ceiling(withoutLegacyField))
    })
  })

  /**
   * Ruling 11 amended: `checkedInDays` exists and is unit-tested, but nothing in the
   * running app ever called it -- every `project()` call site hardcoded `checkedIn: true`
   * via `toDayInputs(schedule)`. Task 18's reachability guard tests the *parameter*, not
   * the wiring, so it would not catch this: only a test against `roomModel`'s own output
   * can. §8b's own warning is exact -- treating every silent past day as checked in
   * compounds to 2.68x pessimism nowhere, and treating it as MISSED (the bug this fixes)
   * compounds real pessimism that was previously invisible to the room.
   */
  describe('checkedIn, wired into the live projection', () => {
    const heavyMentalDay = (id: string, dayIndex: number): ScheduledItem => ({
      id,
      title: id,
      type: 'mental',
      kind: 'studyBlock',
      hours: 8,
      intensity: 1.3,
      dayIndex,
      startHour: 9,
      fixed: false,
      deadlineDay: null,
      protectedRest: false,
    })

    // Heavy enough that 20 consecutive UNANSWERED days push the fortnight into deficit by
    // day 7 (a storm), while the same 20 days all ANSWERED never cross the threshold at
    // all (clear) -- a real, numerically-verified divergence, not an assumption.
    const heavySchedule = week({
      items: Array.from({ length: 20 }, (_, day) => heavyMentalDay(`i${day}`, day)),
    })

    const fullyAnswered: BlockRecord[] = Array.from({ length: 20 }, (_, day) => ({
      blockId: `i${day}`,
      type: 'mental',
      plannedHours: 8,
      dayIndex: day,
      // 'right': actual matches planned, so this does not also shift the learned estimate
      // bias -- isolating the assertion to the checkedIn signal alone.
      answer: 'right',
      answeredAt: 0,
    }))

    it('reads as calm when every day up to today answered, and as a storm when none did', () => {
      const silent = roomModel({
        schedule: heavySchedule,
        profile: DEFAULT_PROFILE,
        today: 20,
        blockLog: [],
      })
      const checkedIn = roomModel({
        schedule: heavySchedule,
        profile: DEFAULT_PROFILE,
        today: 20,
        blockLog: fullyAnswered,
      })

      expect(silent.state.weather).toBe('storm')
      expect(checkedIn.state.weather).toBe('clear')
    })

    it('marks the ceiling for attention only once the missing check-ins compound', () => {
      const silentCeiling = roomModel({
        schedule: heavySchedule,
        profile: DEFAULT_PROFILE,
        today: 20,
        blockLog: [],
      }).rows.find((row) => row.id === 'ceiling')!
      const checkedInCeiling = roomModel({
        schedule: heavySchedule,
        profile: DEFAULT_PROFILE,
        today: 20,
        blockLog: fullyAnswered,
      }).rows.find((row) => row.id === 'ceiling')!

      expect(silentCeiling.attention).toBe(true)
      expect(checkedInCeiling.attention).toBe(false)
    })

    it('treats every day from today onward as checked in, never inflating the horizon itself', () => {
      // A day still ahead has nothing to check in about (§8b). Confirms `today` is passed
      // through rather than e.g. `today - 1`, which would wrongly mark today missed too.
      const atDayZero = roomModel({
        schedule: heavySchedule,
        profile: DEFAULT_PROFILE,
        today: 0,
        blockLog: [],
      })

      // With nothing yet lived, there is nothing to be silent about -- the fortnight
      // should read exactly as it would with the old hardcoded `true`.
      expect(atDayZero.state.weather).not.toBe('storm')
    })
  })
})
