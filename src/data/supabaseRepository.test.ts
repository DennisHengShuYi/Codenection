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
  signIns: 0,
}

let signInResult: { data: { user: { id: string } | null }; error: { message: string } | null } = {
  data: { user: { id: 'user-abc' } },
  error: null,
}

let maybeSingleResult: StubResult = { data: null, error: null }
let writeResult: StubResult = { error: null }

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signInAnonymously: () => {
        calls.signIns += 1
        return Promise.resolve(signInResult)
      },
    },
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
  calls.signIns = 0
  maybeSingleResult = { data: null, error: null }
  writeResult = { error: null }
  signInResult = { data: { user: { id: 'user-abc' } }, error: null }
})

describe('createSupabaseRepository', () => {
  it('does not build a client until it is used', () => {
    repo()

    // The client is imported lazily so it stays out of the main bundle; constructing the
    // repository must therefore touch nothing, including signing in.
    expect(calls.from).toHaveLength(0)
    expect(calls.signIns).toBe(0)
  })

  it('reads the row belonging to this user, not a shared one', async () => {
    await repo().loadWeek()

    expect(calls.from).toContain('user_state')
    expect(calls.select).toContain('week, settings')
    expect(calls.eq).toContainEqual(['id', 'user-abc'])
  })

  /**
   * Every visitor gets their own row, keyed to an anonymous Supabase identity.
   *
   * The previous fixed 'me' key meant one shared row for everyone, and the anon key
   * ships inside the browser bundle by design -- so any visitor to the deployed app
   * could read and overwrite whatever was there. Fine for a demo with nothing in it and
   * wrong the moment it holds a real student's fortnight.
   */
  it('signs in anonymously so the row belongs to someone', async () => {
    await repo().loadWeek()

    expect(calls.signIns).toBe(1)
  })

  it('signs in once and reuses the session', async () => {
    const store = repo()
    await store.loadWeek()
    await store.loadSettings()
    await store.saveWeek(week(3))

    expect(calls.signIns).toBe(1)
  })

  it('throws when it cannot establish an identity', async () => {
    signInResult = { data: { user: null }, error: { message: 'anonymous sign-ins are disabled' } }

    await expect(repo().loadWeek()).rejects.toThrow(/anonymous sign-ins are disabled/)
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

  it('writes the week against the row belonging to this user', async () => {
    await repo().saveWeek(week(17))

    expect(calls.upsert).toHaveLength(1)
    expect(calls.upsert[0]).toMatchObject({ id: 'user-abc' })
  })

  it('writes settings without clobbering the week', async () => {
    await repo().saveSettings({ lowEnergyOverride: 'off' })

    // Only the settings column is sent, so saving a preference cannot wipe the schedule.
    expect(calls.upsert[0]).toMatchObject({
      id: 'user-abc',
      settings: { lowEnergyOverride: 'off' },
    })
    expect(calls.upsert[0]).not.toHaveProperty('week')
  })

  it('throws when a write fails', async () => {
    writeResult = { error: { message: 'permission denied' } }

    await expect(repo().saveWeek(week(1))).rejects.toThrow(/could not save state/i)
  })

  it('deletes only the row belonging to this user on clear', async () => {
    await repo().clear()

    expect(calls.deleted).toBe(1)
    expect(calls.eq).toContainEqual(['id', 'user-abc'])
  })

  it('throws when clearing fails', async () => {
    writeResult = { error: { message: 'permission denied' } }

    await expect(repo().clear()).rejects.toThrow(/could not clear state/i)
  })
})
