import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, ENOUGH_SLEEP_HOURS, SLEEP_BASELINE_HOURS } from './params'
import { applyCoupling, recoveryForDay, tick } from './tick'
import type { Activity, DayInput, Reserves } from './types'

const healthy: Reserves = { mental: 80, physical: 80, social: 80, errands: 80 }
const depleted: Reserves = { mental: 20, physical: 20, social: 20, errands: 20 }

const day = (over: Partial<DayInput> = {}): DayInput => ({
  dayIndex: 0,
  activities: [],
  sleepHours: 7,
  venueChanges: 0,
  daysToNearestDeadline: null,
  checkedIn: true,
  ...over,
})

const rest: Activity = {
  kind: 'rest',
  type: 'mental',
  hours: 1,
  intensity: 1,
  startHour: 20,
}

describe('recoveryForDay', () => {
  it('gives nothing back for sleep at or below the baseline', () => {
    expect(recoveryForDay(day({ sleepHours: 5 }), DEFAULT_PARAMS).mental).toBe(0)
  })

  it('gives nothing back for sleep below the baseline either', () => {
    expect(recoveryForDay(day({ sleepHours: 3 }), DEFAULT_PARAMS).mental).toBe(0)
  })

  it('gives more back for more sleep', () => {
    const short = recoveryForDay(day({ sleepHours: 6 }), DEFAULT_PARAMS).mental
    const long = recoveryForDay(day({ sleepHours: 8 }), DEFAULT_PARAMS).mental

    expect(long).toBeGreaterThan(short)
  })

  it('counts a scheduled rest block', () => {
    const withRest = recoveryForDay(day({ activities: [rest] }), DEFAULT_PARAMS).mental

    expect(withRest).toBeGreaterThan(recoveryForDay(day(), DEFAULT_PARAMS).mental)
  })

  // §5.1: recovery has a ceiling as well as a floor. A 12-hour scroll session is not
  // recovery and the model must not count it as neutral free time.
  it('stops paying out past the useful ceiling of a rest block', () => {
    const marathon: Activity = { ...rest, hours: 12 }
    const sane: Activity = { ...rest, hours: 3 }

    const long = recoveryForDay(day({ activities: [marathon] }), DEFAULT_PARAMS).mental
    const short = recoveryForDay(day({ activities: [sane] }), DEFAULT_PARAMS).mental

    expect(long).toBe(short)
  })

  // §5.2: social low prescribes a person. Restorative contact has to give social
  // reserve back, or the model's own recovery advice would not move the number it is
  // prescribed for.
  it('gives social reserve back for restorative contact', () => {
    const friend: Activity = {
      kind: 'socialRestorative',
      type: 'social',
      hours: 2,
      intensity: 1,
      startHour: 18,
    }

    expect(recoveryForDay(day({ activities: [friend] }), DEFAULT_PARAMS).social)
      .toBeGreaterThan(recoveryForDay(day(), DEFAULT_PARAMS).social)
  })

  /**
   * §5.2: "Social low prescribes a person." §1.2: low social load is a warning, not a
   * good score.
   *
   * Sleep must therefore not refill the social reserve. If it does, an isolated student
   * recovers by sleeping, the app's prescription for loneliness becomes an early night,
   * and the isolation signal the engine was built to surface quietly disappears.
   */
  it('does not let sleep refill the social reserve', () => {
    const wellSlept = recoveryForDay(day({ sleepHours: 9 }), DEFAULT_PARAMS)

    expect(wellSlept.mental).toBeGreaterThan(0)
    expect(wellSlept.social).toBe(0)
  })

  it('recovers the social reserve only from seeing people', () => {
    const friend: Activity = {
      kind: 'socialRestorative',
      type: 'social',
      hours: 2,
      intensity: 1,
      startHour: 18,
    }

    expect(recoveryForDay(day({ activities: [friend] }), DEFAULT_PARAMS).social)
      .toBeGreaterThan(0)
  })
})

describe('applyCoupling', () => {
  it('drags mental down when physical is in deficit', () => {
    const lowPhysical: Reserves = { mental: 80, physical: 5, social: 80, errands: 80 }

    expect(applyCoupling(lowPhysical).mental).toBeLessThan(80)
  })

  it('leaves a healthy state alone', () => {
    expect(applyCoupling(healthy).mental).toBeCloseTo(80)
  })

  it('never lifts a reserve', () => {
    const mixed: Reserves = { mental: 50, physical: 10, social: 90, errands: 40 }
    const after = applyCoupling(mixed)

    expect(after.mental).toBeLessThanOrEqual(50)
    expect(after.social).toBeLessThanOrEqual(90)
    expect(after.errands).toBeLessThanOrEqual(40)
  })

  // §6.3's stated consequence: a student who is not busy but is isolated shows as
  // unwell, where a single-number model would call them healthy.
  it('makes isolation visible in the other reserves', () => {
    const isolated: Reserves = { mental: 80, physical: 80, social: 2, errands: 80 }

    expect(applyCoupling(isolated).mental).toBeLessThan(80)
  })

  it('never drives a reserve below zero', () => {
    const wrecked: Reserves = { mental: 1, physical: 0, social: 0, errands: 0 }

    for (const value of Object.values(applyCoupling(wrecked))) {
      expect(value).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('tick', () => {
  it('recovers on an empty, well-slept day', () => {
    const after = tick(depleted, day({ sleepHours: 9, activities: [rest] }), DEFAULT_PARAMS)

    expect(after.mental).toBeGreaterThan(depleted.mental)
  })

  it('drains on a heavy day', () => {
    const heavy = day({
      activities: [{ kind: 'studyBlock', type: 'mental', hours: 8, intensity: 1, startHour: 9 }],
      sleepHours: 5,
    })

    expect(tick(healthy, heavy, DEFAULT_PARAMS).mental).toBeLessThan(healthy.mental)
  })

  // §6.2's spiral, asserted end to end: identical rest buys less when you are further
  // down. This is the single behaviour that separates the model from a linear tracker.
  it('returns less from identical rest at low reserve than at high reserve', () => {
    const restful = day({ sleepHours: 9, activities: [rest] })

    const fromHigh = tick(healthy, restful, DEFAULT_PARAMS).mental - healthy.mental
    const fromLow = tick(depleted, restful, DEFAULT_PARAMS).mental - depleted.mental

    expect(fromLow).toBeLessThan(fromHigh)
  })

  /**
   * §6.2's spiral, per reserve rather than per body.
   *
   * Both states below have a mean of 65, so an efficiency read off `overallReserve` pays
   * out identically on each -- which means a student with nothing left mentally gets back
   * as much from an early night as one who is evenly three-quarters full. §6.1 writes
   * `efficiency[d] = 0.45 + 0.55 × (reserve[d] / 100)` inside the same block as
   * `reserve[d+1] = reserve[d] − drain[d] + recovery[d] × efficiency[d]`, where `reserve`
   * is the four-vector; per-type indexing is what that notation says.
   *
   * Neither state couples into mental: the reserves that could drag it are at 80, well
   * above §6.3's deficit threshold, so what this measures is the efficiency curve alone.
   */
  it('pays rest back at the reserve own level, not at the mean of all four', () => {
    const restful = day({ sleepHours: 9, activities: [rest] })
    const mentalSpent: Reserves = { mental: 20, physical: 80, social: 80, errands: 80 }
    const evenlyWorn: Reserves = { mental: 65, physical: 65, social: 65, errands: 65 }

    const toSpent = tick(mentalSpent, restful, DEFAULT_PARAMS).mental - mentalSpent.mental
    const toEven = tick(evenlyWorn, restful, DEFAULT_PARAMS).mental - evenlyWorn.mental

    expect(toSpent).toBeLessThan(toEven)
  })

  /**
   * The consequence worth stating: a rested body no longer pays for a sick reserve.
   *
   * Under a mean-based efficiency a collapsed mental reserve dragged every other reserve's
   * recovery down with it, at an implicit weight far larger than anything in §6.3's
   * coupling matrix. That was a second, undeclared coupling channel; `applyCoupling` is now
   * the only path by which one reserve's deficit reaches another.
   */
  it('does not let one collapsed reserve slow another reserve own recovery', () => {
    const restful = day({ sleepHours: 9, activities: [rest] })
    const mentalGone: Reserves = { mental: 0, physical: 70, social: 70, errands: 70 }
    const evenlyFine: Reserves = { mental: 70, physical: 70, social: 70, errands: 70 }

    const alongside = tick(mentalGone, restful, DEFAULT_PARAMS).physical - mentalGone.physical
    const fresh = tick(evenlyFine, restful, DEFAULT_PARAMS).physical - evenlyFine.physical

    // Coupling still reaches physical from an empty mental reserve, so the two are not
    // equal -- but the efficiency curve must no longer be a second channel on top.
    expect(alongside).toBeGreaterThan(fresh * 0.9)
  })

  it('clamps to zero at the bottom', () => {
    const brutal = day({
      activities: [{ kind: 'studyBlock', type: 'mental', hours: 40, intensity: 2, startHour: 0 }],
      sleepHours: 0,
    })

    expect(tick(depleted, brutal, DEFAULT_PARAMS).mental).toBeGreaterThanOrEqual(0)
  })

  it('clamps to a hundred at the top', () => {
    const full: Reserves = { mental: 100, physical: 100, social: 100, errands: 100 }
    const easy = day({ sleepHours: 10, activities: [rest] })

    for (const value of Object.values(tick(full, easy, DEFAULT_PARAMS))) {
      expect(value).toBeLessThanOrEqual(100)
    }
  })

  it('does not mutate the reserves it is given', () => {
    const before = { ...healthy }
    tick(healthy, day(), DEFAULT_PARAMS)

    expect(healthy).toEqual(before)
  })

  it('does not mutate the day it is given', () => {
    const input = day({ activities: [rest] })
    const before = JSON.stringify(input)
    tick(healthy, input, DEFAULT_PARAMS)

    expect(JSON.stringify(input)).toBe(before)
  })
})

/**
 * §6.1 amended again: sleep stops paying somewhere.
 *
 * Recovery treated sleep as linear forever -- nine hours beat eight, twelve beat nine, with no
 * point at which more stopped helping. So "enough" was not a thing the model could hold, and no
 * amount of learning would have produced it.
 *
 * It also earns its place on its own. §5.1 already caps REST per block for exactly this
 * reasoning -- "a 12-hour scroll session is not recovery, and the model must not count it as
 * neutral free time" -- and sleep had no equivalent, so a student recorded as sleeping twelve
 * hours was credited seven hours of recovery.
 */
describe('recoveryForDay and the ceiling on sleep', () => {
  const mentalFor = (sleepHours: number, params = DEFAULT_PARAMS) =>
    recoveryForDay(day({ sleepHours }), params).mental

  it('credits a night below the ceiling exactly as it always did', () => {
    expect(mentalFor(7)).toBeCloseTo((7 - SLEEP_BASELINE_HOURS) * DEFAULT_PARAMS.kSleep.mental)
  })

  /** The boundary, where a `min` is likeliest to be written one hour out. */
  it('credits a night exactly at the ceiling in full', () => {
    expect(mentalFor(ENOUGH_SLEEP_HOURS)).toBeCloseTo(
      (ENOUGH_SLEEP_HOURS - SLEEP_BASELINE_HOURS) * DEFAULT_PARAMS.kSleep.mental,
    )
  })

  it('credits a night past the ceiling only up to it', () => {
    expect(mentalFor(ENOUGH_SLEEP_HOURS + 2)).toBe(mentalFor(ENOUGH_SLEEP_HOURS))
  })

  it('credits twelve hours the same as nine, not seven hours worth', () => {
    expect(mentalFor(12)).toBe(mentalFor(ENOUGH_SLEEP_HOURS))
  })

  /**
   * The credit is a window now -- a floor at the baseline and a ceiling above it -- and adding
   * the second bound is exactly the moment the first gets broken.
   */
  it('still credits nothing below the baseline', () => {
    expect(mentalFor(3)).toBe(0)
    expect(mentalFor(0)).toBe(0)
  })

  it('leaves the social reserve at nothing, as sleep always has', () => {
    expect(recoveryForDay(day({ sleepHours: 12 }), DEFAULT_PARAMS).social).toBe(0)
  })

  /** A personal ceiling is the point of the parameter; the default is only where it starts. */
  it('honours a ceiling learned for this student', () => {
    const theirs = { ...DEFAULT_PARAMS, enoughSleepHours: 7 }

    expect(mentalFor(9, theirs)).toBe(mentalFor(7, theirs))
  })
})
