import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS, project } from '../engine'
import { ALL_PRESENT, score, toDayInputs } from './objective'
import { makeSchedule, restItem, socialBaseline, studyItem } from './testSupport'

describe('toDayInputs', () => {
  it('produces one day per horizon day, even where nothing is scheduled', () => {
    expect(toDayInputs(makeSchedule([studyItem('a', 3, 2)]), ALL_PRESENT)).toHaveLength(21)
  })

  it('places each item on its own day', () => {
    const days = toDayInputs(makeSchedule([studyItem('a', 3, 2)]), ALL_PRESENT)

    expect(days[3]!.activities).toHaveLength(1)
    expect(days[2]!.activities).toHaveLength(0)
  })

  it('counts down to the nearest pending deadline', () => {
    const days = toDayInputs(makeSchedule([{ ...studyItem('a', 1, 2), deadlineDay: 5 }]), ALL_PRESENT)

    expect(days[0]!.daysToNearestDeadline).toBe(5)
    expect(days[5]!.daysToNearestDeadline).toBe(0)
  })

  it('stops counting a deadline once it has passed', () => {
    const days = toDayInputs(makeSchedule([{ ...studyItem('a', 1, 2), deadlineDay: 5 }]), ALL_PRESENT)

    expect(days[6]!.daysToNearestDeadline).toBeNull()
  })

  /**
   * §8b: the optimizer's search calls this thousands of times per solve and has no notion
   * of missed check-ins, so `ALL_PRESENT` -- an explicit, named argument rather than an
   * omitted one -- has to read as exactly what every internal call already assumed:
   * everybody present. Only the app's own projection passes real data.
   */
  it('reads every day as checked in when ALL_PRESENT is passed', () => {
    const days = toDayInputs(makeSchedule([studyItem('a', 3, 2)]), ALL_PRESENT)

    expect(days.every((day) => day.checkedIn)).toBe(true)
  })

  it('carries a provided checkedIn override through, one entry per day', () => {
    const checkedIn = Array.from({ length: HORIZON_DAYS }, (_, day) => day !== 2)
    const days = toDayInputs(makeSchedule([studyItem('a', 3, 2)]), checkedIn)

    expect(days[2]!.checkedIn).toBe(false)
    expect(days[0]!.checkedIn).toBe(true)
  })

  it('passes real check-in data through rather than asserting everyone checked in', () => {
    // The third dead mechanism: this was hardcoded `true`, so §6.5's missing-data pessimism
    // could never fire in the whole app.
    const days = toDayInputs(makeSchedule([studyItem('a', 3, 2)]), [false, true, true])

    expect(days[0]?.checkedIn).toBe(false)
  })

  /**
   * The trap the brief calls out by name: wiring §6.5's missing-data pessimism up means
   * nothing unless it is verified to actually move the number a student is shown.
   */
  it('projects more pessimistically when a past day went unanswered than when it did not', () => {
    // Heavy enough that mental reserve does not simply saturate back at the ceiling every
    // night on recovery alone -- otherwise a single day's bias difference has nothing to
    // bite into.
    const schedule = makeSchedule([
      ...socialBaseline(),
      ...Array.from({ length: 14 }, (_, day) => studyItem(`s${day}`, day, 9)),
    ])
    const allAnswered = Array.from({ length: HORIZON_DAYS }, () => true)
    // Silent for every day up to and including the one being read: the penalty is
    // computed from that day's own missed run, so a check-in on the day itself would
    // reset it to zero and mask the very effect this proves.
    const silentThroughTheDrain = allAnswered.map((value, day) => (day <= 13 ? false : value))

    const answered = project(schedule.start, toDayInputs(schedule, allAnswered), DEFAULT_PARAMS)
    const silent = project(
      schedule.start,
      toDayInputs(schedule, silentThroughTheDrain),
      DEFAULT_PARAMS,
    )

    expect(silent.central[13]!.mental).toBeLessThan(answered.central[13]!.mental)
  })
})

describe('score', () => {
  // §2.1: maximise the minimum reserve, not the total and not the evenness. A fortnight
  // that averages fine but bottoms out at 8 is still a crash.
  it('prefers the schedule with the higher worst day, not the higher average', () => {
    // Same total hours, spread differently. Heavy enough that workload rather than
    // social contact is what sets the floor -- a light fixture measures loneliness.
    const even = makeSchedule([
      ...socialBaseline(),
      ...Array.from({ length: 14 }, (_, d) => studyItem(`e${d}`, d, 5)),
    ])
    const spiky = makeSchedule([
      ...socialBaseline(),
      ...Array.from({ length: 7 }, (_, d) => studyItem(`s${d}`, d, 10)),
    ])

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
    const light = makeSchedule([...socialBaseline(), studyItem('l', 0, 1)])
    const crushing = makeSchedule([
      ...socialBaseline(),
      ...Array.from({ length: 14 }, (_, d) => studyItem(`c${d}`, d, 9)),
    ])

    expect(score(crushing, DEFAULT_PARAMS)).toBeLessThan(score(light, DEFAULT_PARAMS))
  })

  it('rewards adding a rest block to a heavy week', () => {
    // Sleeping badly on purpose. At seven hours a night the sleep credit outweighs even
    // an eight-hour study day, so the reserve rises and a rest block has nothing to fix.
    const heavy = [
      ...socialBaseline(),
      ...Array.from({ length: 14 }, (_, d) => studyItem(`h${d}`, d, 8)),
    ]
    const without = makeSchedule(heavy, 5)
    const withRest = makeSchedule([...heavy, restItem('rest', 3, 20)], 5)

    expect(score(withRest, DEFAULT_PARAMS)).toBeGreaterThan(score(without, DEFAULT_PARAMS))
  })

  // §0's no-cold-start rule reaches the solver too: the objective must be finite on an
  // empty week, or the very first rebalance a new user triggers throws.
  it('scores an empty schedule without throwing', () => {
    expect(Number.isFinite(score(makeSchedule([]), DEFAULT_PARAMS))).toBe(true)
  })

  /**
   * The tiebreaker, tested at the one point where it is the only thing that can decide.
   *
   * These two fortnights are identical on every other term -- both bottom out at a floor
   * of zero, both spend 17 days in deficit, both have one block a day so neither is
   * fragmented. Only the depth differs. Without the area term the objective scores them
   * exactly the same, the search goes blind, and the app tells a student in crisis that
   * their worst day goes "from 0 to 0".
   *
   * The preconditions are asserted rather than assumed, so if the model shifts and these
   * stop being a genuine tie, this fails loudly instead of passing for the wrong reason.
   */
  it('separates two crushed fortnights that tie on every other term', () => {
    const nine = makeSchedule(
      Array.from({ length: 21 }, (_, d) => studyItem(`n${d}`, d, 9)),
      5,
    )
    const ten = makeSchedule(
      Array.from({ length: 21 }, (_, d) => studyItem(`t${d}`, d, 10)),
      5,
    )

    const nineProjection = project(nine.start, toDayInputs(nine, ALL_PRESENT), DEFAULT_PARAMS)
    const tenProjection = project(ten.start, toDayInputs(ten, ALL_PRESENT), DEFAULT_PARAMS)

    expect(nineProjection.worstFloor).toBe(tenProjection.worstFloor)
    expect(nineProjection.deficitDays).toBe(tenProjection.deficitDays)
    expect(nineProjection.deficitArea).toBeLessThan(tenProjection.deficitArea)

    expect(score(nine, DEFAULT_PARAMS)).toBeGreaterThan(score(ten, DEFAULT_PARAMS))
  })

  // §2.1 states min(reserve) as the objective, and it stays the objective. The area term
  // is weighted small enough that it can only break ties, never outrank a real gain in
  // the floor -- otherwise the solver could trade a genuinely higher worst day for a
  // flatter but lower week, which is the outcome §2.1's min() exists to forbid.
  it('never lets the tiebreaker outrank a real gain in the floor', () => {
    const higherFloor = makeSchedule([...socialBaseline(), studyItem('a', 0, 2)])
    const lowerFloorFlatter = makeSchedule([
      ...socialBaseline(),
      ...Array.from({ length: 20 }, (_, d) => studyItem(`f${d}`, d, 6)),
    ])

    expect(score(higherFloor, DEFAULT_PARAMS)).toBeGreaterThan(
      score(lowerFloorFlatter, DEFAULT_PARAMS),
    )
  })
})
