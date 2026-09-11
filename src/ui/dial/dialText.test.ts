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

/**
 * §1.5 again, and this is the surface where it matters most: for a screen reader user this
 * text IS the dial. A trend word invented for a bar nothing measured is indistinguishable
 * from a real reading.
 */
describe('a bar with no measured direction, in words', () => {
  const withDensity = (trend: 'flat' | null): string =>
    describeDial(
      75,
      [
        {
          key: 'schedule',
          label: 'How packed the days are',
          value: 72,
          ceiling: 100,
          status: 'stretched',
          span: 'horizon',
          trend,
          warning: null,
        },
      ],
      project(healthy, days(), DEFAULT_PARAMS),
    )

  it('states the value without claiming a direction', () => {
    const text = withDensity(null)

    expect(text).toContain('How packed the days are: 72 out of 100.')
    expect(text).not.toMatch(/steady/i)
  })

  /** The mutation guard: the old wording is what this replaces, so it has to be reachable
   *  when a trend really is present. */
  it('still says the direction when there is one', () => {
    expect(withDensity('flat')).toMatch(/steady/i)
  })
})

/**
 * §1.5: the text equivalent carries everything the graphic carries, and the graphic now
 * says which stretch of time each group of bars covers. A screen reader user hearing
 * "People 32" and "How packed the days are 76" in one list, with nothing separating a
 * snapshot from a fortnight, is being given the harder version of the same puzzle.
 */
describe('the stretch of time, in words', () => {
  const barsOf = () => domainBars(healthy, project(healthy, days(), DEFAULT_PARAMS), days())

  it('says the headline is where today started, not where the week is', () => {
    const text = describeDial(67, barsOf(), project(healthy, days(), DEFAULT_PARAMS))

    expect(text).toMatch(/started today|today started/i)
    expect(text).not.toMatch(/this week/i)
  })

  it('names the horizon the density bar actually measures', () => {
    const text = describeDial(67, barsOf(), project(healthy, days(), DEFAULT_PARAMS))

    expect(text).toMatch(/21 days/i)
  })

  /** Once per group, for the same reason the drawing says it once: four repetitions of one
   *  reading is noise read aloud as much as it is on screen. */
  it('says each stretch once', () => {
    const text = describeDial(67, barsOf(), project(healthy, days(), DEFAULT_PARAMS))

    expect(text.match(/Where today started/gi) ?? []).toHaveLength(1)
  })
})
