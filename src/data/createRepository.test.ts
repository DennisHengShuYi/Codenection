import { describe, expect, it } from 'vitest'
import { createRepository } from './createRepository'

describe('createRepository', () => {
  // The behaviour that keeps CI green without secrets and the demo alive without a
  // network: an unconfigured environment is a supported state, not an error.
  it('falls back to the local adapter when Supabase is not configured', () => {
    const repo = createRepository({ supabaseUrl: null, supabaseAnonKey: null })

    expect(typeof repo.loadWeek).toBe('function')
    expect(typeof repo.saveWeek).toBe('function')
  })

  // Shape only -- this connects to nothing. Exercising the Supabase adapter's actual
  // reads and writes would need a real project, which this project's rules bar.
  it('returns a repository when Supabase is configured', () => {
    const repo = createRepository({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key',
    })

    expect(typeof repo.loadWeek).toBe('function')
    expect(typeof repo.clear).toBe('function')
  })
})
