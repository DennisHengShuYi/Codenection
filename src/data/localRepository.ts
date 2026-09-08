import { clear, createStore, get, set } from 'idb-keyval'
import type { Schedule } from '../optimizer'
import { DEFAULT_SETTINGS, type Repository, type StoredSettings } from './types'

const WEEK_KEY = 'week'
const SETTINGS_KEY = 'settings'

export function createLocalRepository(): Repository {
  // A named store rather than the default one, so clearing this app's data cannot
  // disturb anything else the origin happens to keep in IndexedDB.
  const store = createStore('codenection', 'state')

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
