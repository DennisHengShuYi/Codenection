import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { freeGapOn, prescribe } from './prescribe'

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'a',
  title: 'Study',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 0,
  startHour: 10,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const low = (type: 'mental' | 'physical' | 'social') => ({
  mental: type === 'mental' ? 15 : 70,
  physical: type === 'physical' ? 15 : 70,
  social: type === 'social' ? 15 : 70,
  errands: 70,
})

describe('freeGapOn', () => {
  it('reports a usable gap when the day is empty', () => {
    expect(freeGapOn(week(), 0)).toBeGreaterThan(0)
  })

  it('shrinks as the day fills up', () => {
    const busy = week({ items: [item({ hours: 6 }), item({ id: 'b', hours: 6, startHour: 16 })] })

    expect(freeGapOn(busy, 0)).toBeLessThan(freeGapOn(week(), 0))
  })

  it('never reports a negative gap on an overfull day', () => {
    expect(freeGapOn(week({ items: [item({ hours: 30 })] }), 0)).toBeGreaterThanOrEqual(0)
  })
})

describe('prescribe', () => {
  /**
   * Silence is a real answer. Advice offered to someone who is fine is advice ignored when
   * they are not.
   */
  it('says nothing when nothing is low', () => {
    expect(prescribe(week())).toBeNull()
  })

  /**
   * §5.2's matching, which is the point of the unit. The engine already refuses to let sleep
   * cure loneliness; this is that same conviction pointed at the advice instead of the maths.
   */
  it('prescribes a person when social is low', () => {
    const out = prescribe(week({ start: low('social') }))

    expect(out?.type).toBe('social')
    expect(out?.kind).toBe('socialRestorative')
    expect(out?.title).toMatch(/someone|person|friend/i)
  })

  it('prescribes movement when physical is low', () => {
    const out = prescribe(week({ start: low('physical') }))

    expect(out?.type).toBe('physical')
    expect(out?.title).toMatch(/walk|move|outside/i)
  })

  /**
   * §5.2: "actual downtime, not a different screen". An app suggesting more app is the exact
   * failure this guards against.
   *
   * The check is for a suggestion to *use* something, rather than for the word "screen" at
   * all -- the first version of this test failed on the copy "no screen", which is the
   * advice being asked for rather than a violation of it. A regex that cannot tell "avoid a
   * screen" from "look at a screen" is not testing the thing it claims to.
   */
  it('prescribes real downtime when mental is low, not another screen', () => {
    const out = prescribe(week({ start: low('mental') }))

    expect(out?.type).toBe('mental')
    expect(out?.kind).toBe('rest')
    expect(out?.title).not.toMatch(/watch|browse|scroll|open the app|check your/i)
  })

  // The positive half: it does not merely avoid suggesting a screen, it says to put it down.
  it('tells a depleted student to get off the screen rather than leaving it ambiguous', () => {
    expect(prescribe(week({ start: low('mental') }))?.title).toMatch(/no screen|off.*screen/i)
  })

  it('answers the lowest reserve when more than one is low', () => {
    expect(prescribe(week({ start: { mental: 12, physical: 18, social: 19, errands: 70 } }))?.type).toBe(
      'mental',
    )
  })

  /**
   * §5.2: one option only. Asserted even though the return type already forbids a list --
   * the type is the guarantee, this test is what explains why it is shaped that way.
   */
  it('returns exactly one thing, never a list', () => {
    const out = prescribe(week({ start: low('social') }))

    expect(Array.isArray(out)).toBe(false)
    expect(out).not.toBeNull()
  })

  it('sizes the suggestion to the gap that actually exists', () => {
    const roomy = prescribe(week({ start: low('physical') }))
    const packed = prescribe(week({ start: low('physical'), items: [item({ hours: 14 })] }))

    expect(packed?.hours).toBeLessThanOrEqual(roomy?.hours ?? 0)
  })

  /**
   * Past three hours `recoveryForDay` credits nothing, so a longer block would promise
   * recovery the model refuses to pay out.
   */
  it('never suggests a block longer than the engine will credit', () => {
    expect(prescribe(week({ start: low('mental') }))?.hours).toBeLessThanOrEqual(3)
  })

  it('says nothing when there is no real gap to put it in', () => {
    expect(prescribe(week({ start: low('mental'), items: [item({ hours: 24 })] }))).toBeNull()
  })

  it('places it on a real day within the horizon', () => {
    const out = prescribe(week({ start: low('social') }))

    expect(out?.dayIndex).toBeGreaterThanOrEqual(0)
    expect(out?.dayIndex).toBeLessThan(HORIZON_DAYS)
  })
})
