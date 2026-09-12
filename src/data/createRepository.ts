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
 *
 * **The preview is only ever a preview.** Every store here is named, and an account's name
 * is its own -- so the fortnight a visitor builds signed out cannot be read back as a
 * signed-in student's week, and two accounts sharing a device cannot read each other. That
 * mattered most on the backup path: the signed-in store fell back to the *same* database
 * the preview lived in, so a seeded demo week was one unreachable Supabase away from being
 * presented to a real student as their own.
 */

/** The store a signed-out visitor writes to. Written rather than held in memory because
 *  closing the tab would otherwise lose a fortnight somebody had just built. */
const PREVIEW_STORE = 'codenection'

/** One database per account, so nothing on this device is shared between two students --
 *  or between a student and the preview. */
const storeFor = (session: Session): string => `codenection-${session.userId}`
export function createRepository(
  session: Session | null,
  config: DataConfig = readDataConfig(),
): Repository {
  if (session === null) return createLocalRepository(PREVIEW_STORE)

  const local = createLocalRepository(storeFor(session))

  if (config.supabaseUrl === null || config.supabaseAnonKey === null) {
    return local
  }

  return createFallbackRepository(
    createSupabaseRepository(config.supabaseUrl, config.supabaseAnonKey, session.userId),
    local,
  )
}
