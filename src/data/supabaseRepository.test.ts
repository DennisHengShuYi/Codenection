import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { getSession } from './auth'
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
  /** How many Supabase clients were constructed. One per browser is the whole point: a
   *  second client on the same storage key announces itself to the first, which is what
   *  drove the render loop. */
  clients: 0,
}

let maybeSingleResult: StubResult = { data: null, error: null }
let writeResult: StubResult = { error: null }

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    __constructed: (calls.clients += 1),
    // Enough of the auth surface for `getSession` to run for real. Leaving it off would
    // still let the count assertion below pass -- `getSession` swallows the resulting
    // throw -- but it would pass for the wrong reason.
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
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

// The auth module reads its configuration from the environment, which the test config
// blanks. Supplied here -- with the same url and key the repository is built on -- so that
// "one client" is a claim about both modules rather than about this one in isolation.
vi.mock('./env', () => ({
  readDataConfig: () => ({
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon-key',
  }),
}))

const week = (mental: number): Schedule => ({
  items: [],
  start: { mental, physical: 60, social: 50, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const repo = (userId = 'user-abc') =>
  createSupabaseRepository('https://example.supabase.co', 'anon-key', userId)

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

  it('reads the row belonging to this user, not a shared one', async () => {
    await repo().loadWeek()

    expect(calls.from).toContain('user_state')
    expect(calls.select).toContain('week, settings')
    expect(calls.eq).toContainEqual(['id', 'user-abc'])
  })

  // Proves the id is genuinely used rather than hardcoded -- the assertion that would
  // catch a fixed row id sneaking back in.
  it('reads a different row for a different identity', async () => {
    await repo('someone-else').loadWeek()

    expect(calls.eq).toContainEqual(['id', 'someone-else'])
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

/**
 * One client per project, however many repositories ask for one.
 *
 * The bug this guards against took the whole app down. `createRepository` runs inside a
 * `useMemo` keyed on the session, so a new session object produced a new repository. With
 * the client memoised inside each repository rather than across them, that meant a new
 * Supabase client per render. A second client on the same storage key announces itself to
 * the first, which arrives as an auth change, which builds a fresh session object, which
 * makes another repository -- until the browser runs out of sockets and every request
 * fails with ERR_INSUFFICIENT_RESOURCES.
 *
 * The browser tells you when this is broken: "Multiple GoTrueClient instances detected in
 * the same browser context."
 */
describe('the Supabase client', () => {
  it('is built once, however many repositories are created for the same project', async () => {
    await repo('user-abc').loadWeek()
    await repo('user-abc').loadWeek()
    await repo('someone-else').loadWeek()

    expect(calls.clients).toBe(1)
  })

  // Written as "does not increase" rather than "is zero" because the client is shared for
  // the life of the module: by the time this runs another test has legitimately built it,
  // and asserting zero would only be testing the order the tests happen to run in.
  it('is not built merely by creating a repository', () => {
    const before = calls.clients

    repo('user-abc')

    expect(calls.clients).toBe(before)
  })

  /**
   * The half of "one client" that the tests above cannot see.
   *
   * Storage and authentication are separate concerns and live in separate modules, but
   * they are not separate *clients*: both talk to the same project, so both land on the
   * same `sb-<ref>-auth-token` key in local storage. Two clients there is the warned-about
   * condition whether they came from one module or two -- and a memo per module looks
   * entirely correct while still producing exactly that.
   */
  it('is shared with the auth module, which works against the same storage key', async () => {
    // Ordered so the repository builds it first and auth is the one asked to reuse. The
    // reverse ordering is the same claim, but this way a failure names the module that
    // built a second client.
    await repo('user-abc').loadWeek()
    const before = calls.clients

    await getSession()

    expect(calls.clients).toBe(before)
  })
})
