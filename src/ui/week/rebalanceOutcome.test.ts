import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { runRebalance } from './rebalanceOutcome'

const SEED = 20260908
const LAST_DAY = HORIZON_DAYS - 1

const week = (items: ScheduledItem[], over: Partial<Schedule> = {}): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const restBlock = (dayIndex: number): ScheduledItem => ({
  id: `rest-${dayIndex}`,
  title: 'Rest',
  type: 'mental',
  kind: 'rest',
  hours: 2,
  intensity: 1,
  dayIndex,
  startHour: 20,
  fixed: true,
  deadlineDay: null,
  protectedRest: true,
})

const socialBlock = (dayIndex: number): ScheduledItem => ({
  id: `social-${dayIndex}`,
  title: 'Seeing someone',
  type: 'social',
  kind: 'socialRestorative',
  hours: 2,
  intensity: 1,
  dayIndex,
  startHour: 18,
  fixed: true,
  deadlineDay: null,
  protectedRest: false,
})

const heavyBlock = (id: string, dayIndex: number, hours: number, intensity: number): ScheduledItem => ({
  id,
  title: id,
  type: 'mental',
  kind: 'studyBlock',
  hours,
  intensity,
  dayIndex,
  startHour: 9,
  fixed: true,
  deadlineDay: null,
  protectedRest: false,
})

/**
 * A week the hill climb genuinely cannot improve, but that `smallestFixes` can still say
 * something about.
 *
 * The brief's own sketch -- every item `fixed: true` -- turned out not to exercise this
 * path (see task-6b-report.md "finding on the all-fixed week"): with every day open,
 * `neighbours` can still always insert a rest block or a social visit, and on an otherwise
 * empty fortnight that insertion is a real improvement, so `rebalance` finds something and
 * `runRebalance` never reaches the fallback branch at all.
 *
 * This schedule closes every one of those doors deliberately:
 *  - Days 0..18 are saturated with a fixed fortnight-long study load plus a fixed rest and
 *    social block each, so no insertion or reshuffle anywhere in the bulk of the horizon
 *    can help (they are already occupied) and the fortnight is genuinely deep in deficit.
 *  - Only one item is movable: `m`, alone (with its own fixed rest block) on day 19, able
 *    to shift to day 20 -- day 20 also carries one fixed block and its own fixed rest, so
 *    nothing can be inserted there either.
 *  - `m`'s only possible move -- day 19 to day 20 -- adds a second working block to day 20,
 *    which costs a fragmentation penalty (§2.1's objective, `FRAGMENTATION_WEIGHT`) big
 *    enough to make the move a net *loss* by the hill climb's own score, so `rebalance`
 *    takes nothing. But `smallestFixes` ranks by the reserve floor and deficit days
 *    directly (see `smallestFix.ts`) rather than by that score, and by that measure the
 *    move is still a real, if small, improvement -- so it is exactly the "smallest fix"
 *    the search is meant to surface once the bigger reshuffle has nothing to offer.
 */
const stuckButFixableWeek = (): Schedule => {
  const items: ScheduledItem[] = []

  for (let day = 0; day < LAST_DAY - 1; day += 1) {
    items.push(restBlock(day), socialBlock(day), heavyBlock(`h${day}`, day, 8, 2))
  }

  const m: ScheduledItem = {
    id: 'm',
    title: 'm',
    type: 'mental',
    kind: 'studyBlock',
    hours: 2,
    intensity: 1,
    dayIndex: LAST_DAY - 1,
    // Already positioned after that day's rest block, so the search's within-day reorder
    // move is a no-op here and only the day-to-day shift is a live candidate.
    startHour: 22,
    fixed: false,
    deadlineDay: LAST_DAY,
    protectedRest: false,
  }

  items.push(restBlock(LAST_DAY - 1), m)
  items.push(restBlock(LAST_DAY), heavyBlock('hLast', LAST_DAY, 1, 1))

  return week(items, { start: { mental: 60, physical: 60, social: 60, errands: 60 } })
}

/**
 * One movable block, dropped somewhere a wide-open horizon can plainly do better with, so
 * `rebalance` actually selects a move among multiple competing candidates.
 *
 * Used instead of an empty week for the reproducibility test below: on `week([])` at
 * default reserves, or on `stuckButFixableWeek()`, the search either takes an
 * essentially-forced path or takes nothing at all, so the seeded `rng()`'s scan offset
 * never has a real choice to make and a broken `Rng` would go undetected (see the report's
 * "reproducibility test proves nothing" fix for the RED evidence that this schedule does
 * not have that problem).
 */
const improvableWeek = (): Schedule =>
  week(
    [
      {
        id: 'essay',
        title: 'essay',
        type: 'mental',
        kind: 'studyBlock',
        hours: 6,
        intensity: 2,
        dayIndex: 10,
        startHour: 9,
        fixed: false,
        deadlineDay: null,
        protectedRest: false,
      },
    ],
    { start: { mental: 40, physical: 40, social: 40, errands: 40 } },
  )

describe('runRebalance', () => {
  it('always reports something, even when it changed nothing', () => {
    const outcome = runRebalance(week([]), DEFAULT_PARAMS, SEED)

    expect(outcome.report.length).toBeGreaterThan(0)
  })

  it('offers no fallback for a week that does not need one', () => {
    expect(runRebalance(week([]), DEFAULT_PARAMS, SEED).fallback).toBeNull()
  })

  it('offers the single best remaining move when it cannot improve a struggling week', () => {
    const outcome = runRebalance(stuckButFixableWeek(), DEFAULT_PARAMS, SEED)

    expect(outcome.fallback).not.toBeNull()
  })

  it('offers no fallback when the solver already found something to do', () => {
    // The fallback must not second-guess a real improvement `rebalance` itself found.
    const outcome = runRebalance(improvableWeek(), DEFAULT_PARAMS, SEED)

    expect(outcome.fallback).toBeNull()
  })

  it('is reproducible, so the student does not see a different answer each render', () => {
    // `improvableWeek` (not an empty week) so the search actually chooses among several
    // competing candidates and the seed has a real chance to matter -- see this file's
    // module doc on `improvableWeek` and task-6b-report.md's "reproducibility test proves
    // nothing" fix for why an empty week does not exercise this.
    const first = runRebalance(improvableWeek(), DEFAULT_PARAMS, SEED)
    const second = runRebalance(improvableWeek(), DEFAULT_PARAMS, SEED)

    expect(first.report).toBe(second.report)
  })
})
