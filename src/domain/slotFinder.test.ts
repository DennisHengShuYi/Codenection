import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { DAY_END_HOUR, gapsOn, slotOn, WAKE_HOUR } from './slotFinder'

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'a',
  title: 'Block',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 0,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: ScheduledItem[] = []): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const need = (hours: number, over: Partial<Parameters<typeof slotOn>[2]> = {}) => ({
  hours,
  type: 'mental' as const,
  kind: 'studyBlock' as const,
  ...over,
})

describe('gapsOn', () => {
  it('reports the whole waking day when nothing is scheduled', () => {
    expect(gapsOn(week(), 0)).toEqual([{ startHour: WAKE_HOUR, hours: DAY_END_HOUR - WAKE_HOUR }])
  })

  it('reports the stretches either side of a block', () => {
    const gaps = gapsOn(week([item({ startHour: 10, hours: 2 })]), 0)

    expect(gaps).toEqual([
      { startHour: 8, hours: 2 },
      { startHour: 12, hours: 12 },
    ])
  })

  /** Anything outside the waking window is sleep, not an opening. A block running to 02:00
   *  must not make the small hours look free on either side of it. */
  it('clamps a block that runs outside the waking day', () => {
    const gaps = gapsOn(week([item({ startHour: 6, hours: 4 })]), 0)

    expect(gaps).toEqual([{ startHour: 10, hours: 14 }])
  })

  it('drops a sliver too short to schedule anything in', () => {
    const gaps = gapsOn(week([item({ startHour: 8.25, hours: 15.75 })]), 0)

    expect(gaps).toEqual([])
  })

  it('reads only the day it was asked about', () => {
    expect(gapsOn(week([item({ dayIndex: 3, startHour: 10, hours: 2 })]), 0)).toEqual([
      { startHour: WAKE_HOUR, hours: DAY_END_HOUR - WAKE_HOUR },
    ])
  })

  /** Overlapping movable blocks are legal (the optimizer deliberately does not treat them
   *  as a violation), so the walker must merge them rather than report a negative gap. */
  it('survives blocks that overlap each other', () => {
    const gaps = gapsOn(week([item({ startHour: 10, hours: 4 }), item({ id: 'b', startHour: 11, hours: 2 })]), 0)

    expect(gaps).toEqual([
      { startHour: 8, hours: 2 },
      { startHour: 14, hours: 10 },
    ])
  })
})

/**
 * One slot, never a list.
 *
 * A list here would become a solver neighbourhood, and §2.1's search is already at four
 * thousand evaluations on the crunch fixture. It is also §5.2's rule about menus applied to
 * the machinery: the app decides where something goes and says so, rather than offering the
 * student five places it could have gone.
 */
describe('slotOn', () => {
  it('finds room on an empty day', () => {
    const slot = slotOn(week(), 0, need(2))

    expect(slot?.hours).toBe(2)
    expect(slot?.startHour).toBeGreaterThanOrEqual(WAKE_HOUR)
    expect((slot?.startHour ?? 0) + 2).toBeLessThanOrEqual(DAY_END_HOUR)
  })

  it('skips a gap too small and takes the next one that fits', () => {
    const busy = week([item({ startHour: 9, hours: 1 }), item({ id: 'b', startHour: 11, hours: 1 })])

    expect(slotOn(busy, 0, need(3))?.startHour).toBe(12)
  })

  it('reports nothing when the day genuinely has no room', () => {
    expect(slotOn(week([item({ startHour: 8, hours: 16 })]), 0, need(2))).toBeNull()
  })

  it('never starts before the student is awake or runs past midnight', () => {
    const slot = slotOn(week(), 0, need(16))

    expect(slot?.startHour).toBe(WAKE_HOUR)
    expect((slot?.startHour ?? 0) + (slot?.hours ?? 0)).toBeLessThanOrEqual(DAY_END_HOUR)
  })

  /** Longer than a waking day fits nowhere, and clipping it would schedule a lie. */
  it('refuses a block longer than the day itself', () => {
    expect(slotOn(week(), 0, need(17))).toBeNull()
  })

  it('refuses a block of no length at all', () => {
    expect(slotOn(week(), 0, need(0))).toBeNull()
  })

  describe('where it leans when the whole day is open', () => {
    /** A rest block at 11am is one a student will not take. */
    it('puts rest late', () => {
      expect(slotOn(week(), 0, need(1, { kind: 'rest' }))?.startHour).toBe(20)
    })

    /** Evening, because that is when other people are free. */
    it('puts seeing people in the evening', () => {
      expect(slotOn(week(), 0, need(2, { type: 'social', kind: 'socialRestorative' }))?.startHour).toBe(18)
    })

    /** Where that student's own studying already sits, rather than a number this file
     *  chose for them. */
    it('puts study where the student already studies', () => {
      const clustered = week([
        item({ id: 'x', dayIndex: 1, startHour: 14, hours: 1 }),
        item({ id: 'y', dayIndex: 2, startHour: 14, hours: 1 }),
      ])

      expect(slotOn(clustered, 0, need(2))?.startHour).toBe(14)
    })

    it('batches an errand against the errands already on that day', () => {
      const errand = item({ id: 'e', type: 'errands', kind: 'errands', startHour: 15, hours: 1 })

      expect(slotOn(week([errand]), 0, need(1, { type: 'errands', kind: 'errands' }))?.startHour).toBe(16)
    })

    /** Nothing to lean on and no preference of its own: first thing that fits. */
    it('places physical work at the first opening', () => {
      expect(
        slotOn(week(), 0, need(1, { type: 'physical', kind: 'hardExercise' }))?.startHour,
      ).toBe(WAKE_HOUR)
    })
  })

  /** A preference is a lean, not a demand. When the preferred hour is taken the block still
   *  gets placed -- as near to it as the day actually allows. */
  it('gives up its preference rather than the placement', () => {
    const eveningFull = week([item({ startHour: 17, hours: 7 })])

    const slot = slotOn(eveningFull, 0, need(1, { kind: 'rest' }))

    expect(slot).not.toBeNull()
    expect(slot?.startHour).toBeLessThan(17)
  })

  it('does not modify the week it was given', () => {
    const before = week([item({ startHour: 10, hours: 2 })])
    const snapshot = JSON.stringify(before)

    slotOn(before, 0, need(2))

    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('answers the same way twice', () => {
    const busy = week([item({ startHour: 10, hours: 2 })])

    expect(slotOn(busy, 0, need(2))).toEqual(slotOn(busy, 0, need(2)))
  })
})
