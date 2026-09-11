import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PARAMS,
  HORIZON_DAYS,
  project,
  type DayInput,
  type Reserves,
} from '../../engine'
import { domainBars, scheduleDensity } from './domainBars'

const healthy: Reserves = { mental: 80, physical: 80, social: 80, errands: 80 }

const emptyDays = (): DayInput[] =>
  Array.from({ length: HORIZON_DAYS }, (_, dayIndex) => ({
    dayIndex,
    activities: [],
    sleepHours: 7,
    venueChanges: 0,
    daysToNearestDeadline: null,
    checkedIn: true,
  }))

const daysWith = (hours: number): DayInput[] =>
  emptyDays().map((day) => ({
    ...day,
    activities: [
      {
        kind: 'studyBlock' as const,
        type: 'mental' as const,
        hours,
        intensity: 1,
        startHour: 9,
      },
    ],
  }))

const barsFor = (reserves: Reserves, days: DayInput[] = emptyDays()) =>
  domainBars(reserves, project(reserves, days, DEFAULT_PARAMS), days)

describe('scheduleDensity', () => {
  it('is zero for an empty fortnight', () => {
    expect(scheduleDensity(emptyDays())).toBe(0)
  })

  it('rises with committed hours', () => {
    expect(scheduleDensity(daysWith(6))).toBeGreaterThan(scheduleDensity(emptyDays()))
  })

  // A value past the ceiling would draw a bar wider than its track.
  it('never exceeds its ceiling however packed the week', () => {
    expect(scheduleDensity(daysWith(24))).toBeLessThanOrEqual(100)
  })

  it('is zero for no days at all rather than dividing by zero', () => {
    expect(scheduleDensity([])).toBe(0)
  })
})

describe('domainBars', () => {
  // §0: the brief lists five areas and the UI surfaces five labels, while the model
  // underneath uses four. Schedule density is the derived fifth.
  it('produces exactly five bars', () => {
    expect(barsFor(healthy)).toHaveLength(5)
  })

  it('includes a schedule bar that is not one of the four load types', () => {
    expect(barsFor(healthy).map((bar) => bar.key)).toContain('schedule')
  })

  // §1.2: each against its own ceiling, not a shared scale. A shared scale would make a
  // full social life and a full workload look like the same thing.
  it('gives every bar its own ceiling', () => {
    for (const bar of barsFor(healthy)) {
      expect(bar.ceiling).toBeGreaterThan(0)
      expect(bar.value).toBeLessThanOrEqual(bar.ceiling)
    }
  })

  /**
   * Rewritten deliberately, and the §1.5 claim it carries is stronger than before.
   *
   * It used to require a direction on every bar, which the density bar satisfied by
   * hard-coding `'flat'` -- so the assertion passed on an invented reading and the bar
   * announced "steady" to a screen reader. Severity was never carried by the arrow anyway:
   * it is carried by `status` and, where it matters, by a sentence. That is what is checked
   * now, and a trend is required only where one was actually measured.
   */
  it('carries severity in words and status, never in colour alone', () => {
    for (const bar of barsFor(healthy)) {
      expect(['healthy', 'stretched', 'critical']).toContain(bar.status)
      expect(bar.trend === null || ['rising', 'flat', 'falling'].includes(bar.trend)).toBe(true)
    }
  })

  /** The four measured bars must keep their direction -- dropping it would be the same
   *  failure in the other direction. */
  it('keeps a measured direction on every bar that has a reading behind it', () => {
    for (const bar of barsFor(healthy).filter((entry) => entry.key !== 'schedule')) {
      expect(['rising', 'flat', 'falling']).toContain(bar.trend)
    }
  })

  // §1.2, and the single most important assertion in this file. Most trackers would
  // count a quiet social life as healthy; flagging it is what proves the model
  // understands burnout rather than summing hours.
  it('flags low social as a warning rather than as a good score', () => {
    const social = barsFor({ ...healthy, social: 10 }).find((bar) => bar.key === 'social')

    expect(social?.status).not.toBe('healthy')
    expect(social?.warning).toMatch(/alone/i)
  })

  it('does not flag a healthy social reserve', () => {
    const social = barsFor(healthy).find((bar) => bar.key === 'social')

    expect(social?.status).toBe('healthy')
    expect(social?.warning).toBeNull()
  })

  it('flags a drained mental reserve as critical', () => {
    const mental = barsFor({ ...healthy, mental: 8 }).find((bar) => bar.key === 'mental')

    expect(mental?.status).toBe('critical')
  })

  it('labels every bar in words a student would use, not field names', () => {
    for (const bar of barsFor(healthy)) {
      expect(bar.label.length).toBeGreaterThan(0)
      expect(bar.label).not.toBe(bar.key)
    }
  })
})

/**
 * §1.5: a trend is a measurement, and a bar that has none must not claim one.
 *
 * The four reserve bars read their arrow off the last three days of the projection. The
 * density bar has no such reading -- nothing projects how packed a future day will be -- and
 * it used to carry `trend: 'flat'` anyway, which rendered a "steady" glyph and, worse, told
 * a screen reader `aria-label="steady"`. That is a claim nobody made, in the one view §1.5
 * calls a primary surface rather than a fallback.
 */
describe('a bar with nothing measuring its direction', () => {
  it('says it has no trend rather than claiming it is steady', () => {
    const density = barsFor(healthy).find((bar) => bar.key === 'schedule')

    expect(density?.trend).toBeNull()
  })

  it('leaves the measured bars measuring', () => {
    for (const bar of barsFor(healthy).filter((entry) => entry.key !== 'schedule')) {
      expect(bar.trend).not.toBeNull()
    }
  })
})
