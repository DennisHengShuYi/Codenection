import { readDataConfig, type DataConfig } from './env'
import { createFallbackRepository } from './fallbackRepository'
import { createLocalRepository } from './localRepository'
import { createSupabaseRepository } from './supabaseRepository'
import type { Repository } from './types'

/**
 * Chooses the store once, at startup.
 *
 * An unconfigured environment is a supported state rather than an error: it is what CI
 * runs in, and §10's "nothing is called live on stage" instinct applies here too. An app
 * that still works with no backend cannot be broken by a bad network during judging.
 */
export function createRepository(config: DataConfig = readDataConfig()): Repository {
  const local = createLocalRepository()

  if (config.supabaseUrl !== null && config.supabaseAnonKey !== null) {
    // Backed by browser storage rather than used alone. Configuring Supabase without
    // applying the migration is an easy and invisible mistake -- it points the app at a
    // table that does not exist, and persistence then vanishes silently, which is worse
    // than the storage it replaced.
    return createFallbackRepository(
      createSupabaseRepository(config.supabaseUrl, config.supabaseAnonKey),
      local,
    )
  }

  return local
}
