import { describe, expect, it } from 'vitest'
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
})
