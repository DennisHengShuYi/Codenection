import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { freeSlotOn, prescribe } from './prescribe'

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

/** A block whose only purpose is to occupy a stretch of the day in a gap test. */
const block = item

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

describe('freeSlotOn', () => {
  it('reports a usable slot when the day is empty', () => {
    expect(freeSlotOn(week(), 0)?.hours).toBeGreaterThan(0)
  })

  it('shrinks as the day fills up', () => {
    const busy = week({ items: [item({ hours: 6 }), item({ id: 'b', hours: 6, startHour: 16 })] })

    expect(freeSlotOn(busy, 0)?.hours).toBeLessThan(freeSlotOn(week(), 0)?.hours ?? 0)
  })

  it('never reports a negative-size slot on an overfull day', () => {
    const slot = freeSlotOn(week({ items: [block({ startHour: 0, hours: 24 })] }), 0)

    expect(slot === null || slot.hours >= 0).toBe(true)
  })

  it('places the slot where the gap actually is, not always at 16:00', () => {
    const busyAfternoon = week({ items: [block({ startHour: 15, hours: 4 })] })

    // Not midnight, and not the old hardcoded 16:00 either -- the real free stretch of the
    // student's day starts at the wake hour, since nothing occupies the morning.
    expect(freeSlotOn(busyAfternoon, 0)).toEqual({ startHour: 8, hours: 7 })
  })

  it('never anchors a free slot before the wake hour, even for an ordinary early class', () => {
    // A completely ordinary fixture: one class at 8-10. The scan must not report the
    // midnight-to-8 stretch as free -- nobody is awake for it, and sleepByDay already
    // accounts for it.
    const earlyClass = week({ items: [block({ startHour: 8, hours: 2 })] })

    expect(freeSlotOn(earlyClass, 0)?.startHour).toBeGreaterThanOrEqual(8)
  })

  it('reports no slot when the day has no free hour', () => {
    expect(freeSlotOn(week({ items: [block({ startHour: 0, hours: 24 })] }), 0)).toBeNull()
  })

  it('finds the free hour after the last block when the day starts busy', () => {
    const busyMorning = week({ items: [block({ startHour: 0, hours: 10 })] })

    expect(freeSlotOn(busyMorning, 0)).toEqual({ startHour: 10, hours: 14 })
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
    const packedDay = week({ start: low('mental'), items: [item({ startHour: 0, hours: 24 })] })

    expect(prescribe(packedDay)).toBeNull()
  })

  /**
   * `ADVICE` has no entry for errands on purpose (see the comment above it), but the old
   * implementation let that absence suppress advice for the *next* lowest reserve too --
   * a student whose errands reserve happened to be emptiest got no card at all, even though
   * mental was also below threshold and has real advice.
   */
  it('falls through when the emptiest reserve has no advice of its own', () => {
    const flat = week({ start: { mental: 25, physical: 70, social: 70, errands: 22 } })

    expect(prescribe(flat)?.kind).toBe('rest')
  })

  /**
   * The gate asks whether there is a free hour today; the old insert was hardcoded to 16:00
   * regardless of where that hour actually was, so the card could land on top of a class.
   */
  it('schedules into the gap it found rather than always at 16:00', () => {
    const busyAfternoon = week({ start: low('mental'), items: [item({ startHour: 15, hours: 4 })] })

    expect(prescribe(busyAfternoon)?.startHour).not.toBe(16)
  })

  it('offers nothing when the day has no free hour', () => {
    const packedDay = week({ start: low('mental'), items: [item({ startHour: 0, hours: 24 })] })

    expect(prescribe(packedDay)).toBeNull()
  })

  it('places it on a real day within the horizon', () => {
    const out = prescribe(week({ start: low('social') }))

    expect(out?.dayIndex).toBeGreaterThanOrEqual(0)
    expect(out?.dayIndex).toBeLessThan(HORIZON_DAYS)
  })
})
