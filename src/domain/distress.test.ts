import { describe, expect, it } from 'vitest'
import type { EnergyPoint } from './energyHistory'
import { DISTRESS_AT_OR_BELOW, DISTRESS_RUN, isDistressed } from './distress'

const points = (...values: number[]): EnergyPoint[] =>
  values.map((value, index) => ({ date: `2026-09-${String(index + 1).padStart(2, '0')}`, value }))

const low = () => DISTRESS_AT_OR_BELOW
const flat = () => DISTRESS_AT_OR_BELOW + 40

/**
 * The case the app has no other answer for.
 *
 * Everything else here treats a bad fortnight as a scheduling problem: move a block, take a
 * rest, decline a request. That is the right model for somebody overloaded, and the wrong
 * one for somebody unwell -- and the app cannot tell the difference from a schedule, because
 * the schedule looks identical either way.
 *
 * What it can tell is that the student has said, repeatedly and in their own words, that
 * they are at the bottom. Read off `reported` energy rather than modelled reserves on
 * purpose: reserves are the app's own guess, and a claim this serious should rest on what
 * the person actually said.
 */
describe('isDistressed', () => {
  it('says nothing about a student who is doing fine', () => {
    expect(isDistressed(points(flat(), flat(), flat(), flat()))).toBe(false)
  })

  /** One rough day is a rough day. Everybody has them, and treating one as a signal would
   *  make this fire constantly -- which would make it mean nothing. */
  it('says nothing about a single bad day', () => {
    expect(isDistressed(points(flat(), flat(), low(), flat()))).toBe(false)
  })

  it('says nothing about a run that is still shorter than the threshold', () => {
    const nearly = Array.from({ length: DISTRESS_RUN - 1 }, () => low())

    expect(isDistressed(points(flat(), ...nearly))).toBe(false)
  })

  it('recognises a sustained run at the bottom', () => {
    const run = Array.from({ length: DISTRESS_RUN }, () => low())

    expect(isDistressed(points(flat(), ...run))).toBe(true)
  })

  /**
   * The run has to be current. A student who had a terrible fortnight in September and has
   * been fine since does not need to be handed a crisis message in October -- that is the
   * app failing to notice they got better.
   */
  it('does not hold an old bad patch against a student who has recovered', () => {
    const run = Array.from({ length: DISTRESS_RUN }, () => low())

    expect(isDistressed(points(...run, flat(), flat()))).toBe(false)
  })

  /** A single good day inside a long run is not recovery, but it does break the run -- and
   *  erring toward not-firing is the right direction for a message this heavy. */
  it('treats a break in the run as a break', () => {
    const run = Array.from({ length: DISTRESS_RUN - 1 }, () => low())

    expect(isDistressed(points(...run, flat(), low()))).toBe(false)
  })

  it('reads the boundary as included', () => {
    const run = Array.from({ length: DISTRESS_RUN }, () => DISTRESS_AT_OR_BELOW)

    expect(isDistressed(points(...run))).toBe(true)
  })

  /**
   * "In a row" means in a row, which the card says out loud to the student.
   *
   * `energyHistory` keeps only the days that were answered, so four low answers spread over
   * two weeks -- with silence in between -- arrived here looking exactly like four
   * consecutive low days. The card then told somebody they had said they were running low
   * four days in a row when they had not, and a message this heavy has to be true in the
   * words it uses.
   *
   * Erring toward not firing is the right direction here, as it is for a break in the run:
   * a student who skipped three days has not given the app enough to make this claim about
   * them.
   */
  it('does not read four scattered answers as four days in a row', () => {
    const scattered: EnergyPoint[] = [
      { date: '2026-09-01', value: low() },
      { date: '2026-09-05', value: low() },
      { date: '2026-09-06', value: low() },
      { date: '2026-09-07', value: low() },
    ]

    expect(isDistressed(scattered)).toBe(false)
  })

  /** The run itself is what must be unbroken. Silence before it is just a student who had
   *  not started answering yet, and holding that against them would mean never firing for
   *  anybody who came to the app late. */
  it('fires on a real run even when the days before it were skipped', () => {
    const real: EnergyPoint[] = [
      { date: '2026-09-01', value: low() },
      { date: '2026-09-10', value: low() },
      { date: '2026-09-11', value: low() },
      { date: '2026-09-12', value: low() },
      { date: '2026-09-13', value: low() },
    ]

    expect(isDistressed(real)).toBe(true)
  })

  it('says nothing at all about a student who has never answered', () => {
    expect(isDistressed([])).toBe(false)
  })
})
