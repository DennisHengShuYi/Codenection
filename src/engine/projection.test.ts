import { describe, expect, it } from 'vitest'
import { overallReserve } from './efficiency'
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

  // The floor saturates at zero, so on a crushing schedule every candidate week looks
  // identical to min(). Deficit area -- how far below the threshold, summed over days --
  // keeps varying, which is what leaves the optimizer a gradient when a student is
  // already in crisis. Without it the app can only say "0 to 0" to the person who most
  // needs an answer.
  it('measures how far below the threshold the fortnight falls, not just whether it does', () => {
    const sustainable = project(healthy, horizon(light), DEFAULT_PARAMS)
    const crushing = project(healthy, horizon(heavy), DEFAULT_PARAMS)

    expect(sustainable.deficitArea).toBe(0)
    expect(crushing.deficitArea).toBeGreaterThan(0)
  })

  it('still separates two fortnights whose floors have both bottomed out', () => {
    const bad = project(healthy, horizon(heavy), DEFAULT_PARAMS)
    const worse = project(
      { mental: 30, physical: 30, social: 30, errands: 30 },
      horizon(heavy),
      DEFAULT_PARAMS,
    )

    expect(bad.worstFloor).toBe(0)
    expect(worse.worstFloor).toBe(0)
    expect(worse.deficitArea).toBeGreaterThan(bad.deficitArea)
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

  /**
   * §6.5 compounds per consecutive miss so a long silence is worse than a skipped day. It
   * does not follow that the worry should grow without end: at 0.08 a day, a full horizon
   * of silence reaches 2.68x the student's own estimates, which stops being caution and
   * becomes a different, fictional week.
   *
   * The bound used to live in `blockLog.checkedInDays`, which marks every day from today
   * forward as checked in so the run can only ever accumulate over the past. That is a
   * real invariant, but it belongs to a different module -- `runBand` takes any
   * `checkedIn` array and had no defence of its own. This is that defence.
   *
   * Isolated deliberately: `checkedIn` feeds nothing but the multiplier, and every day
   * here carries identical load and sleep, so the *only* difference between these two
   * projections is the length of the run at the one day that has any work on it.
   */
  /**
   * The day the silence is actually measured on, rather than wherever the fortnight happens
   * to bottom out.
   *
   * Both of these used to read `worstOverall`, which worked only because three reserves
   * raced from 80 to full on the empty days and left day 20 -- the one day carrying any load
   * -- as the lowest mean on the horizon. Cutting `kSleep` to a third stopped that race, so
   * the lowest mean moved to day 0, the starting state, which is identical in every one of
   * these fixtures and before any silence begins. One test then failed and the other passed
   * comparing 81.850 against 81.850, which is the worse of the two outcomes.
   *
   * The mechanism never changed: day 20 still reads 83.786 against 83.165 for a two-day and
   * a five-day silence, exactly as it did before. So this names the day instead of hoping the
   * minimum lands on it -- a stricter test than the one it replaces, and one that cannot go
   * quietly green again if a coefficient moves.
   */
  const silenceReading = (projection: Projection): number =>
    overallReserve(projection.central[20] as Reserves)

  it('stops compounding the silence once the run reaches its cap', () => {
    const emptyThenHeavy = (checkInOn: number | null) =>
      horizon((i) => ({
        ...(i === 20 ? heavy(i) : day(i)),
        checkedIn: i === checkInOn,
      }))

    // Twelve days of silence: one past the cap.
    const justOverCap = project(healthy, emptyThenHeavy(8), DEFAULT_PARAMS)
    // Twenty-one days: far past it, and uncapped this would be 2.68x rather than 1.88x.
    const farPastCap = project(healthy, emptyThenHeavy(null), DEFAULT_PARAMS)

    expect(silenceReading(farPastCap)).toBeCloseTo(silenceReading(justOverCap))
  })

  /** The cap must not flatten the gradient §6.5 is actually about -- a two-day gap still
   *  has to read as less worrying than a week of nothing. */
  it('still worries more about a longer silence below the cap', () => {
    const emptyThenHeavy = (silentFrom: number) =>
      horizon((i) => ({
        ...(i === 20 ? heavy(i) : day(i)),
        checkedIn: i < silentFrom,
      }))

    const twoDays = project(healthy, emptyThenHeavy(19), DEFAULT_PARAMS)
    const fiveDays = project(healthy, emptyThenHeavy(16), DEFAULT_PARAMS)

    expect(silenceReading(fiveDays)).toBeLessThan(silenceReading(twoDays))
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

/**
 * §6.1's coefficients, measured against the thing they exist to show.
 *
 * `kSleep.mental` was 6.0 against a study hour's 1.0, so one hour of sleep repaid six hours
 * of work. A student sleeping eight hours banked +18 mental a day and spent nine on a hard
 * day of study, ending every day up -- and because reserves clamp at 100, the surplus was
 * thrown away and the bar sat flat at full.
 *
 * Measured across a grid of sleep against workload, every combination at seven hours' sleep
 * or more ended the fortnight at exactly 100, including ten hours of study every weekday.
 * The model was not saying the week was survivable; it could not see the week at all.
 *
 * So the test is the property rather than a figure: more work has to end worse than less
 * work. A number here would be a second way of writing the coefficient down, and would pass
 * again the moment somebody changed it.
 */
describe('workload is visible in the projection', () => {
  const studyDay = (dayIndex: number, hours: number): DayInput =>
    day(dayIndex, {
      activities: [{ kind: 'studyBlock', type: 'mental', hours, intensity: 1, startHour: 9 }],
      sleepHours: 8,
      // Seeing somebody twice a week, so this measures workload rather than loneliness.
      ...(dayIndex % 3 === 0
        ? {
            activities: [
              { kind: 'studyBlock' as const, type: 'mental' as const, hours, intensity: 1, startHour: 9 },
              { kind: 'socialRestorative' as const, type: 'social' as const, hours: 2, intensity: 1, startHour: 19 },
            ],
          }
        : {}),
    })

  const fortnightOf = (hours: number): Projection =>
    project(
      healthy,
      Array.from({ length: 21 }, (_, dayIndex) => studyDay(dayIndex, hours)),
      DEFAULT_PARAMS,
    )

  it('ends a heavy fortnight lower than a light one', () => {
    const light = fortnightOf(2).central.at(-1)!.mental
    const heavyish = fortnightOf(8).central.at(-1)!.mental

    expect(heavyish).toBeLessThan(light)
  })

  // The clamp is what hid the difference, so a light week sitting at exactly full is the
  // state this is guarding against rather than an incidental detail.
  it('does not pin a heavy fortnight at full reserve', () => {
    expect(fortnightOf(8).central.at(-1)!.mental).toBeLessThan(100)
  })

  /**
   * The property that makes the difference above possible at all: a week has a level it
   * settles at, and the student arrives there from either direction.
   *
   * Without it the model is bistable rather than graded. Drain rises as a student depletes
   * (§6.6) and recovery rose as they filled, so both directions reinforced and the middle was
   * a knife edge that pushed away from itself: measured on one identical seven-hour week,
   * starting at 65 climbed to 100 and starting at 60 fell to 40. Every student ended at one
   * end or the other, which is why four bars out of five sat flat at full.
   *
   * `headroomAt` is the term that answers it, and it answers a different question from
   * §6.2's spiral rather than softening it. §6.2 says recovery is less effective the more
   * depleted you are, and that is untouched. This says there is less left to give back the
   * closer to full you already are -- which is not a claim about depletion at all.
   *
   * Asserted as convergence rather than against a figure, because the figure is the
   * coefficients written down a second time.
   */
  it('settles a week at the same level from above and from below', () => {
    const atLevel = (mental: number) =>
      project(
        { mental, physical: 90, social: 90, errands: 90 },
        Array.from({ length: 21 }, (_, dayIndex) => studyDay(dayIndex, 6)),
        DEFAULT_PARAMS,
      ).central.at(-1)!.mental

    const fromAbove = atLevel(95)
    const fromBelow = atLevel(60)

    expect(fromBelow).toBeCloseTo(fromAbove, 0)
    // And that shared level is a real middle, not either end.
    expect(fromAbove).toBeGreaterThan(50)
    expect(fromAbove).toBeLessThan(100)
  })

  /**
   * §6.2's spiral survives the term above, which is the thing worth guarding.
   *
   * A settling point that a student always returns to would be a model that cannot show
   * burnout -- exactly the linear tracker §1.2 rejects, arriving by a new route. A week that
   * is genuinely too much still has to run away downward.
   */
  it('still crashes a fortnight that is genuinely too much', () => {
    const brutal = Array.from({ length: 21 }, (_, dayIndex) =>
      day(dayIndex, {
        activities: [
          { kind: 'studyBlock' as const, type: 'mental' as const, hours: 4, intensity: 1, startHour: 9 },
          { kind: 'studyBlock' as const, type: 'mental' as const, hours: 3, intensity: 1, startHour: 14 },
          { kind: 'studyBlock' as const, type: 'mental' as const, hours: 3, intensity: 1, startHour: 18 },
        ],
        sleepHours: 5,
        venueChanges: 2,
        daysToNearestDeadline: 2,
      }),
    )

    expect(project(healthy, brutal, DEFAULT_PARAMS).central.at(-1)!.mental).toBe(0)
  })
})
