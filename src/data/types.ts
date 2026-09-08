import type { Schedule } from '../optimizer'

/** §1.5's low-energy mode is a product decision as much as an accessibility one, so the
 *  student can force it either way rather than only having it inferred for them. */
export interface StoredSettings {
  readonly lowEnergyOverride: 'auto' | 'on' | 'off'
}

export const DEFAULT_SETTINGS: StoredSettings = { lowEnergyOverride: 'auto' }

/**
 * The only persistence vocabulary the app knows.
 *
 * Two adapters implement it and the choice is made once at startup, so no screen ever
 * learns whether it is talking to IndexedDB or Supabase. That is what lets CI run green
 * with no secrets configured, and what keeps the demo alive if the network dies on stage.
 */
export interface Repository {
  loadWeek(): Promise<Schedule | null>
  saveWeek(week: Schedule): Promise<void>
  loadSettings(): Promise<StoredSettings>
  saveSettings(settings: StoredSettings): Promise<void>
  clear(): Promise<void>
}
