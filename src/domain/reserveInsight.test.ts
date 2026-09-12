import { describe, expect, it } from 'vitest'
import {
  DEFICIT_THRESHOLD,
  HORIZON_DAYS,
  project,
  type EngineParams,
  type LoadType,
  type Reserves,
} from '../engine'
import { DEFAULT_PARAMS } from '../engine/params'
import { toDayInputs, type Schedule, type ScheduledItem } from '../optimizer'
import { insightLines, reserveInsight } from './reserveInsight'

/**
 * What the Reserves sheet says beyond reading its own dial back.
 *
 * §1.5's text equivalent restates every value and must keep doing exactly that -- it is the
 * dial for a screen reader, so interpretation mixed into it is indistinguishable from a
 * reading. This is the interpretation, computed separately from numbers the engine already
 * produced: which reserve is actually limiting the student, what §6.2 says that costs them,
 * why the fortnight breaks where it does, and the one thing worth doing about it.
 *
 * Everything here is derived, never asserted. The AI layer above may only rephrase these
 * lines; §8.2 forbids the app describing a week the model did not simulate, and a sentence
 * a language model invented about somebody's fortnight is exactly that.
 */
const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'essay',
  title: 'WIA3001 essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 3,
  intensity: 1,
  dayIndex: 1,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (start: Reserves, items: ScheduledItem[] = []): Schedule => ({
  items,
  start,
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const params: EngineParams = DEFAULT_PARAMS

/** The day as a student would say it. Supplied by the caller for the same reason
 *  `deficitDayLabel` is: naming a day needs the week's anchor, which the domain has not got. */
const DAY = (dayIndex: number): string => ['today', 'tomorrow', 'Wednesday'][dayIndex] ?? `in ${dayIndex} days`

/** The names the screen showing this block is already drawing -- see `insightLines`. */
const LABEL = (type: LoadType): string =>
  ({
    mental: 'Study & thinking',
    physical: 'Body & movement',
    social: 'People',
    errands: 'Life admin',
  })[type]

const insightOf = (schedule: Schedule, today = 0) => {
  const days = toDayInputs(schedule, [])
  return reserveInsight({
    schedule,
    reserves: schedule.start,
    today,
    blockLog: [],
    days,
    projection: project(schedule.start, days, params),
    params,
  })
}

const HEALTHY: Reserves = { mental: 78, physical: 100, social: 43, errands: 81 }

/**
 * The same reserves with company on the calendar.
 *
 * Needed because the empty week is not the calm one: §6.5 charges isolation for a day with
 * no contact on it, so `HEALTHY` with nothing scheduled crosses into deficit on day 8 --
 * which is the model working, not a fixture problem. A week that genuinely holds has to
 * have somebody in it.
 */
const coffee = (day: number): ScheduledItem =>
  item({
    id: `coffee-${day}`,
    title: 'Coffee with a friend',
    type: 'social',
    kind: 'socialRestorative',
    hours: 2,
    dayIndex: day,
    startHour: 17,
  })

const calmWeek = (): Schedule =>
  week(HEALTHY, Array.from({ length: HORIZON_DAYS }, (_, day) => coffee(day)))

describe('reserveInsight', () => {
  /**
   * Exactly one, even when the floor is a tie.
   *
   * Four reserves all sitting at 70 are all equal to the floor, and flagging each of them
   * had the block say "your thinnest" four times about four different things -- which was
   * the state a fresh week was actually in.
   */
  it('calls one reserve the thinnest, even when several are level', () => {
    const level = insightOf(week({ mental: 70, physical: 70, social: 70, errands: 70 }))

    expect(level.notes.filter((note) => note.lowest)).toHaveLength(1)
  })

  it('names the reserve that is actually limiting them, not the average', () => {
    const insight = insightOf(week(HEALTHY))

    expect(insight.notes[0]?.type).toBe('social')
    expect(insight.notes[0]?.lowest).toBe(true)
  })

  it('orders the breakdown thinnest first, so the limiting one is read first', () => {
    const levels = insightOf(week(HEALTHY)).notes.map((note) => note.level)

    expect(levels).toEqual([...levels].sort((a, b) => a - b))
  })

  it('covers all four, since the sheet draws all four', () => {
    expect(insightOf(week(HEALTHY)).notes).toHaveLength(4)
  })

  /**
   * §6.2 is the mechanic the whole app exists to make visible, and the sheet never said it.
   * A student reading "43" has no way to know that the same hour of rest buys them less
   * there than it would at 80 -- which is the difference between a bad week and a spiral.
   */
  it('prices rest at the level each reserve is actually on', () => {
    const insight = insightOf(week(HEALTHY))

    const social = insight.notes.find((note) => note.type === 'social')
    const physical = insight.notes.find((note) => note.type === 'physical')

    expect(social?.payback ?? 1).toBeLessThan(physical?.payback ?? 0)
    expect(physical?.payback).toBeCloseTo(1, 5)
  })

  it('says nothing about a deficit when the fortnight holds', () => {
    expect(insightOf(calmWeek()).deficit).toBeNull()
  })

  /** Recomputed from the projection that produced the mark, never guessed -- the same rule
   *  `deficitCause` was written under. */
  it('explains the crossing the projection actually forecast', () => {
    const heavy = week(
      { mental: 40, physical: 60, social: 60, errands: 60 },
      Array.from({ length: HORIZON_DAYS }, (_, day) =>
        item({ id: `essay-${day}`, dayIndex: day, hours: 9 }),
      ),
    )

    const insight = insightOf(heavy)

    expect(insight.deficit).not.toBeNull()
    expect(insight.deficit?.level).toBeLessThan(DEFICIT_THRESHOLD)
    expect(insight.deficit?.dayIndex).toBe(
      project(heavy.start, toDayInputs(heavy, []), params).firstDeficitDay,
    )
  })

  /**
   * The reserve entering today, never the one the fortnight opened with.
   *
   * `schedule.start` is where the week began; the bars, the headline and the room's gauge
   * all quote today. Reading the opening figures here had the block describe a student who
   * no longer existed -- one sheet giving one person two accounts of themselves.
   */
  it('reads the reserve it was handed, not the week it was handed', () => {
    const schedule = week({ mental: 70, physical: 70, social: 70, errands: 70 })
    const days = toDayInputs(schedule, [])

    const insight = reserveInsight({
      schedule,
      reserves: { mental: 37, physical: 95, social: 60, errands: 60 },
      today: 4,
      blockLog: [],
      days,
      projection: project(schedule.start, days, params),
      params,
    })

    expect(insight.notes[0]?.type).toBe('mental')
    expect(insight.notes[0]?.level).toBe(37)
  })

  it('does not touch what it was given', () => {
    const schedule = week(HEALTHY, [item()])
    const snapshot = JSON.stringify(schedule)

    insightOf(schedule)

    expect(JSON.stringify(schedule)).toBe(snapshot)
  })
})

/**
 * The wording, which is also the exact set of facts the model above is allowed to rephrase.
 *
 * Kept here rather than in the UI because it is the fallback as well as the brief: with no
 * `GROQ_API_KEY` -- CI, tests, and `vite dev` where /api is not served -- these lines are
 * what the student reads, and they have to stand on their own rather than read as an
 * apology for a missing model.
 */
describe('insightLines', () => {
  it('says every reserve worth commenting on, plus what it costs', () => {
    const lines = insightLines(insightOf(week(HEALTHY)), { deficitDayLabel: null, labelFor: LABEL, dayNameFor: DAY })

    expect(lines.join(' ')).toMatch(/people/i)
    expect(lines.join(' ')).toMatch(/43/)
    expect(lines.join(' ')).toMatch(/%/)
  })

  it('leaves out the reserves that are not limiting anything', () => {
    const lines = insightLines(insightOf(week(HEALTHY)), { deficitDayLabel: null, labelFor: LABEL, dayNameFor: DAY })

    expect(lines.join(' ')).not.toMatch(/body & movement/i)
  })

  /** A day index is the model's own counting and is off by one in the student's terms. The
   *  caller has the anchor; this never invents a name for a day. */
  it('names the deficit day when the caller could supply a name', () => {
    const heavy = week(
      { mental: 40, physical: 60, social: 60, errands: 60 },
      Array.from({ length: HORIZON_DAYS }, (_, day) =>
        item({ id: `essay-${day}`, dayIndex: day, hours: 9 }),
      ),
    )

    const lines = insightLines(insightOf(heavy), { deficitDayLabel: 'Thursday', labelFor: LABEL, dayNameFor: DAY })

    expect(lines.join(' ')).toMatch(/Thursday/)
  })

  it('stays silent about a day it cannot name rather than printing an index', () => {
    const heavy = week(
      { mental: 40, physical: 60, social: 60, errands: 60 },
      Array.from({ length: HORIZON_DAYS }, (_, day) =>
        item({ id: `essay-${day}`, dayIndex: day, hours: 9 }),
      ),
    )

    const lines = insightLines(insightOf(heavy), { deficitDayLabel: null, labelFor: LABEL, dayNameFor: DAY })

    expect(lines.join(' ')).toMatch(/deficit/i)
    expect(lines.join(' ')).not.toMatch(/day \d/i)
  })

  it('never returns an empty block, whatever the week looks like', () => {
    const rested = week({ mental: 100, physical: 100, social: 100, errands: 100 })

    expect(insightLines(insightOf(rested), { deficitDayLabel: null, labelFor: LABEL, dayNameFor: DAY }).length).toBeGreaterThan(0)
  })

  /** A block that only ever speaks when something is wrong teaches a student to read its
   *  presence as bad news, which is the opposite of the mirror §1.3 asks for. */
  it('says the fortnight holds, rather than going quiet, when it does', () => {
    const lines = insightLines(insightOf(calmWeek()), { deficitDayLabel: null, labelFor: LABEL, dayNameFor: DAY })

    expect(lines.join(' ')).toMatch(/nothing in the next fortnight/i)
  })
})

/**
 * What is already booked for the reserve that is lowest.
 *
 * The block read as broken without this and was not: People at 43 with nothing suggested
 * about people, because seeing someone was on the calendar for tomorrow and the app had
 * therefore stopped counting it as neglected -- correctly, and silently. Silence is what
 * made it look wrong. A student cannot tell "we have nothing to say about your lowest
 * reserve" from "it is already handled, here is what to do until then".
 */
describe('what is already booked for the thinnest reserve', () => {
  const withCoffeeTomorrow = (): Schedule =>
    week(HEALTHY, [
      item({
        id: 'coffee',
        title: 'Coffee with Sarah',
        type: 'social',
        kind: 'socialRestorative',
        hours: 2,
        dayIndex: 1,
        startHour: 17,
      }),
    ])

  it('finds the thing on the calendar that answers the lowest reserve', () => {
    const insight = insightOf(withCoffeeTomorrow())

    expect(insight.upcoming?.title).toBe('Coffee with Sarah')
    expect(insight.upcoming?.dayIndex).toBe(1)
  })

  it('says so, by name and by day, rather than going quiet about it', () => {
    const lines = insightLines(insightOf(withCoffeeTomorrow()), {
      deficitDayLabel: null,
      labelFor: LABEL,
      dayNameFor: DAY,
    }).join(' ')

    expect(lines).toMatch(/Coffee with Sarah/)
    expect(lines).toMatch(/tomorrow/)
  })

  /** Only what answers THAT reserve. An essay on tomorrow does not answer being lonely. */
  it('ignores something booked that has nothing to do with the lowest reserve', () => {
    const insight = insightOf(week(HEALTHY, [item({ dayIndex: 1 })]))

    expect(insight.upcoming).toBeNull()
  })

  /** Days already behind them cannot be what is coming. */
  it('ignores one that has already gone by', () => {
    const past = week(HEALTHY, [
      item({ id: 'coffee', type: 'social', kind: 'socialRestorative', dayIndex: 1 }),
    ])

    expect(insightOf(past, 5).upcoming).toBeNull()
  })

  it('has nothing to point at when the reserve really is unanswered', () => {
    expect(insightOf(week(HEALTHY)).upcoming).toBeNull()
  })
})
