import { readDataConfig, type DataConfig } from './env'
import { createFallbackRepository } from './fallbackRepository'
import { createLocalRepository } from './localRepository'
import type { Session } from './session'
import { createSupabaseRepository } from './supabaseRepository'
import type { Repository } from './types'

/**
 * Chooses the store for whoever is signed in.
 *
 * Signed out, or with no Supabase configured, the week lives in browser storage. That is
 * a supported state rather than a degraded one: §0 requires every screen to render
 * something useful with zero user data, it is what CI runs in, and §10's instinct that
 * nothing should be called live on stage applies here too -- an app that still works with
 * no backend cannot be broken by a bad network during judging.
 *
 * Signed in and configured, the week lives in Supabase under that account, still backed
 * by browser storage so an unreachable database degrades rather than losing the week.
 */
export function createRepository(
  session: Session | null,
  config: DataConfig = readDataConfig(),
): Repository {
  const local = createLocalRepository()

  if (session === null || config.supabaseUrl === null || config.supabaseAnonKey === null) {
    return local
  }

  return createFallbackRepository(
    createSupabaseRepository(config.supabaseUrl, config.supabaseAnonKey, session.userId),
    local,
  )
}
