import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS, project } from '../engine'
import { ALL_PRESENT, score, toDayInputs } from './objective'
import type { ScheduledItem } from './types'
import { errandItem, makeSchedule, restItem, socialBaseline, studyItem } from './testSupport'

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
   * of zero, both spend 18 days in deficit, both have one block a day so neither is
   * fragmented. Only the depth differs. Without the area term the objective scores them
   * exactly the same, the search goes blind, and the app tells a student in crisis that
   * their worst day goes "from 0 to 0".
   *
   * The preconditions are asserted rather than assumed, so if the model shifts and these
   * stop being a genuine tie, this fails loudly instead of passing for the wrong reason.
   * It did exactly that when §6.2/§6.6 went per-type: nine and ten hours had tied at 17
   * deficit days, and per-type drain separated them to 17 and 18. Re-derived by sweeping
   * hours and reading `deficitDays` -- eleven and twelve now tie at 18, and they sit in the
   * middle of the band that does (ten through thirteen), so a further small shift in the
   * model moves the band's edges before it breaks the tie. The fixture is the thing to
   * re-derive; the three preconditions are the point and must not be relaxed.
   */
  it('separates two crushed fortnights that tie on every other term', () => {
    const eleven = makeSchedule(
      Array.from({ length: 21 }, (_, d) => studyItem(`n${d}`, d, 11)),
      5,
    )
    const twelve = makeSchedule(
      Array.from({ length: 21 }, (_, d) => studyItem(`t${d}`, d, 12)),
      5,
    )

    const elevenProjection = project(
      eleven.start,
      toDayInputs(eleven, ALL_PRESENT),
      DEFAULT_PARAMS,
    )
    const twelveProjection = project(
      twelve.start,
      toDayInputs(twelve, ALL_PRESENT),
      DEFAULT_PARAMS,
    )

    expect(elevenProjection.worstFloor).toBe(twelveProjection.worstFloor)
    expect(elevenProjection.deficitDays).toBe(twelveProjection.deficitDays)
    expect(elevenProjection.deficitArea).toBeLessThan(twelveProjection.deficitArea)

    expect(score(eleven, DEFAULT_PARAMS)).toBeGreaterThan(score(twelve, DEFAULT_PARAMS))
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

/**
 * Ruling 20: four hours of final-year project and four hours of laundry were interchangeable load.
 *
 * The solver could defer the FYP chapter to its deadline to protect the floor, and nothing
 * in the score called that a bad trade -- the two differed only by `typeIntensity`, which
 * says how tiring they are, not what it costs to leave one until the last day.
 *
 * The weight is derived, never asked for. Ruling 20 is explicit that nobody should be made to
 * rank their own work, because everybody marks everything high; it comes from the load type
 * and the size of the block, both of which the app already knows.
 */
describe('score and what it costs to leave something until the deadline', () => {
  const due = (item: ScheduledItem, deadlineDay: number, dayIndex: number): ScheduledItem => ({
    ...item,
    deadlineDay,
    dayIndex,
  })

  const fyp = (dayIndex: number) => due(studyItem('fyp', dayIndex, 9), 8, dayIndex)
  const laundry = (dayIndex: number) => ({
    ...due(errandItem('laundry', dayIndex, 9), 8, dayIndex),
    hours: studyItem('fyp', 0, 9).hours,
  })

  const scoreOf = (item: ScheduledItem) => score(makeSchedule([item]), DEFAULT_PARAMS)

  it('prefers a week with buffer left before the deadline', () => {
    expect(scoreOf(fyp(4))).toBeGreaterThan(scoreOf(fyp(8)))
  })

  /**
   * The whole point. Both weeks defer the same number of hours to the same deadline, so
   * every other term scores them identically -- only the consequence of being late differs.
   */
  it('minds deferring the project more than deferring the laundry', () => {
    const projectDeferred = scoreOf(fyp(8)) - scoreOf(fyp(4))
    const laundryDeferred = scoreOf(laundry(8)) - scoreOf(laundry(4))

    expect(projectDeferred).toBeLessThan(laundryDeferred)
  })

  /** Undated work has no deadline to be late for, so it carries no pressure at all. */
  it('charges nothing for work with no deadline', () => {
    const undated = { ...studyItem('reading', 8, 9), deadlineDay: null }

    expect(scoreOf(undated)).toBeCloseTo(scoreOf({ ...undated, dayIndex: 4 }))
  })

  /**
   * A tiebreaker, not a fourth objective. §2.1's ordering is floor first: if this could
   * outrank the floor, the solver would cheerfully wreck a student's worst day to move an
   * essay one day earlier.
   */
  it('never outranks the floor it is supposed to be protecting', () => {
    const safeButCrushing = makeSchedule([
      ...Array.from({ length: 10 }, (_, day) => ({ ...studyItem(`heavy-${day}`, day, 9), hours: 10 })),
      fyp(4),
    ])
    const latePlusEasy = makeSchedule([fyp(8)])

    expect(score(latePlusEasy, DEFAULT_PARAMS)).toBeGreaterThan(score(safeButCrushing, DEFAULT_PARAMS))
  })
})

/**
 * Ruling 21: on a fortnight with almost nothing fixed, the objective inverts from flattening peaks
 * to defending a floor.
 *
 * The reason is that burnout there has a different cause. A student with a timetable burns
 * out from overload -- too much crammed against a frame they cannot move -- so spreading the
 * load matters. A student with almost nothing fixed burns out from drift: there is no frame,
 * nothing forces a heavy day, and tidying their week into one block per day is solving a
 * problem they do not have while ignoring how low it gets.
 *
 * So the peak-flattening term stops applying and depth below the threshold counts for more.
 * The floor itself is untouched in both: §2.1's ordering never lets the solver trade a
 * genuinely higher worst day for a tidier week.
 */
describe('score and the shape of the week', () => {
  /** Twelve short fixed blocks on days 0-11: a timetable. */
  const timetable = () =>
    Array.from({ length: 12 }, (_, index) => ({
      ...studyItem(`class-${index}`, index, 2),
      fixed: true,
    }))

  // Placed on days 15 and 16, clear of the timetable above, so the difference between these
  // two arrangements is the only thing the fragmentation term can see.
  const clustered = () => [
    studyItem('w-a', 15, 2),
    { ...studyItem('w-b', 15, 2), startHour: 13 },
  ]

  const spread = () => [studyItem('w-a', 15, 2), studyItem('w-b', 16, 2)]

  it('still prefers a spread week when there is a timetable to fit around', () => {
    const tidy = score(makeSchedule([...timetable(), ...spread()]), DEFAULT_PARAMS)
    const heaped = score(makeSchedule([...timetable(), ...clustered()]), DEFAULT_PARAMS)

    expect(tidy).toBeGreaterThan(heaped)
  })

  /**
   * With no frame, how the work is grouped is not the thing hurting anybody -- so the term
   * that tidies it yields. It does not fall silent: a student who has not entered a
   * timetable yet is a low-structure week by this measure, and Ruling 42 exists because that is
   * the common case, so switching tidying off entirely would stop spreading their work for
   * a reason they never chose.
   */
  it('minds how work is grouped less when there is no frame to fit it around', () => {
    const framed =
      score(makeSchedule([...timetable(), ...spread()]), DEFAULT_PARAMS) -
      score(makeSchedule([...timetable(), ...clustered()]), DEFAULT_PARAMS)

    const unframed = score(makeSchedule(spread()), DEFAULT_PARAMS) - score(makeSchedule(clustered()), DEFAULT_PARAMS)

    expect(unframed).toBeGreaterThan(0)
    expect(unframed).toBeLessThan(framed)
  })

  /**
   * §2.1's ordering survives the inversion. Whatever else changes, the solver may never
   * trade a genuinely higher worst day for a week that merely looks better arranged.
   */
  it('never lets the floor be traded away, whatever shape the week is', () => {
    // Every day of the fortnight buried, on four hours' sleep. The floor genuinely falls
    // here, which is what makes the comparison mean anything.
    const crushing = makeSchedule(
      Array.from({ length: 21 }, (_, day) => studyItem(`heavy-${day}`, day, 12)),
      4,
    )
    const gentle = makeSchedule(clustered(), 4)

    expect(score(gentle, DEFAULT_PARAMS)).toBeGreaterThan(score(crushing, DEFAULT_PARAMS))
  })
})
