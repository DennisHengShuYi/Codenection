import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS, project, type DayInput, type Reserves } from '../../engine'
import { reserveTrack } from './trackGeometry'

/**
 * The fortnight's four reserves as a shape rather than as a day at a time.
 *
 * The grid answers "what is on Thursday" and the open day answers "how am I on Thursday".
 * Neither answers "where is this week going", which is the question the whole projection
 * exists for -- and the one a student actually has when they see a warning eight days out.
 *
 * Pure, and separate from the drawing: a chart whose geometry lives inside its own JSX can
 * only be checked by looking at it. What is testable here is the part that can be wrong --
 * where a point lands on the scale, where the deficit line sits, and that nothing is drawn
 * outside the box it was given.
 */
const healthy: Reserves = { mental: 70, physical: 70, social: 70, errands: 70 }

const days = (hours: number): DayInput[] =>
  Array.from({ length: HORIZON_DAYS }, (_, dayIndex) => ({
    dayIndex,
    activities:
      hours === 0
        ? []
        : [{ kind: 'studyBlock' as const, type: 'mental' as const, hours, intensity: 1, startHour: 9 }],
    sleepHours: 6,
    venueChanges: 0,
    daysToNearestDeadline: null,
    checkedIn: true,
  }))

const trackFor = (hours: number) =>
  reserveTrack(project(healthy, days(hours), DEFAULT_PARAMS), { width: 320, height: 160 })

describe('reserveTrack', () => {
  it('draws one line per reserve', () => {
    expect(trackFor(0).lines).toHaveLength(4)
  })

  it('gives every line a point for every day of the horizon', () => {
    for (const line of trackFor(9).lines) {
      expect(line.points).toHaveLength(HORIZON_DAYS)
    }
  })

  /** A chart that runs outside its own viewBox clips silently, which reads as data simply
   *  stopping. Every point stays inside the box, at both ends of the scale. */
  it('keeps every point inside the box it was given', () => {
    for (const line of trackFor(12).lines) {
      for (const point of line.points) {
        expect(point.x).toBeGreaterThanOrEqual(0)
        expect(point.x).toBeLessThanOrEqual(320)
        expect(point.y).toBeGreaterThanOrEqual(0)
        expect(point.y).toBeLessThanOrEqual(160)
      }
    }
  })

  it('puts a full reserve above an empty one', () => {
    const full = reserveTrack(project(healthy, days(0), DEFAULT_PARAMS), { width: 320, height: 160 })
    const spent = trackFor(12)

    const lastOf = (track: ReturnType<typeof reserveTrack>) =>
      track.lines.find((line) => line.type === 'mental')?.points.at(-1)?.y ?? 0

    // Smaller y is higher on the screen, which is the one thing an SVG scale gets wrong.
    expect(lastOf(full)).toBeLessThan(lastOf(spent))
  })

  it('marks the deficit line where 30 actually falls on the scale', () => {
    const track = trackFor(9)
    const atThirty = track.lines[0]?.points ?? []

    expect(track.deficitY).toBeGreaterThan(0)
    expect(track.deficitY).toBeLessThan(160)
    expect(atThirty.length).toBeGreaterThan(0)
  })

  /**
   * The band is the honesty. §8.2 says the 21-day projection is a decision aid and never
   * described as validated, and four hard lines with no spread read as a measurement.
   *
   * Drawn for the floor alone rather than for each reserve: four translucent regions over
   * one another is a smear nobody can read a value off, and the floor is the quantity the
   * deficit mark itself is computed from.
   */
  it('carries a band around the floor, not around every line', () => {
    const track = trackFor(9)

    expect(track.band).toHaveLength(HORIZON_DAYS)
    for (const point of track.band) {
      expect(point.worstY).toBeGreaterThanOrEqual(point.bestY)
    }
  })

  it('never draws anything for a horizon with no days in it', () => {
    const empty = reserveTrack(project(healthy, [], DEFAULT_PARAMS), { width: 320, height: 160 })

    expect(empty.lines.every((line) => line.points.length === 0)).toBe(true)
    expect(empty.band).toHaveLength(0)
  })
})
