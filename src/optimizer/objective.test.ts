import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { score, toDayInputs } from './objective'
import { makeSchedule, restItem, studyItem } from './testSupport'

describe('toDayInputs', () => {
  it('produces one day per horizon day, even where nothing is scheduled', () => {
    expect(toDayInputs(makeSchedule([studyItem('a', 3, 2)]))).toHaveLength(21)
  })

  it('places each item on its own day', () => {
    const days = toDayInputs(makeSchedule([studyItem('a', 3, 2)]))

    expect(days[3]!.activities).toHaveLength(1)
    expect(days[2]!.activities).toHaveLength(0)
  })

  it('counts down to the nearest pending deadline', () => {
    const days = toDayInputs(makeSchedule([{ ...studyItem('a', 1, 2), deadlineDay: 5 }]))

    expect(days[0]!.daysToNearestDeadline).toBe(5)
    expect(days[5]!.daysToNearestDeadline).toBe(0)
  })

  it('stops counting a deadline once it has passed', () => {
    const days = toDayInputs(makeSchedule([{ ...studyItem('a', 1, 2), deadlineDay: 5 }]))

    expect(days[6]!.daysToNearestDeadline).toBeNull()
  })
})

describe('score', () => {
  // §2.1: maximise the minimum reserve, not the total and not the evenness. A fortnight
  // that averages fine but bottoms out at 8 is still a crash.
  it('prefers the schedule with the higher worst day, not the higher average', () => {
    const even = makeSchedule(Array.from({ length: 7 }, (_, d) => studyItem(`e${d}`, d, 2)))
    const spiky = makeSchedule([studyItem('s0', 0, 9)])

    expect(score(even, DEFAULT_PARAMS)).toBeGreaterThan(score(spiky, DEFAULT_PARAMS))
  })

  // The fragmentation term exists to stop the solver "fixing" a week by scattering ten
  // small tasks across every day, which lowers peak load but drains more.
  it('penalises fragmentation, so one block beats five scattered pieces', () => {
    const blocked = makeSchedule([studyItem('b', 0, 5)])
    const scattered = makeSchedule(
      Array.from({ length: 5 }, (_, i) => ({
        ...studyItem(`f${i}`, 0, 1),
        startHour: 8 + i * 2,
      })),
    )

    expect(score(blocked, DEFAULT_PARAMS)).toBeGreaterThan(score(scattered, DEFAULT_PARAMS))
  })

  it('penalises every day spent below the deficit threshold', () => {
    const light = makeSchedule([studyItem('l', 0, 1)])
    const crushing = makeSchedule(Array.from({ length: 14 }, (_, d) => studyItem(`c${d}`, d, 9)))

    expect(score(crushing, DEFAULT_PARAMS)).toBeLessThan(score(light, DEFAULT_PARAMS))
  })

  it('rewards adding a rest block to a heavy week', () => {
    const heavy = Array.from({ length: 7 }, (_, d) => studyItem(`h${d}`, d, 5))
    const without = makeSchedule(heavy)
    const withRest = makeSchedule([...heavy, restItem('rest', 3, 20)])

    expect(score(withRest, DEFAULT_PARAMS)).toBeGreaterThan(score(without, DEFAULT_PARAMS))
  })

  // §0's no-cold-start rule reaches the solver too: the objective must be finite on an
  // empty week, or the very first rebalance a new user triggers throws.
  it('scores an empty schedule without throwing', () => {
    expect(Number.isFinite(score(makeSchedule([]), DEFAULT_PARAMS))).toBe(true)
  })
})
