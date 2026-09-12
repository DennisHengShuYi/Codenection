import { describe, expect, it } from 'vitest'
import { demoAccount, scatter, DAYS_BEHIND } from './demoAccount'
import { checkedInDays } from '../domain/blockLog'
import { todayIndex } from '../domain/calendar'
import { energyHistory } from '../domain/energyHistory'
import { BLOCK_KINDS, floorReserve, HORIZON_DAYS, project } from '../engine'
import type { ScheduledItem } from '../optimizer'
import { outcomesFrom } from '../domain/blockLog'
import { paramsFor } from '../domain/engineParams'
import { toDayInputs } from '../optimizer'

const TODAY = '2026-09-12'
const now = new Date(`${TODAY}T09:00:00+08:00`)

describe('demoAccount', () => {
  /**
   * The whole reason this fixture exists rather than `umCrunchWeek`.
   *
   * `umCrunchWeek` is unanchored, so `RoomShell` stamps day 0 with the day it is first
   * opened -- which puts the student on day 0 forever on a fresh account, where
   * `roomModel` reads `schedule.start` straight onto the dial and nothing an edit does can
   * move it. Anchoring behind today is what gives the fortnight lived days to project from.
   */
  it('anchors day zero a week behind today', () => {
    expect(todayIndex(demoAccount(TODAY).week, now, 'Asia/Kuala_Lumpur')).toBe(DAYS_BEHIND)
  })

  it('puts something on every day of the horizon', () => {
    const { week } = demoAccount(TODAY)
    const busy = new Set(week.items.map((item) => item.dayIndex))

    for (let day = 0; day < HORIZON_DAYS; day += 1) expect(busy).toContain(day)
  })

  /**
   * §6.5 treats a past day with no answer as a day the student went quiet and compounds
   * 8% more pessimism for each consecutive one. A week of unanswered history would price
   * this account as somebody who stopped using the app, so every day behind today carries
   * an answer and the reserves read off the events themselves.
   */
  it('leaves no silent day behind today', () => {
    const { week, blockLog } = demoAccount(TODAY)
    const checkedIn = checkedInDays(blockLog, DAYS_BEHIND, week.horizonDays)

    expect(checkedIn.every(Boolean)).toBe(true)
  })

  /**
   * The reported-energy table is finite, and `daysBehind` is a parameter.
   *
   * Ask for more history than the table holds and every extra day still needs a number --
   * a gap would be a prediction with no report, which `energyHistory` drops, so the
   * sparkline would silently come up short of the days it claims to cover.
   */
  it('still reports a figure for a history longer than its own table', () => {
    const longer = demoAccount(TODAY, 10)

    expect(longer.profile.predictions).toHaveLength(10)
    for (const prediction of longer.profile.predictions) {
      expect(prediction.reported).toBeGreaterThan(0)
      expect(prediction.predicted).toBeGreaterThan(0)
    }
  })

  /** Enough resolved reports for §8b's sparkline to draw rather than withhold. */
  it('carries a reported energy point for each day behind today', () => {
    expect(energyHistory(demoAccount(TODAY).profile.predictions)).toHaveLength(DAYS_BEHIND)
  })

  /**
   * The guard the rest of this file did not give.
   *
   * Every assertion above reads the fixture's own shape, so a block carrying a kind the
   * engine has never heard of -- `lecture`, say, where §6.6's table knows only `studyBlock`
   * -- passed all of them and then threw inside `carryoverAt` the moment anything projected
   * it. A fixture nothing can run is not a fixture.
   */
  it('projects without throwing, on every kind it uses', () => {
    const { week, blockLog, profile } = demoAccount(TODAY)

    for (const item of week.items) expect(BLOCK_KINDS).toContain(item.kind)

    const params = paramsFor(outcomesFrom(blockLog), profile.predictions)
    const projection = project(week.start, toDayInputs(week, []), params)

    expect(projection.central).toHaveLength(HORIZON_DAYS)
  })

  /**
   * What this fixture is *for*, stated so it cannot quietly stop being true.
   *
   * A seed whose reserves sit flat and high demonstrates nothing: the trend arrows read
   * steady, the week grid carries no marks, the crossing sentence says the horizon holds,
   * and Rebalance has nothing to improve. The first draft did exactly that -- a flat seven
   * hours of sleep returns twelve points of mental reserve a night and outran the whole
   * timetable, projecting 98% mental on a visibly heavy week.
   *
   * Deliberately not pinned to exact numbers, which would break on any engine change and
   * say nothing about intent. What must hold is the shape: it declines, and it crosses.
   */
  it('projects a fortnight that declines into deficit', () => {
    const { week, blockLog, profile } = demoAccount(TODAY)
    const params = paramsFor(outcomesFrom(blockLog), profile.predictions)
    const checkedIn = checkedInDays(blockLog, DAYS_BEHIND, week.horizonDays)
    const projection = project(week.start, toDayInputs(week, checkedIn), params)

    const entering = projection.central[DAYS_BEHIND - 1]
    expect(entering).toBeDefined()

    expect(projection.worstFloor).toBeLessThan(floorReserve(entering!))
    expect(projection.firstDeficitDay).not.toBeNull()
    // Ahead of the student rather than already behind them: a crossing in the past is a
    // week to explain, not one to act on, and §2.3 is about a decision still open.
    expect(projection.firstDeficitDay!).toBeGreaterThan(DAYS_BEHIND)
  })

  // Nothing in a fixture may mint protected rest: §5.1 gives `domain/scheduleRecovery` the
  // only door, and a seed that wrote one would be a second.
  it('mints no protected rest', () => {
    expect(demoAccount(TODAY).week.items.some((item) => item.protectedRest)).toBe(false)
  })
})

/**
 * A deliberately messy fortnight, for watching the rebalancer and the forecast do something.
 *
 * `demoAccount` is a tidy repeating week -- good for a baseline, and dull to demonstrate
 * against: it has no pile-ups, so Rebalance has little to find. This throws the movable half
 * of the week around so there is a real problem to solve.
 *
 * Seeded, because a demo nobody can reproduce is not a demo. Two runs with the same seed
 * give the same fortnight.
 */
describe('scatter', () => {
  const TODAY = '2026-09-12'
  const base = demoAccount(TODAY)

  it('leaves every day the student has already lived exactly as it was', () => {
    const before = JSON.stringify(
      base.week.items.filter((item) => item.dayIndex < DAYS_BEHIND),
    )
    const after = JSON.stringify(
      scatter(base.week, 1, DAYS_BEHIND).items.filter((item) => item.dayIndex < DAYS_BEHIND),
    )

    expect(after).toBe(before)
  })

  /** The timetable is a frame, not a suggestion: §2.1's fixed blocks stay where they are. */
  it('leaves fixed blocks alone', () => {
    const moved = scatter(base.week, 1, DAYS_BEHIND)

    for (const item of base.week.items.filter((entry) => entry.fixed)) {
      expect(moved.items.find((entry) => entry.id === item.id)?.dayIndex).toBe(item.dayIndex)
    }
  })

  it('actually rearranges something', () => {
    const moved = scatter(base.week, 1, DAYS_BEHIND)
    const changed = moved.items.filter(
      (item) => base.week.items.find((entry) => entry.id === item.id)?.dayIndex !== item.dayIndex,
    )

    expect(changed.length).toBeGreaterThan(0)
  })

  it('keeps every block inside the horizon and inside a day', () => {
    for (const item of scatter(base.week, 3, DAYS_BEHIND).items) {
      expect(item.dayIndex).toBeGreaterThanOrEqual(0)
      expect(item.dayIndex).toBeLessThan(HORIZON_DAYS)
      expect(item.startHour + item.hours).toBeLessThanOrEqual(22)
    }
  })

  it('gives the same fortnight for the same seed', () => {
    expect(JSON.stringify(scatter(base.week, 7, DAYS_BEHIND))).toBe(
      JSON.stringify(scatter(base.week, 7, DAYS_BEHIND)),
    )
  })

  it('mints no protected rest', () => {
    expect(scatter(base.week, 1, DAYS_BEHIND).items.some((item) => item.protectedRest)).toBe(false)
  })

  /**
   * Gives up rather than forcing a placement.
   *
   * Every attempt is a random day and hour, and each is rejected if it would sit on top of
   * something fixed. With the whole future walled off, none can succeed -- and the block
   * stays exactly where it was. Dropping it, or stacking it on a lecture, would be a seed
   * that produces a week the app itself calls invalid.
   */
  it('leaves a block where it is when nothing legal is found', () => {
    const wall = (dayIndex: number): ScheduledItem => ({
      id: `wall-${dayIndex}`,
      title: 'Solid',
      type: 'mental',
      kind: 'studyBlock',
      hours: 14,
      intensity: 1,
      dayIndex,
      startHour: 8,
      fixed: true,
      deadlineDay: null,
      protectedRest: false,
    })

    const walled = {
      ...base.week,
      items: [
        ...base.week.items.filter((item) => item.dayIndex < DAYS_BEHIND),
        ...Array.from({ length: HORIZON_DAYS - DAYS_BEHIND }, (_, offset) =>
          wall(offset + DAYS_BEHIND),
        ),
        { ...base.week.items[0]!, id: 'homeless', dayIndex: DAYS_BEHIND, fixed: false, hours: 3 },
      ],
    }

    const moved = scatter(walled, 2, DAYS_BEHIND)

    expect(moved.items.find((item) => item.id === 'homeless')?.dayIndex).toBe(DAYS_BEHIND)
  })
})
