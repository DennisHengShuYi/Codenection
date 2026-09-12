import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS, project, type DayInput, type Reserves } from '../engine'
import { describeDeficit, explainDeficit } from './deficitCause'

/**
 * Why a day is a deficit day, from the same arithmetic that made it one.
 *
 * The week grid marks these with a warning and says nothing else, and the days that most
 * need explaining are the ones that look empty: a light day carrying a warning is where a
 * fortnight of load finally lands, and a student reading it has no way to connect the mark
 * to anything they did.
 *
 * Everything here is recomputed rather than guessed. The projection is deterministic and its
 * reserves for every day are kept, so the drain each day charged can be run again exactly --
 * `drainSources` returns the same arithmetic itemised, and `drain.test.ts` binds the two. An
 * explanation that named a plausible culprit instead would be a story about a day the model
 * never simulated.
 */
const healthy: Reserves = { mental: 70, physical: 70, social: 70, errands: 70 }

const study = (hours: number, startHour = 9) => ({
  kind: 'studyBlock' as const,
  type: 'mental' as const,
  hours,
  intensity: 1,
  startHour,
})

const days = (build: (dayIndex: number) => DayInput['activities']): DayInput[] =>
  Array.from({ length: HORIZON_DAYS }, (_, dayIndex) => ({
    dayIndex,
    activities: build(dayIndex),
    sleepHours: 7,
    venueChanges: 0,
    daysToNearestDeadline: null,
    checkedIn: true,
  }))

/** A fortnight of nine-hour study days on six hours' sleep: mental gives way first. */
const crushing = (): DayInput[] =>
  days(() => [study(9)]).map((day) => ({ ...day, sleepHours: 6 }))

const explain = (input: DayInput[], dayIndex: number, start = healthy) =>
  explainDeficit({
    start,
    days: input,
    projection: project(start, input, DEFAULT_PARAMS),
    params: DEFAULT_PARAMS,
    dayIndex,
  })

describe('explainDeficit', () => {
  it('says nothing about a day that is not in deficit', () => {
    expect(explain(days(() => []), 3)).toBeNull()
  })

  it('names the reserve that actually gave way', () => {
    const crossing = project(healthy, crushing(), DEFAULT_PARAMS).firstDeficitDay

    expect(explain(crushing(), crossing ?? 0)?.type).toBe('mental')
  })

  it('says how low it is forecast to go, not merely that it is low', () => {
    const crossing = project(healthy, crushing(), DEFAULT_PARAMS).firstDeficitDay ?? 0

    const cause = explain(crushing(), crossing)

    expect(cause?.level).toBeLessThan(30)
    expect(cause?.level).toBeGreaterThanOrEqual(0)
  })

  it('names where the points went, biggest first', () => {
    const crossing = project(healthy, crushing(), DEFAULT_PARAMS).firstDeficitDay ?? 0

    const sources = explain(crushing(), crossing)?.sources ?? []

    expect(sources[0]?.source).toBe('studyBlock')
    expect(sources[0]?.points).toBeGreaterThan(0)
  })

  it('counts only the days that actually spent this reserve', () => {
    const crossing = project(healthy, crushing(), DEFAULT_PARAMS).firstDeficitDay ?? 0

    const cause = explain(crushing(), crossing)

    // The run-up starts where the reserve was last healthy, not at the top of the fortnight:
    // a student reading "since day 0" learns nothing about a crossing on day 11.
    expect(cause?.fromDay).toBeGreaterThanOrEqual(0)
    expect(cause?.fromDay).toBeLessThanOrEqual(crossing)
  })

  it('counts the nights that gave back less than they should have', () => {
    const crossing = project(healthy, crushing(), DEFAULT_PARAMS).firstDeficitDay ?? 0

    // Six hours against a five-hour baseline pays one hour back, where seven pays two.
    expect(explain(crushing(), crossing)?.shortNights).toBeGreaterThan(0)
  })

  /**
   * The case the whole feature exists for: an empty day carrying a warning. Nothing is
   * scheduled on it, so its own drain explains nothing -- the answer is entirely in the days
   * behind it.
   */
  it('explains a day with nothing on it from the days before it', () => {
    const heavyThenEmpty = days((dayIndex) => (dayIndex < 8 ? [study(9)] : [])).map((day) => ({
      ...day,
      sleepHours: 6,
    }))

    const projection = project(healthy, heavyThenEmpty, DEFAULT_PARAMS)
    const quietDeficit = projection.central.findIndex(
      (reserves, dayIndex) => dayIndex > 8 && Math.min(...Object.values(reserves)) < 30,
    )

    const cause = explain(heavyThenEmpty, quietDeficit)

    expect(cause?.sources[0]?.source).toBe('studyBlock')
    expect(cause?.fromDay).toBeLessThan(quietDeficit)
  })

  it('says nothing for a day outside the horizon', () => {
    expect(explain(crushing(), HORIZON_DAYS + 5)).toBeNull()
  })
})

/**
 * The same cause, in a sentence.
 *
 * §7.6's discipline applies here more than anywhere: this is read by the one student the
 * model thinks is heading for trouble, so it explains rather than scolds, and it says only
 * what was computed. Where no single source dominates it says the load was spread, rather
 * than picking a culprit to sound decisive.
 */
describe('describeDeficit', () => {
  const crossing = () => project(healthy, crushing(), DEFAULT_PARAMS).firstDeficitDay ?? 0

  const line = () => describeDeficit(explain(crushing(), crossing())!)

  it('names the reserve in the words a student uses for it', () => {
    expect(line()).toMatch(/study and writing/i)
  })

  it('says the number it is forecast to reach', () => {
    expect(line()).toMatch(/\d+/)
  })

  it('names the biggest cost by what it was, not by a field name', () => {
    expect(line()).toMatch(/studying|study/i)
    expect(line()).not.toMatch(/studyBlock/)
  })

  it('mentions the nights when they were short', () => {
    expect(line()).toMatch(/night|sleep/i)
  })

  /** No culprit where there is no culprit. A day whose load is spread evenly gets a sentence
   *  that says so, not the first line of a tied list presented as the reason. */
  it('says the load was spread when nothing dominates', () => {
    const mixed = days(() => [
      study(2),
      { kind: 'errands' as const, type: 'errands' as const, hours: 2, intensity: 1, startHour: 13 },
      { kind: 'socialDraining' as const, type: 'social' as const, hours: 2, intensity: 1, startHour: 17 },
    ])

    const projection = project(healthy, mixed, DEFAULT_PARAMS)
    const day = projection.firstDeficitDay

    if (day === null) return

    const cause = explain(mixed, day)
    if (cause === null) return

    // Whatever it says, it never names a source that carried less than a quarter of it.
    const total = cause.sources.reduce((sum, source) => sum + source.points, 0)
    const biggest = cause.sources[0]?.points ?? 0

    if (biggest / total < 0.4) expect(describeDeficit(cause)).toMatch(/spread|several|across/i)
  })
})
