import { describe, expect, it } from 'vitest'
import { drainForDay, drainSources, fragmentation } from './drain'
import { DEFAULT_PARAMS, SLEEP_BASELINE_HOURS } from './params'
import type { Activity, DayInput, Reserves } from './types'

const healthy: Reserves = { mental: 80, physical: 80, social: 80, errands: 80 }
const depleted: Reserves = { mental: 20, physical: 20, social: 20, errands: 20 }

const study = (startHour: number, hours = 2): Activity => ({
  kind: 'studyBlock',
  type: 'mental',
  hours,
  intensity: 1,
  startHour,
})

const day = (over: Partial<DayInput> = {}): DayInput => ({
  dayIndex: 0,
  activities: [],
  sleepHours: 7,
  venueChanges: 0,
  daysToNearestDeadline: null,
  checkedIn: true,
  ...over,
})

describe('drainForDay', () => {
  it('drains no mental load on an empty day', () => {
    expect(drainForDay(day(), healthy, DEFAULT_PARAMS).mental).toBe(0)
  })

  it('drains mental load in proportion to study hours', () => {
    const two = drainForDay(day({ activities: [study(9)] }), healthy, DEFAULT_PARAMS).mental
    const four = drainForDay(day({ activities: [study(9, 4)] }), healthy, DEFAULT_PARAMS).mental

    expect(four).toBeGreaterThan(two)
  })

  /**
   * §6.6 priced on the reserve the block actually spends, not on the body average.
   *
   * Both states below have a mean of 65, so a multiplier read off `overallReserve` charges
   * them identically -- and a student with nothing left mentally would pay the same for a
   * study block as one who is evenly three-quarters full. The spec names a single reserve
   * percentage against a study block ("at 70% reserve, two hours of study costs two
   * hours"), and the reserve a study block spends is mental.
   *
   * This is the drain half of the same decision `tick` makes about recovery: each reserve's
   * own level governs its own cost, and the mean is the dial's headline (§1.2) rather than
   * an input to any mechanism.
   */
  it('prices a block on its own reserve, not on the mean of all four', () => {
    const mentalSpent: Reserves = { mental: 20, physical: 80, social: 80, errands: 80 }
    const evenlyWorn: Reserves = { mental: 65, physical: 65, social: 65, errands: 65 }

    const spent = drainForDay(day({ activities: [study(9)] }), mentalSpent, DEFAULT_PARAMS).mental
    const even = drainForDay(day({ activities: [study(9)] }), evenlyWorn, DEFAULT_PARAMS).mental

    expect(spent).toBeGreaterThan(even)
  })

  /** The other side of it: a collapsed reserve must not make an unrelated block dearer.
   *  Under a mean-based multiplier an empty social reserve quietly taxed every study hour. */
  it('leaves a block priced on its own healthy reserve alone when another has collapsed', () => {
    const socialGone: Reserves = { mental: 80, physical: 80, social: 0, errands: 80 }

    const alongside = drainForDay(day({ activities: [study(9)] }), socialGone, DEFAULT_PARAMS).mental
    const fresh = drainForDay(day({ activities: [study(9)] }), healthy, DEFAULT_PARAMS).mental

    expect(alongside).toBeCloseTo(fresh)
  })

  // §6.6 reaching into §6.4: the same hours cost more when you are already spent.
  it('drains more for the same hours when the student is depleted', () => {
    const fresh = drainForDay(day({ activities: [study(9)] }), healthy, DEFAULT_PARAMS).mental
    const worn = drainForDay(day({ activities: [study(9)] }), depleted, DEFAULT_PARAMS).mental

    expect(worn).toBeGreaterThan(fresh)
  })

  // §1.2: low social load is flagged as a warning, not as "good". Social is the one
  // reserve that drains from absence -- this is what makes a student who is not busy but
  // is isolated show as unwell, where a model summing hours would call them healthy.
  it('drains social reserve on a day with no social contact at all', () => {
    expect(drainForDay(day(), healthy, DEFAULT_PARAMS).social).toBeGreaterThan(0)
  })

  it('does not drain social reserve when the social floor is met', () => {
    const coffee: Activity = {
      kind: 'socialRestorative',
      type: 'social',
      hours: 2,
      intensity: 1,
      startHour: 15,
    }

    expect(drainForDay(day({ activities: [coffee] }), healthy, DEFAULT_PARAMS).social).toBe(0)
  })

  it('adds anticipatory drain as a deadline approaches', () => {
    const far = drainForDay(day({ daysToNearestDeadline: 14 }), healthy, DEFAULT_PARAMS).mental
    const near = drainForDay(day({ daysToNearestDeadline: 1 }), healthy, DEFAULT_PARAMS).mental

    expect(near).toBeGreaterThan(far)
  })

  it('adds travel load for venue changes', () => {
    const settled = drainForDay(day(), healthy, DEFAULT_PARAMS).errands
    const roaming = drainForDay(day({ venueChanges: 3 }), healthy, DEFAULT_PARAMS).errands

    expect(roaming).toBeGreaterThan(settled)
  })

  // §2.4's Reality Check has to land somewhere, and this is where: the learned bias
  // silently pads what the student thinks a task will take.
  it('applies the learned estimate bias, so an underestimator drains more', () => {
    const biased = {
      ...DEFAULT_PARAMS,
      estimateBias: { ...DEFAULT_PARAMS.estimateBias, mental: 1.7 },
    }

    const unbiased = drainForDay(day({ activities: [study(9)] }), healthy, DEFAULT_PARAMS).mental
    const padded = drainForDay(day({ activities: [study(9)] }), healthy, biased).mental

    expect(padded).toBeGreaterThan(unbiased)
  })

  // The two social kinds pull in opposite directions, which is the point: an evening
  // with a friend restores, a group project nobody wants does not.
  it('charges a draining social obligation while sparing a restorative one', () => {
    const obligation: Activity = {
      kind: 'socialDraining',
      type: 'social',
      hours: 2,
      intensity: 1,
      startHour: 15,
    }
    const friend: Activity = { ...obligation, kind: 'socialRestorative' }

    expect(drainForDay(day({ activities: [obligation] }), healthy, DEFAULT_PARAMS).social)
      .toBeGreaterThan(0)
    expect(drainForDay(day({ activities: [friend] }), healthy, DEFAULT_PARAMS).social).toBe(0)
  })

  it('counts a restorative social event as a context switch even though it costs nothing', () => {
    const friend: Activity = {
      kind: 'socialRestorative',
      type: 'social',
      hours: 2,
      intensity: 1,
      startHour: 15,
    }

    expect(fragmentation([study(9), friend])).toBe(1)
  })

  it('does not count rest or sleep as drain', () => {
    const resting: Activity = {
      kind: 'rest',
      type: 'mental',
      hours: 2,
      intensity: 1,
      startHour: 20,
    }

    expect(drainForDay(day({ activities: [resting] }), healthy, DEFAULT_PARAMS).mental).toBe(0)
  })

  it('never returns a negative drain', () => {
    const walk: Activity = {
      kind: 'lightExercise',
      type: 'physical',
      hours: 1,
      intensity: 1,
      startHour: 8,
    }

    for (const value of Object.values(
      drainForDay(day({ activities: [walk, study(12)] }), healthy, DEFAULT_PARAMS),
    )) {
      expect(value).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('fragmentation', () => {
  // §6.4, and the reason §2.1's objective carries a fragmentation penalty: a day broken
  // into pieces drains more than a blocked day at equal hours.
  it('scores a scattered day higher than a blocked one at equal hours', () => {
    const blocked = [study(9, 4)]
    const scattered = [study(9, 1), study(12, 1), study(15, 1), study(19, 1)]

    expect(fragmentation(scattered)).toBeGreaterThan(fragmentation(blocked))
  })

  it('scores an empty day as zero', () => {
    expect(fragmentation([])).toBe(0)
  })

  it('scores a single block as zero, since nothing is being switched between', () => {
    expect(fragmentation([study(9, 4)])).toBe(0)
  })

  it('does not count rest blocks as context switches', () => {
    const resting: Activity = {
      kind: 'rest',
      type: 'mental',
      hours: 1,
      intensity: 1,
      startHour: 20,
    }

    expect(fragmentation([study(9, 4), resting])).toBe(0)
  })
})

/**
 * §2.4's correction, per block rather than per area of life.
 *
 * `params.estimateBias` is one number per load type, so every study block was padded by the
 * same factor -- which was the whole of Reality Check until the ladder in `paddingForItem`
 * made a narrower answer possible. A per-type parameter cannot carry a per-block answer, so
 * the block brings its own and the parameter stays the fallback.
 *
 * Optional on the activity, because most callers have no log in hand: the optimizer's
 * neighbours, the fixtures, every test written before this. Absent means "use the type's",
 * which is exactly what happened before.
 */
describe('a block that carries its own estimate bias', () => {
  const study = { kind: 'studyBlock' as const, type: 'mental' as const, hours: 2, intensity: 1, startHour: 9 }

  const drainOf = (activity: Activity, params = DEFAULT_PARAMS): number =>
    drainForDay(
      { dayIndex: 0, activities: [activity], sleepHours: 7, venueChanges: 0, daysToNearestDeadline: null, checkedIn: true },
      { mental: 100, physical: 100, social: 100, errands: 100 },
      params,
    ).mental

  it('costs more when its own bias says this work runs long', () => {
    expect(drainOf({ ...study, estimateBias: 2 })).toBeGreaterThan(drainOf(study))
  })

  it('uses its own bias rather than the type-wide one', () => {
    const padded = { ...DEFAULT_PARAMS, estimateBias: { ...DEFAULT_PARAMS.estimateBias, mental: 3 } }

    // The block says 1 -- this work has never overrun -- and that beats the area-wide 3.
    expect(drainOf({ ...study, estimateBias: 1 }, padded)).toBeLessThan(drainOf(study, padded))
  })

  it('falls back to the type-wide bias when the block carries none', () => {
    const padded = { ...DEFAULT_PARAMS, estimateBias: { ...DEFAULT_PARAMS.estimateBias, mental: 2 } }

    expect(drainOf(study, padded)).toBeCloseTo(drainOf({ ...study, estimateBias: 2 }), 6)
  })
})

/**
 * The same day's drain, itemised.
 *
 * `drainForDay` returns four totals, which is all the model needs and nothing a student can
 * be told. Explaining a deficit day means naming where the points went -- so this returns the
 * same arithmetic with the sources kept apart.
 *
 * Deliberately a second function rather than a refactor of the first. `drainForDay` runs
 * thousands of times inside the optimizer's search, and building a breakdown object per day
 * per candidate is a cost the search would pay for a sentence it never reads.
 *
 * That leaves two copies of one formula, so the test below binds them: the sources must sum
 * to the total, or they have drifted and the explanation is describing a day the model did
 * not simulate.
 */
/**
 * §6.4 amended: an hour costs more than one thing.
 *
 * `drainForDay` charged `totals[activity.type]`, one bar and exactly one, so a reserve was
 * only ever touched if the day contained an activity carrying its own type. Only exercise is
 * typed physical, so ten hours at a desk cost a student's body nothing at all -- measured, a
 * fortnight of ten-hour study days took the body bar from 92 UP to 100 while the study bar
 * fell to 16, because sleep repaid it 21 points a night against a drain that could not fire.
 *
 * The one-hot assumption is the bug rather than the coefficients. Three hours hunched at a
 * desk costs a body; errands are walking, carrying and queueing, and cost one too. So the
 * rate becomes a row instead of a number.
 *
 * Deliberately small away from the diagonal. Four separately priced reserves is §6.3's whole
 * claim -- a student can be socially fine and mentally destroyed and the app has to show it --
 * and reserves that all drain together are one number wearing four hats. `SECONDARY_COST` is
 * a fifth of the primary at most, and zero wherever there is no story to tell.
 */
describe('an activity costs more than its own reserve', () => {
  const deskDay = day({ activities: [study(9, 10)] })

  it('charges a body for a long day at a desk', () => {
    expect(drainForDay(deskDay, healthy, DEFAULT_PARAMS).physical).toBeGreaterThan(0)
  })

  it('charges errands to the body and the head as well as to the errands bar', () => {
    const chores = day({
      activities: [{ kind: 'errands', type: 'errands', hours: 4, intensity: 1, startHour: 10 }],
    })
    const drained = drainForDay(chores, healthy, DEFAULT_PARAMS)

    expect(drained.errands).toBeGreaterThan(0)
    expect(drained.physical).toBeGreaterThan(0)
    expect(drained.mental).toBeGreaterThan(0)
  })

  /**
   * The guard that keeps four reserves worth having. If a secondary cost ever approached its
   * primary, every bar would move with every other and §6.3's separate pricing would be
   * decorative.
   */
  it('never charges another reserve more than a fraction of the one it belongs to', () => {
    const drained = drainForDay(deskDay, healthy, DEFAULT_PARAMS)

    expect(drained.physical).toBeLessThan(drained.mental / 3)
  })

  /** Silence where there is no evidence, rather than a small invented number everywhere.
   *  Studying does not cost a student their friendships. */
  it('leaves a reserve alone when the activity has nothing to do with it', () => {
    // Social carries the isolation charge on any day under the floor, so this reads the
    // secondary cost through a day that had contact and therefore no isolation line.
    const withContact = day({
      activities: [
        study(9, 10),
        { kind: 'socialRestorative', type: 'social', hours: 2, intensity: 1, startHour: 20 },
      ],
    })

    expect(drainForDay(withContact, healthy, DEFAULT_PARAMS).social).toBe(0)
  })

  /** Recovery is still recovery. The spread must not turn a rest block into a cost on some
   *  other bar, which is the quiet way this change could undo §5.1. */
  it('spreads nothing at all from rest or from seeing people', () => {
    const restful = day({
      activities: [
        { kind: 'rest', type: 'mental', hours: 2, intensity: 1, startHour: 20 },
        { kind: 'socialRestorative', type: 'social', hours: 2, intensity: 1, startHour: 17 },
      ],
    })
    const drained = drainForDay(restful, healthy, DEFAULT_PARAMS)

    expect(drained.mental).toBe(0)
    expect(drained.physical).toBe(0)
    expect(drained.errands).toBe(0)
  })
})

/**
 * §6.4 amended: an hour of hard exertion is more tiring than an hour of reading.
 *
 * `typeIntensity` put physical at 0.8 against mental's 1.0, so the model charged five hours
 * of hard training 4.00 against five hours of study's 5.00 -- studying rated as the more
 * depleting of the two, per hour, each on its own reserve. Against the recovery a night's
 * sleep pays a body that never bit: measured, five hours of hard exercise EVERY day for
 * three weeks settled the body bar at 83, and one hour a day took it from 80 up to 97.
 *
 * The 0.8 was not wrong so much as answering a different question. One number was serving
 * both "how tiring is an hour of this" here and "how bad is it to be late with this" in
 * `objective.consequenceOf`, and those agree for study against laundry -- study is both
 * heavier and more consequential -- while for exercise they point opposite ways. An hour of
 * training is more depleting than an hour of study; a missed session is less consequential
 * than a missed essay. `objective.CONSEQUENCE` is the second number, and it keeps the old
 * figures, so nothing the solver ranks changes.
 */
describe('what an hour of each kind of load costs', () => {
  const forHours = (activity: Activity, of: 'mental' | 'physical'): number =>
    drainForDay(day({ activities: [activity] }), healthy, DEFAULT_PARAMS)[of]

  const training = (hours: number): Activity => ({
    kind: 'hardExercise',
    type: 'physical',
    hours,
    intensity: 1,
    startHour: 9,
  })

  it('charges hard exercise more per hour than study, each on its own reserve', () => {
    expect(forHours(training(5), 'physical')).toBeGreaterThan(forHours(study(9, 5), 'mental'))
  })

  /** Per hour and on its own reserve, which is the only comparison that means anything here.
   *  Comparing a body against a mind outright would be the single-number reading §6.3 exists
   *  to refuse -- the two are not denominated in the same thing. */
  it('scales with the hours, so a long session costs a long session', () => {
    const oneHour = forHours(training(1), 'physical')

    expect(forHours(training(5), 'physical')).toBeCloseTo(oneHour * 5, 6)
  })
})

/**
 * §1.2 amended: a quarter of an hour with somebody is a quarter of an hour, not nothing.
 *
 * The isolation charge was a switch on `socialFloorHoursPerDay` -- under half an hour you
 * paid all of it, at half an hour you paid none -- so one minute of difference moved the
 * social bar 28 points across a fortnight: 29 minutes a day settled at 67 and 30 minutes at
 * 95. A student who says hello in a corridor every day was scored as though they had spoken
 * to nobody for three weeks.
 *
 * `neighbours.socialMoves` already names this as a known mismatch in its own comment -- "a
 * fifteen-minute coffee satisfies this guard while the day goes on draining" -- and it is
 * worse in the other direction, because at the floor the drain stops completely.
 *
 * A straight line between the two ends, which introduces no number: the floor that was the
 * wall is now the point the line reaches zero.
 */
describe('isolation is charged in proportion to how short the day fell', () => {
  const contact = (hours: number): DayInput =>
    day({
      activities: [
        study(9, 4),
        ...(hours === 0
          ? []
          : [
              {
                kind: 'socialRestorative' as const,
                type: 'social' as const,
                hours,
                intensity: 1,
                startHour: 18,
              },
            ]),
      ],
    })

  const isolationOn = (hours: number): number =>
    drainForDay(contact(hours), healthy, DEFAULT_PARAMS).social

  const floor = DEFAULT_PARAMS.socialFloorHoursPerDay

  it('charges the whole thing on a day with nobody in it', () => {
    expect(isolationOn(0)).toBeGreaterThan(0)
  })

  it('charges nothing once the day clears the floor', () => {
    expect(isolationOn(floor)).toBe(0)
    expect(isolationOn(floor * 4)).toBe(0)
  })

  /** The point of the change: half the floor costs half the charge, rather than all of it. */
  it('charges half for half the floor', () => {
    expect(isolationOn(floor / 2)).toBeCloseTo(isolationOn(0) / 2, 6)
  })

  /** No step anywhere along it. A minute either side of the floor used to be worth 28 points
   *  on the bar across a fortnight. */
  it('has no cliff at the floor itself', () => {
    const justUnder = isolationOn(floor - 0.01)

    expect(justUnder).toBeGreaterThan(0)
    expect(justUnder).toBeLessThan(isolationOn(0) / 10)
  })
})

describe('drainSources', () => {
  const day = (activities: Activity[], over: Partial<DayInput> = {}): DayInput => ({
    dayIndex: 0,
    activities,
    sleepHours: 7,
    venueChanges: 0,
    daysToNearestDeadline: null,
    checkedIn: true,
    ...over,
  })

  const rested: Reserves = { mental: 100, physical: 100, social: 100, errands: 100 }

  const study = (hours: number): Activity => ({
    kind: 'studyBlock',
    type: 'mental',
    hours,
    intensity: 1,
    startHour: 9,
  })

  const restBlock = (hours: number): Activity => ({
    kind: 'rest',
    type: 'mental',
    hours,
    intensity: 1,
    startHour: 20,
  })

  const seeingSomebody = (hours: number): Activity => ({
    kind: 'socialRestorative',
    type: 'social',
    hours,
    intensity: 1,
    startHour: 18,
  })

  /**
   * The days a student is most likely to ask "why" about are the ones they did something
   * about, and the itemised explanation had never been run on one.
   *
   * `drainForDay` and `drainSources` hold two copies of one formula, bound by the sum test
   * below -- but that test only ever fed them study blocks, so neither the recovery guard nor
   * the contact check in the second copy had been exercised at all. A day with rest on it is
   * exactly where the two could drift without anything noticing.
   */
  it('never bills a student for resting', () => {
    const withRest = day([study(3), restBlock(2)])
    const sources = drainSources(withRest, rested, DEFAULT_PARAMS)

    expect(sources.some((source) => source.source === 'rest')).toBe(false)
    // And the study block beside it is still billed, so this is the rest being excluded
    // rather than the day being skipped.
    expect(sources.some((source) => source.source === 'studyBlock')).toBe(true)
  })

  /** §1.2: contact answers isolation, so there is no isolation line to explain on a day that
   *  had some -- however long the day was otherwise. */
  it('does not list isolation on a day that had real contact', () => {
    const sociable = day([study(8), seeingSomebody(2)])

    expect(drainSources(sociable, rested, DEFAULT_PARAMS).some((s) => s.source === 'isolation')).toBe(
      false,
    )
    expect(drainSources(day([study(8)]), rested, DEFAULT_PARAMS).some((s) => s.source === 'isolation')).toBe(
      true,
    )
  })

  /** The same binding as below, on a day carrying both of the kinds the sum test never fed
   *  it. */
  it('sums to exactly what drainForDay charged on a day with rest and company', () => {
    const mixed = day([study(4), seeingSomebody(2), restBlock(2)], { venueChanges: 1 })

    for (const type of ['mental', 'physical', 'social', 'errands'] as const) {
      const itemised = drainSources(mixed, rested, DEFAULT_PARAMS)
        .filter((source) => source.type === type)
        .reduce((sum, source) => sum + source.points, 0)

      expect(itemised).toBeCloseTo(drainForDay(mixed, rested, DEFAULT_PARAMS)[type], 10)
    }
  })

  /** The guard that keeps the explanation honest. If these ever disagree, a student is being
   *  told about a day the projection did not run. */
  it('sums to exactly what drainForDay charged', () => {
    const busy = day([study(3), { ...study(2), startHour: 14 }], {
      venueChanges: 2,
      daysToNearestDeadline: 1,
    })

    for (const type of ['mental', 'physical', 'social', 'errands'] as const) {
      const itemised = drainSources(busy, rested, DEFAULT_PARAMS)
        .filter((source) => source.type === type)
        .reduce((total, source) => total + source.points, 0)

      expect(itemised).toBeCloseTo(drainForDay(busy, rested, DEFAULT_PARAMS)[type], 6)
    }
  })

  it('names the kind of work an activity was', () => {
    const sources = drainSources(day([study(3)]), rested, DEFAULT_PARAMS)

    expect(sources.some((source) => source.source === 'studyBlock')).toBe(true)
  })

  /**
   * One line per kind *per bar*, which is what gathering has always meant here -- the key is
   * `kind:type`, not `kind`.
   *
   * It read as one line full stop while an activity could only ever charge one reserve. Study
   * now also costs a body (`SECONDARY_COST`), so two morning-and-afternoon study blocks
   * produce two lines: "studyBlock, study" and "studyBlock, body". Asserting the pair
   * separately says the thing this test was always about -- the two blocks were added
   * together rather than listed twice -- and says it about both bars instead of silently
   * about whichever one happened to exist.
   */
  it('gathers repeated work of one kind into a single line per reserve', () => {
    const sources = drainSources(
      day([study(2), { ...study(2), startHour: 14 }]),
      rested,
      DEFAULT_PARAMS,
    )
    const studyLines = sources.filter((source) => source.source === 'studyBlock')

    expect(studyLines.filter((source) => source.type === 'mental')).toHaveLength(1)
    expect(studyLines.filter((source) => source.type === 'physical')).toHaveLength(1)
    expect(studyLines).toHaveLength(2)
  })

  it('keeps the day-level charges apart from the work itself', () => {
    const sources = drainSources(
      day([study(2), { ...study(2), startHour: 14 }], { daysToNearestDeadline: 0, venueChanges: 1 }),
      rested,
      DEFAULT_PARAMS,
    )

    expect(sources.map((source) => source.source)).toEqual(
      expect.arrayContaining(['fragmentation', 'deadline', 'travel']),
    )
  })

  it('charges isolation on a day with nobody in it', () => {
    const sources = drainSources(day([study(2)]), rested, DEFAULT_PARAMS)

    expect(sources.some((source) => source.source === 'isolation')).toBe(true)
  })

  it('leaves out anything that cost nothing, rather than listing zeroes', () => {
    const sources = drainSources(day([study(2)]), rested, DEFAULT_PARAMS)

    expect(sources.every((source) => source.points > 0)).toBe(true)
  })
})

/**
 * §6.1 amended: a night short of the baseline now costs something.
 *
 * `recovery = max(0, sleep - 5) x k_sleep` floored the credit at zero, so two hours of sleep
 * and five hours of sleep were identical to the model -- and a week of two-hour nights left
 * the physical reserve sitting flat, because nothing drained it and nothing repaid it. The
 * model declined to have an opinion about the most damaging thing a student can do to
 * themselves.
 *
 * Charged as DRAIN rather than as negative recovery, and that is the load-bearing decision.
 * Recovery is multiplied by `efficiencyAt(reserve)`, so a negative credit would shrink as a
 * student got more depleted -- deprivation would hurt a healthy student MORE than an
 * exhausted one, which is backwards. Drain is where a cost belongs.
 */
describe('sleep debt', () => {
  const night = (sleepHours: number): DayInput => ({
    dayIndex: 0,
    activities: [],
    sleepHours,
    venueChanges: 0,
    daysToNearestDeadline: null,
    checkedIn: true,
  })

  const rested = { mental: 70, physical: 70, social: 70, errands: 70 }

  it('charges nothing for a night at or above the baseline', () => {
    expect(drainForDay(night(SLEEP_BASELINE_HOURS), rested, DEFAULT_PARAMS).mental).toBe(0)
    expect(drainForDay(night(9), rested, DEFAULT_PARAMS).mental).toBe(0)
  })

  /** The whole point: two hours and five hours can no longer be the same thing. */
  it('charges a short night, and charges a shorter one more', () => {
    const four = drainForDay(night(4), rested, DEFAULT_PARAMS)
    const two = drainForDay(night(2), rested, DEFAULT_PARAMS)

    expect(four.mental).toBeGreaterThan(0)
    expect(two.mental).toBeGreaterThan(four.mental)
    expect(two.physical).toBeGreaterThan(four.physical)
  })

  /**
   * Social is untouched, and that zero is the same one `kSleep` already carries. §5.2
   * prescribes a person when social reserve is low and §1.2 wants isolation to read as a
   * warning; letting sleep move that reserve in either direction makes the app's answer to
   * loneliness a matter of bedtime and erases the signal the engine exists to surface.
   */
  it('leaves the social reserve alone, as sleep always has', () => {
    // Compared across sleep rather than asserted at zero: a day with nobody on it already
    // drains social by `isolationDrainPerDay`, which is nothing to do with the night. What
    // must hold is that the night does not move it either way.
    const slept = drainForDay(night(8), rested, DEFAULT_PARAMS).social
    const awake = drainForDay(night(0), rested, DEFAULT_PARAMS).social

    expect(awake).toBe(slept)
  })

  /** Bounded by the baseline, so a night of none at all is the worst it can be -- there is no
   *  negative sleep to charge for. */
  it('charges no more for zero than the baseline allows', () => {
    const zero = drainForDay(night(0), rested, DEFAULT_PARAMS)

    expect(zero.mental).toBeCloseTo(SLEEP_BASELINE_HOURS * DEFAULT_PARAMS.kSleepDebt.mental)
  })
})

/**
 * §1.2 amended: a heavy day is when people withdraw, and the model has to say so.
 *
 * Isolation drained a flat `isolationDrainPerDay` on any day under the social floor, which
 * made social the one reserve that moved -- and moved like a metronome. Measured over a
 * fortnight it fell 1.5 a day whether the student did two hours of work a week or fifty. It
 * was not a reserve responding to a life; it was a clock counting days since somebody last
 * saw a person.
 *
 * Scaled by the day's load rather than charged as a separate term, deliberately. `isolation`
 * is one of the four coefficients `domain/recoveryLearning` learns per student, and a new
 * parameter beside it would be one the app had no way to learn -- so the load belongs inside
 * the coefficient that is already learnable, not next to it.
 */
describe('isolation costs more on a demanding day', () => {
  const sawNobody = (hours: number): DayInput =>
    day({
      activities: hours === 0 ? [] : [study(9, hours)],
    })

  it('charges an empty day the plain isolation drain', () => {
    expect(drainForDay(sawNobody(0), healthy, DEFAULT_PARAMS).social).toBeCloseTo(
      DEFAULT_PARAMS.isolationDrainPerDay,
      5,
    )
  })

  it('charges a full day of work more than an empty one', () => {
    const empty = drainForDay(sawNobody(0), healthy, DEFAULT_PARAMS).social
    const full = drainForDay(sawNobody(10), healthy, DEFAULT_PARAMS).social

    expect(full).toBeGreaterThan(empty)
  })

  /** Bounded, so a long day cannot run the charge away with it. A day at `dailyHoursCap` --
   *  the longest the model permits at all -- is the most isolating there is, and costs
   *  double. */
  it('caps the charge at double, however long the day', () => {
    const atCap = drainForDay(sawNobody(10), healthy, DEFAULT_PARAMS).social
    const absurd = drainForDay(sawNobody(20), healthy, DEFAULT_PARAMS).social

    expect(atCap).toBeCloseTo(DEFAULT_PARAMS.isolationDrainPerDay * 2, 5)
    expect(absurd).toBeCloseTo(atCap, 5)
  })

  /** Seeing somebody still clears it outright. The scaling changes what isolation costs,
   *  never whether contact answers it. */
  it('charges nothing at all on a heavy day that had real contact', () => {
    const seen = day({
      activities: [
        study(9, 10),
        { kind: 'socialRestorative', type: 'social', hours: 2, intensity: 1, startHour: 20 },
      ],
    })

    expect(drainForDay(seen, healthy, DEFAULT_PARAMS).social).toBe(0)
  })
})
