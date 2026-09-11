import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { createRepository } from './createRepository'

const configured = { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon-key', telegramBot: null }
const nothing = { supabaseUrl: null, supabaseAnonKey: null, telegramBot: null }
const session = { userId: 'user-1', email: 'a@b.com' }

describe('createRepository', () => {
  /**
   * Signed out is a supported state, not a degraded one. §0 requires every screen to
   * render something useful with zero user data, it is what CI runs in, and it is what
   * keeps the app alive if the network dies on stage.
   */
  it('uses browser storage when nobody is signed in', () => {
    const repo = createRepository(null, configured)

    expect(typeof repo.loadWeek).toBe('function')
    expect(typeof repo.saveWeek).toBe('function')
  })

  it('uses browser storage when Supabase is not configured, even signed in', () => {
    expect(typeof createRepository(session, nothing).loadWeek).toBe('function')
  })

  it('returns a working store when signed in and configured', () => {
    const repo = createRepository(session, configured)

    expect(typeof repo.loadWeek).toBe('function')
    expect(typeof repo.clear).toBe('function')
  })

  it('returns a store with neither a session nor configuration', () => {
    expect(typeof createRepository(null, nothing).loadWeek).toBe('function')
  })

  /**
   * The preview is only ever a preview.
   *
   * Signed out, the week lives in browser storage -- and it has to be written there, or
   * closing the tab would lose a fortnight somebody just built. The problem was that a
   * signed-in account used *that same database* as its backing store, so the seeded
   * preview was one unreachable Supabase away from being read back as a real student's
   * week. Naming the store after the account is what keeps the two apart, whatever the
   * network is doing.
   */
  it('keeps a signed-in account out of the preview store', async () => {
    const preview = createRepository(null, nothing)
    const week: Schedule = {
      items: [],
      start: { mental: 42, physical: 60, social: 50, errands: 70 },
      horizonDays: HORIZON_DAYS,
      sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
    }

    await preview.clear()
    await preview.saveWeek(week)

    expect(await createRepository(session, nothing).loadWeek()).toBeNull()
  })

  /** Two accounts on one device are two students, not one. */
  it('keeps one account out of another account store', async () => {
    const other = { userId: 'user-2', email: 'c@d.com' }
    const mine = createRepository(session, nothing)

    await mine.clear()
    await mine.saveWeek({
      items: [],
      start: { mental: 7, physical: 60, social: 50, errands: 70 },
      horizonDays: HORIZON_DAYS,
      sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
    })

    expect(await createRepository(other, nothing).loadWeek()).toBeNull()
  })
})
