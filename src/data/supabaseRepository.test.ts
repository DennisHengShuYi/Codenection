import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { createSupabaseRepository } from './supabaseRepository'
import { DEFAULT_SETTINGS } from './types'

/**
 * The adapter's own logic, with the Supabase client stubbed.
 *
 * It cannot be exercised against a real project -- .claude/CLAUDE.md forbids testing
 * against production data, and the anon key in .env points at a live database whose
 * `clear()` would delete whatever it found. So the network is stubbed and what is tested
 * is everything the adapter itself decides: which table and row it reads, how it maps an
 * error, what it does with a missing row, and what it writes.
 *
 * This does not prove the adapter works against a real Supabase. Only pointing the
 * contract suite at a disposable project would do that, and that remains the honest gap.
 * What it does prove is that the adapter's own reasoning is right, which was previously
 * unverified.
 */

interface StubResult {
  data?: unknown
  error?: { message: string } | null
}

const calls = {
  from: [] as string[],
  select: [] as string[],
  eq: [] as Array<[string, unknown]>,
  upsert: [] as unknown[],
  deleted: 0,
}

let maybeSingleResult: StubResult = { data: null, error: null }
let writeResult: StubResult = { error: null }

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      calls.from.push(table)
      const builder = {
        select(columns: string) {
          calls.select.push(columns)
          return builder
        },
        eq(column: string, value: unknown) {
          calls.eq.push([column, value])
          return builder
        },
        maybeSingle: () => Promise.resolve(maybeSingleResult),
        upsert(row: unknown) {
          calls.upsert.push(row)
          return Promise.resolve(writeResult)
        },
        delete() {
          calls.deleted += 1
          return {
            eq(column: string, value: unknown) {
              calls.eq.push([column, value])
              return Promise.resolve(writeResult)
            },
          }
        },
      }
      return builder
    },
  }),
}))

const week = (mental: number): Schedule => ({
  items: [],
  start: { mental, physical: 60, social: 50, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const repo = () => createSupabaseRepository('https://example.supabase.co', 'anon-key')

beforeEach(() => {
  calls.from = []
  calls.select = []
  calls.eq = []
  calls.upsert = []
  calls.deleted = 0
  maybeSingleResult = { data: null, error: null }
  writeResult = { error: null }
})

describe('createSupabaseRepository', () => {
  it('does not build a client until it is used', () => {
    repo()

    // The client is imported lazily so it stays out of the main bundle; constructing the
    // repository must therefore touch nothing.
    expect(calls.from).toHaveLength(0)
  })

  it('reads the singleton row from the user_state table', async () => {
    await repo().loadWeek()

    expect(calls.from).toContain('user_state')
    expect(calls.select).toContain('week, settings')
    expect(calls.eq).toContainEqual(['id', 'me'])
  })

  it('returns null when no row exists yet', async () => {
    maybeSingleResult = { data: null, error: null }

    expect(await repo().loadWeek()).toBeNull()
  })

  it('returns the stored week when a row exists', async () => {
    maybeSingleResult = { data: { week: week(42), settings: null }, error: null }

    expect((await repo().loadWeek())?.start.mental).toBe(42)
  })

  it('falls back to default settings when the row has none', async () => {
    maybeSingleResult = { data: { week: null, settings: null }, error: null }

    expect(await repo().loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('returns stored settings when the row has them', async () => {
    maybeSingleResult = { data: { week: null, settings: { lowEnergyOverride: 'on' } }, error: null }

    expect((await repo().loadSettings()).lowEnergyOverride).toBe('on')
  })

  /**
   * A read error and an empty store mean completely different things, and collapsing
   * them would show a first-run screen to a student whose data exists but could not be
   * fetched. The wrapper above this decides what to do about it; the adapter's job is to
   * say clearly that it failed.
   */
  it('throws rather than returning null when the read fails', async () => {
    maybeSingleResult = { error: { message: 'relation "user_state" does not exist' } }

    await expect(repo().loadWeek()).rejects.toThrow(/could not read saved state/i)
  })

  it('includes the underlying cause in a read failure', async () => {
    maybeSingleResult = { error: { message: 'JWT expired' } }

    await expect(repo().loadSettings()).rejects.toThrow(/JWT expired/)
  })

  it('writes the week against the singleton id', async () => {
    await repo().saveWeek(week(17))

    expect(calls.upsert).toHaveLength(1)
    expect(calls.upsert[0]).toMatchObject({ id: 'me' })
  })

  it('writes settings without clobbering the week', async () => {
    await repo().saveSettings({ lowEnergyOverride: 'off' })

    // Only the settings column is sent, so saving a preference cannot wipe the schedule.
    expect(calls.upsert[0]).toMatchObject({ id: 'me', settings: { lowEnergyOverride: 'off' } })
    expect(calls.upsert[0]).not.toHaveProperty('week')
  })

  it('throws when a write fails', async () => {
    writeResult = { error: { message: 'permission denied' } }

    await expect(repo().saveWeek(week(1))).rejects.toThrow(/could not save state/i)
  })

  it('deletes the singleton row on clear', async () => {
    await repo().clear()

    expect(calls.deleted).toBe(1)
    expect(calls.eq).toContainEqual(['id', 'me'])
  })

  it('throws when clearing fails', async () => {
    writeResult = { error: { message: 'permission denied' } }

    await expect(repo().clear()).rejects.toThrow(/could not clear state/i)
  })
})
