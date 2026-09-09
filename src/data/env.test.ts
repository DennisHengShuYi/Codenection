import { describe, expect, it } from 'vitest'
import { readDataConfig } from './env'

describe('readDataConfig', () => {
  it('reads both Supabase values when present', () => {
    const config = readDataConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
    })

    expect(config.supabaseUrl).toBe('https://example.supabase.co')
    expect(config.supabaseAnonKey).toBe('anon-key')
  })

  it('reports nulls when nothing is configured', () => {
    expect(readDataConfig({})).toEqual({
      supabaseUrl: null,
      supabaseAnonKey: null,
      telegramBot: null,
    })
  })

  // Half a configuration is a misconfiguration. Running on one of the two values would
  // build a client that fails at its first request rather than at startup, which is a
  // far harder failure to place.
  it('treats a half-configured environment as unconfigured', () => {
    expect(readDataConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co' })).toEqual({
      supabaseUrl: null,
      supabaseAnonKey: null,
      telegramBot: null,
    })
  })

  it('treats a missing address with a present key as unconfigured', () => {
    expect(readDataConfig({ VITE_SUPABASE_ANON_KEY: 'anon-key' })).toEqual({
      supabaseUrl: null,
      supabaseAnonKey: null,
      telegramBot: null,
    })
  })

  it('ignores blank and whitespace values', () => {
    expect(readDataConfig({ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_ANON_KEY: '' })).toEqual({
      supabaseUrl: null,
      supabaseAnonKey: null,
      telegramBot: null,
    })
  })
})
