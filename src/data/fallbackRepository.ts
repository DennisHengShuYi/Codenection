import type { BlockRecord } from '../domain/blockLog'
import type { Schedule } from '../optimizer'
import { DEFAULT_SETTINGS, type Repository, type StoredSettings } from './types'

/**
 * Wraps a primary store with a backup, so a broken primary degrades instead of losing
 * the week entirely.
 *
 * This exists because of a specific, easy mistake: configuring Supabase without applying
 * the migration points the app at a table that does not exist. Every read and write then
 * fails, and persistence disappears *silently* -- strictly worse than the browser storage
 * it replaced, and invisible until a student loses a fortnight of work. Falling back keeps
 * their week rather than punishing them for a half-finished setup.
 *
 * It warns once rather than on every call: a silent fallback would hide the
 * misconfiguration forever, and a warning per operation would bury it in noise.
 */
export function createFallbackRepository(
  primary: Repository,
  backup: Repository,
): Repository {
  let warned = false

  function noteFailure(error: unknown): void {
    if (warned) return
    warned = true
    console.warn(
      'Primary storage is unreachable, so this session is using local browser storage instead. ' +
        'If Supabase is configured, check that the migration in supabase/migrations has been applied.',
      error,
    )
  }

  async function withFallback<T>(
    attempt: () => Promise<T>,
    fallback: () => Promise<T>,
    whenBothFail: T,
  ): Promise<T> {
    try {
      return await attempt()
    } catch (error) {
      noteFailure(error)
      try {
        return await fallback()
      } catch {
        // Both gone. Returning the empty answer keeps §0's no-cold-start rule working:
        // the screen still renders, on the seeded week, rather than failing to load.
        return whenBothFail
      }
    }
  }

  return {
    loadWeek: () =>
      withFallback<Schedule | null>(() => primary.loadWeek(), () => backup.loadWeek(), null),

    saveWeek: (week) =>
      withFallback(() => primary.saveWeek(week), () => backup.saveWeek(week), undefined),

    loadSettings: () =>
      withFallback<StoredSettings>(
        () => primary.loadSettings(),
        () => backup.loadSettings(),
        DEFAULT_SETTINGS,
      ),

    saveSettings: (settings) =>
      withFallback(
        () => primary.saveSettings(settings),
        () => backup.saveSettings(settings),
        undefined,
      ),

    loadBlockLog: () =>
      withFallback<readonly BlockRecord[]>(
        () => primary.loadBlockLog(),
        () => backup.loadBlockLog(),
        [],
      ),

    recordBlockAnswer: (record) =>
      withFallback(
        () => primary.recordBlockAnswer(record),
        () => backup.recordBlockAnswer(record),
        undefined,
      ),

    clear: () => withFallback(() => primary.clear(), () => backup.clear(), undefined),
  }
}
