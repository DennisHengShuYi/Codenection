import { describe, expect, it } from 'vitest'
import { drainForDay, fragmentation } from './drain'
import { DEFAULT_PARAMS } from './params'
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
