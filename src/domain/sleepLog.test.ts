import { describe, expect, it } from 'vitest'
import { answeredDays, recordNight, reportedNights, reportedOn, type SleepNight } from './sleepLog'

const night = (isoDate: string, hours: number, answeredAt = 1): SleepNight => ({
  isoDate,
  hours,
  answeredAt,
})

describe('recordNight', () => {
  it('adds a night the log has never seen', () => {
    expect(recordNight([], night('2026-09-12', 6))).toEqual([night('2026-09-12', 6)])
  })

  /**
   * Answering twice corrects the first answer rather than stacking a second, the property
   * `recordBlockAnswer` states for blocks. Two records for one night would double-count it in
   * every average taken over the log, which is the whole downstream use.
   */
  it('corrects a night already answered rather than stacking', () => {
    const log = recordNight([night('2026-09-12', 6, 1)], night('2026-09-12', 8, 2))

    expect(log).toEqual([night('2026-09-12', 8, 2)])
  })

  it('leaves other nights alone', () => {
    const log = recordNight([night('2026-09-11', 5)], night('2026-09-12', 8))

    expect(log).toHaveLength(2)
    expect(reportedOn(log, '2026-09-11')).toBe(5)
  })

  it('does not write into the log it was given', () => {
    const before: readonly SleepNight[] = [night('2026-09-11', 5)]
    recordNight(before, night('2026-09-12', 8))

    expect(before).toHaveLength(1)
  })
})

describe('reportedOn', () => {
  it('is null for a night nobody answered, which is the whole point of this module', () => {
    expect(reportedOn([], '2026-09-12')).toBeNull()
  })

  /**
   * The defect this module exists to fix. The reported figure here is deliberately the SAME
   * number the app would have assumed anyway -- `DEFAULT_SLEEP_HOURS` is 8 -- because that is
   * the exact pair `sleepByDay` alone could not distinguish. A case using 6 against a default
   * of 8 would pass even against code that just read the week and learned nothing.
   */
  it('distinguishes a reported figure from an identical default', () => {
    expect(reportedOn([night('2026-09-12', 8)], '2026-09-12')).toBe(8)
    expect(reportedOn([night('2026-09-12', 8)], '2026-09-13')).toBeNull()
  })
})

describe('reportedNights', () => {
  /** An average does not care about order but a trend does, and the bed row draws one. */
  it('returns the hours in night order, not in answer order', () => {
    const log = [night('2026-09-12', 6, 2), night('2026-09-10', 5, 1)]

    expect(reportedNights(log)).toEqual([5, 6])
  })

  it('is empty for an empty log', () => {
    expect(reportedNights([])).toEqual([])
  })
})

describe('answeredDays', () => {
  it('maps a log onto a run of dates, leaving unanswered nights as gaps', () => {
    const log = [night('2026-09-12', 6)]

    expect(answeredDays(log, ['2026-09-11', '2026-09-12', '2026-09-13'])).toEqual([null, 6, null])
  })
})
