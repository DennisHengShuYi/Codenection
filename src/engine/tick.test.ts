import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from './params'
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
