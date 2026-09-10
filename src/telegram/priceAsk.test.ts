import { describe, expect, it, vi } from 'vitest'
import type { ParsedItem } from '../ai'
import { outcomesFrom, type BlockRecord } from '../domain/blockLog'
import { paramsFor } from '../domain/engineParams'
import { priceRequest } from '../domain/requestCost'
import { DEFAULT_PARAMS, HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { priceAskWith, type AskModel } from './priceAsk'

/**
 * Ruling 41, the half that could not be tested while it lived inside `api/telegram.ts`.
 *
 * `/ask` and the app's request box are the same question asked through two doors, and they
 * gave two answers: the chat priced against day 0 of the fortnight whatever day it was,
 * with no check-in evidence and at the population calibration. `handle.test.ts` proves the
 * day and the log are threaded to the service; what only this level can prove is that the
 * service then uses them -- and that the calibration is the student's own, derived from the
 * same block log the app derives it from, rather than `DEFAULT_PARAMS`.
 */
const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: Array.from({ length: 10 }, (_, day) => ({
    id: `b${day}`,
    title: 'reading',
    type: 'mental' as const,
    kind: 'studyBlock' as const,
    hours: 8,
    intensity: 1,
    dayIndex: day,
    startHour: 9,
    fixed: false,
    deadlineDay: null,
    protectedRest: false,
  })),
  start: { mental: 60, physical: 60, social: 60, errands: 60 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const request = (): ParsedItem => ({
  id: 'r1',
  title: 'cover my shift',
  type: 'mental',
  kind: 'studyBlock',
  hours: 6,
  deadlineDay: 4,
  fixed: false,
  confident: true,
  repeat: null,
})

/** Every block answered "took longer", which is what moves `paramsFor` off the population
 *  defaults: §2.4's estimate bias is the whole reason calibration exists. */
const overrunLog = (days: number): BlockRecord[] =>
  Array.from({ length: days }, (_, day) => ({
    blockId: `b${day}`,
    type: 'mental' as const,
    plannedHours: 8,
    dayIndex: day,
    answer: 'longer' as const,
    answeredAt: day,
  }))

const model = (): AskModel => ({
  readRequest: vi.fn().mockResolvedValue(request()),
  draftReplies: vi.fn().mockResolvedValue({ drafts: [{ tone: 'decline', text: 'No.' }] }),
})

describe('priceAskWith', () => {
  it('says nothing could be read rather than pricing something invented', async () => {
    const unreadable: AskModel = { ...model(), readRequest: vi.fn().mockResolvedValue(null) }

    expect(await priceAskWith(unreadable, 'asdfghjkl', week(), 0, [])).toBeNull()
  })

  it('returns the cost and the drafts together', async () => {
    const priced = await priceAskWith(model(), 'cover my shift', week(), 0, [])

    expect(priced?.cost.eveningsEquivalent).toBeGreaterThanOrEqual(0)
    expect(priced?.drafts).toHaveLength(1)
  })

  // The day. A Thursday request priced as though it were Monday is a different price, and
  // it was the price `/ask` quoted for every request it ever answered.
  it('prices against the day given, not day 0', async () => {
    const onDayZero = await priceAskWith(model(), 'cover my shift', week(), 0, [])
    const onDayTen = await priceAskWith(model(), 'cover my shift', week(), 10, [])

    expect(onDayTen?.cost.floorBefore).not.toBe(onDayZero?.cost.floorBefore)
  })

  // The evidence. §6.5's missing-data pessimism only applies to days the student has gone
  // silent on, so a log the pricing ignores is a systematically rosier answer.
  it('prices against the check-in evidence, not an optimistic stand-in', async () => {
    const silent = await priceAskWith(model(), 'cover my shift', week(), 10, [])
    const answered = await priceAskWith(model(), 'cover my shift', week(), 10, overrunLog(10))

    expect(silent?.cost.floorBefore).not.toBe(answered?.cost.floorBefore)
  })

  /**
   * The calibration. The most easily missed of the three, because it is the one with no
   * argument to forget: it is derived rather than passed, so a version that never derived
   * it looks complete.
   *
   * Asserted against `priceRequest` called directly with the two candidate parameter sets,
   * so this pins WHICH calibration was used rather than merely that the number moved.
   */
  it('prices at the student own calibration, not the population defaults', async () => {
    const log = overrunLog(10)
    const priced = await priceAskWith(model(), 'cover my shift', week(), 10, log)

    const atPopulation = priceRequest(week(), request(), DEFAULT_PARAMS, 10, log)
    const atOwn = priceRequest(week(), request(), paramsFor(outcomesFrom(log)), 10, log)

    expect(atOwn.floorBefore).not.toBe(atPopulation.floorBefore)
    expect(priced?.cost.floorBefore).toBe(atOwn.floorBefore)
  })
})
