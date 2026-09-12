import { describe, expect, it } from 'vitest'
import { freshWeek } from './freshWeek'
import { FULL_RESERVE, HORIZON_DAYS, LOAD_TYPES } from '../engine'

describe('freshWeek', () => {
  // A real student's own fortnight, before they have told the app anything. Nothing is
  // assumed on their behalf -- the opposite of `umCrunchWeek`, whose depletion and UM
  // timetable are a demo's invention.
  it('holds nothing the student has not entered', () => {
    expect(freshWeek().items).toEqual([])
  })

  /**
   * Full, because the app has seen nothing that could have cost them anything.
   *
   * `schedule.start` is the reserve the fortnight opens with, and on day 0 it is read
   * straight onto the dial and the five bars -- so any other number here is the app stating
   * a depletion it never measured, to a student on their first screen.
   */
  it('opens at full reserve on every type', () => {
    const { start } = freshWeek()
    for (const type of LOAD_TYPES) expect(start[type]).toBe(FULL_RESERVE)
  })

  it('spans the engine horizon, with a sleep figure for every day', () => {
    const schedule = freshWeek()
    expect(schedule.horizonDays).toBe(HORIZON_DAYS)
    expect(schedule.sleepByDay).toHaveLength(HORIZON_DAYS)
  })

  // Never anchored here: `RoomShell` stamps day 0 with the student's own date on first
  // render, and a week that anchored itself would date them from whenever this ran.
  it('carries no calendar anchor', () => {
    expect(freshWeek().startedOn).toBeUndefined()
  })
})
