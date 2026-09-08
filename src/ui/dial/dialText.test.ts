import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PARAMS,
  HORIZON_DAYS,
  project,
  type DayInput,
  type Reserves,
} from '../../engine'
import { describeDial } from './dialText'
import { domainBars } from './domainBars'

const healthy: Reserves = { mental: 80, physical: 80, social: 80, errands: 80 }

const days = (): DayInput[] =>
  Array.from({ length: HORIZON_DAYS }, (_, dayIndex) => ({
    dayIndex,
    activities: [],
    sleepHours: 7,
    venueChanges: 0,
    daysToNearestDeadline: null,
    checkedIn: true,
  }))

const textFor = (reserves: Reserves, capacity = 75): string => {
  const projection = project(reserves, days(), DEFAULT_PARAMS)
  return describeDial(capacity, domainBars(reserves, projection, days()), projection)
}

describe('describeDial', () => {
  // §1.5: a full text equivalent of every dial value, and a primary view -- what a
  // screen reader user gets and what low-energy mode leans on -- not a fallback.
  it('states the headline capacity', () => {
    expect(textFor(healthy)).toContain('75')
  })

  it('names every domain', () => {
    const text = textFor(healthy)

    for (const label of ['Study', 'Body', 'People', 'Life admin', 'packed']) {
      expect(text).toContain(label)
    }
  })

  // An arrow character read aloud by a screen reader is noise, so directions become
  // words here.
  it('says which way each domain is moving, in words rather than glyphs', () => {
    expect(textFor(healthy)).toMatch(/steady|rising|falling/i)
    expect(textFor(healthy)).not.toMatch(/[▲▬▼]/)
  })

  it('speaks the social warning aloud', () => {
    expect(textFor({ ...healthy, social: 10 })).toMatch(/alone/i)
  })

  it('reads as prose rather than a data dump', () => {
    const text = textFor(healthy)

    expect(text).toMatch(/\.$/)
    expect(text).not.toContain('{')
    expect(text).not.toContain('undefined')
  })
})
