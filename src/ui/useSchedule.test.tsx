import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type Repository, type Session } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { freshWeek } from '../domain/freshWeek'
import { SAVE_FAILED, useSchedule } from './useSchedule'

const item = (id: string): ScheduledItem => ({
  id,
  title: id,
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 3,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
})

const week = (id: string): Schedule => ({
  items: [item(id)],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const session: Session = { userId: 'student-1', email: 'student@example.edu' }

const only = (schedule: Schedule | null): string | null => schedule?.items[0]?.id ?? null

/**
 * A repository whose writes commit exactly when this test says so.
 *
 * Deliberately not a timing race with real delays. The defect being pinned down is that two
 * writes can be in flight at once and land in the wrong order, and a test that arranged that
 * with `setTimeout` would be asserting a scheduler's behaviour as much as the hook's. Here
 * each write parks on a gate until it is released by name, so "the older write lands last"
 * is stated outright rather than provoked.
 */
const gated = () => {
  const gates = new Map<string, () => void>()
  const started: string[] = []
  const committed: string[] = []
  let stored: Schedule | null = null

  const repository: Repository = {
    loadWeek: () => Promise.resolve(stored),
    saveWeek: (next) => {
      const id = only(next) ?? 'unknown'
      started.push(id)

      return new Promise<void>((resolve) => gates.set(id, resolve)).then(() => {
        stored = next
        committed.push(id)
      })
    },
    loadSettings: () => Promise.resolve(DEFAULT_SETTINGS),
    saveSettings: () => Promise.resolve(),
    loadBlockLog: () => Promise.resolve([]),
    recordBlockAnswer: () => Promise.resolve(),
    clear: () => Promise.resolve(),
  }

  return {
    repository,
    started,
    committed,
    stored: () => stored,
    /** Puts a week in the store without going through the gated write path. */
    seed: (next: Schedule) => {
      stored = next
    },
    release: async (id: string) => {
      await act(async () => {
        gates.get(id)?.()
        await Promise.resolve()
      })
    },
  }
}

const failing = (): Repository => ({
  loadWeek: () => Promise.resolve(null),
  saveWeek: () => Promise.reject(new Error('quota exceeded')),
  loadSettings: () => Promise.resolve(DEFAULT_SETTINGS),
  saveSettings: () => Promise.resolve(),
  loadBlockLog: () => Promise.resolve([]),
  recordBlockAnswer: () => Promise.resolve(),
  clear: () => Promise.resolve(),
})

describe('loading the week', () => {
  it('shows what was saved', async () => {
    const store = gated()
    store.seed(week('essay'))

    const { result } = renderHook(() => useSchedule(store.repository))

    await waitFor(() => expect(only(result.current.schedule)).toBe('essay'))
  })

  // §0's no-cold-start rule: a first run shows a real week rather than a blank state.
  it('falls back to the seeded fortnight when there is nothing saved', async () => {
    const { result } = renderHook(() => useSchedule(gated().repository))

    await waitFor(() => expect(result.current.schedule).not.toBeNull())
    expect(result.current.schedule?.items.length).toBeGreaterThan(0)
  })

  /**
   * CRITICAL, and the exact defect `useProfile.test.tsx` already pins down on the other
   * half of the seed: the fortnight was seeded on "nothing saved" alone, with no session
   * check. `useProfile` gates its own seed on `session === null` and says why -- "a real
   * signed-in account is a real student, not a preview" -- but the week did not, so a
   * student signing up got the crunch fixture's UM timetable, its three invented
   * assignments, and its 41/44/32/55 opening reserves presented as their own.
   */
  it('does not seed the demo fortnight for a real signed-in first run', async () => {
    const { result } = renderHook(() => useSchedule(gated().repository, session))

    await waitFor(() => expect(result.current.schedule).not.toBeNull())
    expect(result.current.schedule).toEqual(freshWeek())
  })
})

/**
 * The defect this file was written for.
 *
 * `setSchedule` does not await its write -- deliberately, so a slow save cannot block the
 * screen the student is looking at. But it also issued every write the moment it was asked,
 * so two edits in quick succession put two writes in flight at once, and whichever landed
 * last won. Against the local store that is a narrow window; against Supabase each write is
 * a network round trip, so an older week overwriting a newer one is an ordinary outcome
 * rather than an exotic one -- and editing, removing and adding a block by hand makes three
 * edits in a row the normal way to use the week.
 */
describe('two edits in quick succession', () => {
  it('leaves the newer week in storage, not the older one', async () => {
    const store = gated()
    const { result } = renderHook(() => useSchedule(store.repository))
    await waitFor(() => expect(result.current.schedule).not.toBeNull())

    act(() => result.current.setSchedule(week('first')))
    act(() => result.current.setSchedule(week('second')))

    // Released in the wrong order on purpose: the second edit's write is let go first, and
    // the first edit's a moment later. Nothing may make the first edit the winner.
    await store.release('second')
    await store.release('first')
    await store.release('second')

    await waitFor(() => expect(only(store.stored())).toBe('second'))
  })

  it('never has two writes in flight at once', async () => {
    const store = gated()
    const { result } = renderHook(() => useSchedule(store.repository))
    await waitFor(() => expect(result.current.schedule).not.toBeNull())

    act(() => result.current.setSchedule(week('first')))
    act(() => result.current.setSchedule(week('second')))

    expect(store.started).toEqual(['first'])

    await store.release('first')

    await waitFor(() => expect(store.started).toEqual(['first', 'second']))
  })

  /**
   * Three edits with one write in flight: the middle week is already superseded by the time
   * the store is free, so writing it would be a round trip whose result is thrown away --
   * and, against a network, one more moment in which a reload loses the newest edit.
   */
  it('skips a week that was superseded before it could be written', async () => {
    const store = gated()
    const { result } = renderHook(() => useSchedule(store.repository))
    await waitFor(() => expect(result.current.schedule).not.toBeNull())

    act(() => result.current.setSchedule(week('first')))
    act(() => result.current.setSchedule(week('middle')))
    act(() => result.current.setSchedule(week('last')))

    await store.release('first')
    await waitFor(() => expect(store.started).toEqual(['first', 'last']))

    await store.release('last')
    await waitFor(() => expect(only(store.stored())).toBe('last'))
    expect(store.committed).not.toContain('middle')
  })
})

/**
 * `useBlockLog` recorded the reasoning for why this hook could drop a failed write: "the
 * week is rewritten on the next change, so a lost save retries by itself." True of every
 * change except the last one -- and the last change is exactly the one a student makes
 * before closing the tab. So it is said out loud, as the project's own rule requires.
 */
describe('a write that does not land', () => {
  it('says so rather than dropping it', async () => {
    const repository = failing()
    const { result } = renderHook(() => useSchedule(repository))
    await waitFor(() => expect(result.current.schedule).not.toBeNull())

    act(() => result.current.setSchedule(week('essay')))

    await waitFor(() => expect(result.current.problem).toBe(SAVE_FAILED))
  })

  // Erasing the edit to be truthful about storage trades one lie for a worse one.
  it('leaves the change on screen', async () => {
    const repository = failing()
    const { result } = renderHook(() => useSchedule(repository))
    await waitFor(() => expect(result.current.schedule).not.toBeNull())

    act(() => result.current.setSchedule(week('essay')))

    await waitFor(() => expect(result.current.problem).toBe(SAVE_FAILED))
    expect(only(result.current.schedule)).toBe('essay')
  })

  it('says nothing while every write is landing', async () => {
    const store = gated()
    const { result } = renderHook(() => useSchedule(store.repository))
    await waitFor(() => expect(result.current.schedule).not.toBeNull())

    act(() => result.current.setSchedule(week('essay')))
    await store.release('essay')

    await waitFor(() => expect(only(store.stored())).toBe('essay'))
    expect(result.current.problem).toBeNull()
  })

  // A message about a failure that is over is its own kind of dishonesty.
  it('takes the message back once a later write lands', async () => {
    let failNext = true
    const store = gated()
    const flaky: Repository = {
      ...store.repository,
      saveWeek: (next) => {
        if (failNext) {
          failNext = false
          return Promise.reject(new Error('down'))
        }
        return store.repository.saveWeek(next)
      },
    }

    const { result } = renderHook(() => useSchedule(flaky))
    await waitFor(() => expect(result.current.schedule).not.toBeNull())

    act(() => result.current.setSchedule(week('first')))
    await waitFor(() => expect(result.current.problem).toBe(SAVE_FAILED))

    act(() => result.current.setSchedule(week('second')))
    await store.release('second')

    await waitFor(() => expect(result.current.problem).toBeNull())
  })
})
