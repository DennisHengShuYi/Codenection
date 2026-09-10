import { describe, expect, it } from 'vitest'
import type { ParsedItem, ParseOutcome } from '../ai'
import { MAX_ITEMS } from '../ai'
import { addItems } from '../domain/addItems'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { resolveConfirmation, summarise, type PendingDump } from './brainDump'

const week = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const parsed = (title: string): ParsedItem => ({
  id: `id-${title}`,
  title,
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  deadlineDay: null,
  fixed: false,
  confident: true,
})

const outcome = (items: readonly ParsedItem[], source: 'model' | 'fallback' = 'model'): ParseOutcome => ({
  items,
  source,
})

const pending = (over: Partial<PendingDump> = {}): PendingDump => ({
  id: 'dump-1',
  items: [parsed('essay'), parsed('gym')],
  answeredAt: null,
  ...over,
})

describe('summarise', () => {
  it('lists everything it understood, to be confirmed', () => {
    const reply = summarise('dump-1', outcome([parsed('essay'), parsed('gym')]))

    expect(reply.text).toContain('essay')
    expect(reply.text).toContain('gym')
    expect(reply.buttons).toBeDefined()
  })

  it('says so plainly when it understood nothing, and offers nothing to press', () => {
    const reply = summarise('dump-1', outcome([]))

    expect(reply.buttons).toBeUndefined()
    expect(reply.text.length).toBeGreaterThan(0)
  })

  /**
   * The chat must not be a way around a limit the app enforces. §3.1's parser caps what one
   * dump may produce, and arriving through Telegram does not raise that cap.
   */
  it('caps a dump at the same number of items the app allows', () => {
    const many = Array.from({ length: MAX_ITEMS + 10 }, (_, index) => parsed(`task-${index}`))

    const reply = summarise('dump-1', outcome(many))

    expect(reply.text).not.toContain(`task-${MAX_ITEMS + 5}`)
  })

  // The rule-based parser answering instead of the model is an ordinary state, not a
  // failure, and the student is not told the difference -- the app does not tell them either.
  it('reads the same whether the model or the fallback parsed it', () => {
    const fromModel = summarise('dump-1', outcome([parsed('essay')], 'model'))
    const fromRules = summarise('dump-1', outcome([parsed('essay')], 'fallback'))

    expect(fromRules.text).toBe(fromModel.text)
  })
})

describe('resolveConfirmation', () => {
  it('adds exactly the items that were shown', () => {
    const result = resolveConfirmation(pending(), true, week(), 1000)

    expect(result.kind).toBe('applied')
    expect(result.kind === 'applied' && result.week.items).toHaveLength(2)
  })

  // Read before written: confirming adds to the week that is there rather than replacing
  // it. The starting week is built through addItems itself, so this cannot drift from the
  // shape the application actually stores.
  it('keeps what was already in the week', () => {
    const withOne = addItems(week(), [parsed('already there')])

    const result = resolveConfirmation(pending(), true, withOne, 1000)

    expect(result.kind === 'applied' && result.week.items).toHaveLength(3)
  })

  it('writes nothing when the student discards it', () => {
    const result = resolveConfirmation(pending(), false, week(), 1000)

    expect(result.kind).toBe('discarded')
  })

  /**
   * Telegram re-sends an update it was not told about quickly enough, and a student can
   * press a button twice. Either would otherwise double a week.
   */
  it('applies a confirmation that arrives twice only once', () => {
    const already = pending({ answeredAt: 500 })

    const result = resolveConfirmation(already, true, week(), 1000)

    expect(result.kind).toBe('already')
  })

  // Refused rather than applied to whatever happens to be current: a stale button must not
  // reach into a week it was never shown.
  it('refuses a confirmation for a dump it does not know', () => {
    const result = resolveConfirmation(null, true, week(), 1000)

    expect(result.kind).toBe('unknown')
  })

  it('says something in every one of those cases', () => {
    const cases = [
      resolveConfirmation(pending(), true, week(), 1000),
      resolveConfirmation(pending(), false, week(), 1000),
      resolveConfirmation(pending({ answeredAt: 500 }), true, week(), 1000),
      resolveConfirmation(null, true, week(), 1000),
    ]

    for (const result of cases) expect(result.reply.text.length).toBeGreaterThan(0)
  })
})
