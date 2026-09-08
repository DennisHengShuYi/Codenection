import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from './params'
import { project, type Projection } from './projection'
import type { DayInput, Reserves } from './types'

const healthy: Reserves = { mental: 80, physical: 80, social: 80, errands: 80 }

const day = (dayIndex: number, over: Partial<DayInput> = {}): DayInput => ({
  dayIndex,
  activities: [],
  sleepHours: 7,
  venueChanges: 0,
  daysToNearestDeadline: null,
  checkedIn: true,
  ...over,
})

const heavy = (dayIndex: number): DayInput =>
  day(dayIndex, {
    activities: [{ kind: 'studyBlock', type: 'mental', hours: 9, intensity: 1, startHour: 9 }],
    sleepHours: 5,
  })

const light = (dayIndex: number): DayInput =>
  day(dayIndex, {
    sleepHours: 8,
    activities: [
      { kind: 'studyBlock', type: 'mental', hours: 2, intensity: 1, startHour: 9 },
      { kind: 'socialRestorative', type: 'social', hours: 1, intensity: 1, startHour: 18 },
    ],
  })

const horizon = (make: (i: number) => DayInput, n = 21): DayInput[] =>
  Array.from({ length: n }, (_, i) => make(i))

/**
 * Total area between the optimistic and pessimistic bands.
 *
 * Measured across the whole horizon rather than at the final day, because a reserve that
 * has bottomed out clamps every band to zero -- so a single late sample reports a spread
 * of nothing however uncertain the model actually is.
 */
const bandArea = (result: Projection): number =>
  result.central.reduce(
    (sum, _, i) => sum + (result.optimistic[i]!.mental - result.pessimistic[i]!.mental),
    0,
  )

describe('project', () => {
  it('returns one entry per day for each band', () => {
    const result = project(healthy, horizon(day), DEFAULT_PARAMS)

    expect(result.central).toHaveLength(21)
    expect(result.optimistic).toHaveLength(21)
    expect(result.pessimistic).toHaveLength(21)
  })

  it('orders the bands: pessimistic never above optimistic', () => {
    const result = project(healthy, horizon(heavy), DEFAULT_PARAMS)

    for (let i = 0; i < result.central.length; i += 1) {
      expect(result.pessimistic[i]!.mental).toBeLessThanOrEqual(result.optimistic[i]!.mental + 1e-9)
    }
  })

  it('reports the worst overall reserve across the horizon', () => {
    expect(project(healthy, horizon(heavy), DEFAULT_PARAMS).worstOverall).toBeLessThan(80)
  })

  it('finds the first day the projection crosses into deficit', () => {
    const result = project(healthy, horizon(heavy), DEFAULT_PARAMS)

    expect(result.firstDeficitDay).not.toBeNull()
    expect(result.firstDeficitDay).toBeGreaterThan(0)
    expect(result.deficitDays).toBeGreaterThan(0)
  })

  // The regression this file's diagnostic run exposed: a student whose mental reserve
  // empties on day 7 while physical stays at 70 averages 35 and would report no deficit
  // at all. §2.1's floor principle has to hold across reserves, not only across days.
  it('reports a deficit when one reserve empties, even while the mean looks fine', () => {
    const result = project(healthy, horizon(heavy), DEFAULT_PARAMS)

    expect(result.worstOverall).toBeGreaterThan(30)
    expect(result.worstFloor).toBeLessThan(1)
    expect(result.firstDeficitDay).not.toBeNull()
  })

  it('never reports a floor above the headline mean', () => {
    const result = project(healthy, horizon(heavy), DEFAULT_PARAMS)

    expect(result.worstFloor).toBeLessThanOrEqual(result.worstOverall)
  })

  it('reports no deficit crossing on a sustainable schedule', () => {
    const result = project(healthy, horizon(light), DEFAULT_PARAMS)

    expect(result.firstDeficitDay).toBeNull()
    expect(result.deficitDays).toBe(0)
  })

  // §6.5: missing check-ins widen the band AND bias the central estimate pessimistic.
  // Treating a gap as neutral makes the projection optimistic right before the crash,
  // which is the one moment it must not be.
  it('lowers the central estimate when the user stops checking in', () => {
    const present = project(healthy, horizon(heavy), DEFAULT_PARAMS)
    const absent = project(
      healthy,
      horizon((i) => ({ ...heavy(i), checkedIn: false })),
      DEFAULT_PARAMS,
    )

    expect(absent.worstOverall).toBeLessThan(present.worstOverall)
  })

  // Measured on a sustainable schedule deliberately. On a crushing one every band clamps
  // to zero within a week, so the spread collapses to nothing and the measurement says
  // more about the floor than about the model's uncertainty.
  it('widens the band when the user stops checking in', () => {
    const present = project(healthy, horizon(light), DEFAULT_PARAMS)
    const absent = project(
      healthy,
      horizon((i) => ({ ...light(i), checkedIn: false })),
      DEFAULT_PARAMS,
    )

    expect(bandArea(absent)).toBeGreaterThan(bandArea(present))
  })

  it('worries more the longer the silence runs', () => {
    const brief = project(
      healthy,
      horizon((i) => ({ ...heavy(i), checkedIn: i > 2 })),
      DEFAULT_PARAMS,
    )
    const sustained = project(
      healthy,
      horizon((i) => ({ ...heavy(i), checkedIn: false })),
      DEFAULT_PARAMS,
    )

    expect(sustained.worstOverall).toBeLessThan(brief.worstOverall)
  })

  it('forgives a gap once the user checks in again', () => {
    const stillWorried = project(
      healthy,
      horizon((i) => ({ ...heavy(i), checkedIn: i % 2 === 0 })),
      DEFAULT_PARAMS,
    )
    const neverChecked = project(
      healthy,
      horizon((i) => ({ ...heavy(i), checkedIn: false })),
      DEFAULT_PARAMS,
    )

    expect(stillWorried.worstOverall).toBeGreaterThan(neverChecked.worstOverall)
  })

  // §0: no cold start. Every screen renders something useful with zero user data, which
  // starts with the projection not throwing on an empty week.
  it('renders something useful with no schedule at all', () => {
    const result = project(healthy, [], DEFAULT_PARAMS)

    expect(result.central).toHaveLength(0)
    expect(result.worstOverall).toBeCloseTo(80)
    expect(result.firstDeficitDay).toBeNull()
    expect(result.deficitDays).toBe(0)
  })

  it('does not mutate the params it is given', () => {
    const before = JSON.stringify(DEFAULT_PARAMS)
    project(healthy, horizon(heavy), DEFAULT_PARAMS)

    expect(JSON.stringify(DEFAULT_PARAMS)).toBe(before)
  })
})
