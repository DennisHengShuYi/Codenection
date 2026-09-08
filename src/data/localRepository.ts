import { clear, createStore, get, set } from 'idb-keyval'
import type { Schedule } from '../optimizer'
import { DEFAULT_SETTINGS, type Repository, type StoredSettings } from './types'

const WEEK_KEY = 'week'
const SETTINGS_KEY = 'settings'

/**
 * @param databaseName Which IndexedDB database to use. Defaults to the app's own.
 *
 * Nameable so two genuinely separate stores can exist at once, which the preview
 * carry-over needs to be testable: with a single fixed name a "from" and a "to" store
 * would be the same store, and moving a week between them would be a no-op that quietly
 * looked like success.
 *
 * The *database* is what varies, not the object store inside it. IndexedDB creates its
 * object stores when the database is first opened, so asking for a second store name in
 * an existing database fails rather than creating one.
 */
export function createLocalRepository(databaseName = 'codenection'): Repository {
  // A named database rather than the default one, so clearing this app's data cannot
  // disturb anything else the origin happens to keep in IndexedDB.
  const store = createStore(databaseName, 'state')

  return {
    async loadWeek() {
      return (await get<Schedule>(WEEK_KEY, store)) ?? null
    },

    async saveWeek(week) {
      await set(WEEK_KEY, week, store)
    },

    async loadSettings() {
      return (await get<StoredSettings>(SETTINGS_KEY, store)) ?? DEFAULT_SETTINGS
    },

    async saveSettings(settings) {
      await set(SETTINGS_KEY, settings, store)
    },

    async clear() {
      await clear(store)
    },
  }
}
