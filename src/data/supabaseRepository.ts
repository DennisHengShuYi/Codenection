import type { SupabaseClient } from '@supabase/supabase-js'
import type { Schedule } from '../optimizer'
import { DEFAULT_SETTINGS, type Repository, type StoredSettings } from './types'

/** One row per student holding their whole week as JSON. Deliberately not normalised:
 *  the schedule's shape changes with every plan in this project, and a relational schema
 *  would have to change with it for no benefit while there is exactly one reader. */
const TABLE = 'user_state'

export function createSupabaseRepository(url: string, anonKey: string): Repository {
  /**
   * Loaded on first use rather than imported at the top of the file.
   *
   * The client is around 220KB of JavaScript, and a static import puts it in the main
   * bundle for *every* visitor -- including the demo, which runs on browser storage and
   * never touches Supabase at all. §11 asks for something a student installs on a phone,
   * so doubling the download for a path most sessions never take is the wrong trade.
   *
   * Memoised, so a session that does use Supabase pays the import once rather than per
   * call.
   */
  let clientPromise: Promise<SupabaseClient> | null = null

  const getClient = (): Promise<SupabaseClient> => {
    clientPromise ??= import('@supabase/supabase-js').then((module) =>
      module.createClient(url, anonKey),
    )
    return clientPromise
  }

  /**
   * An anonymous identity, so each student's week lives in their own row.
   *
   * This is what makes row-level security mean anything here. The anon key ships inside
   * the browser bundle by design -- it is meant to be public -- so a fixed row id would
   * put every visitor on the same row, able to read and overwrite whatever was there.
   * With a real `auth.uid()` the database itself enforces the boundary rather than the
   * client promising to behave.
   *
   * Memoised: one sign-in per session, not one per call.
   */
  let sessionPromise: Promise<string> | null = null

  const getUserId = (): Promise<string> => {
    sessionPromise ??= getClient()
      .then((client) => client.auth.signInAnonymously())
      .then(({ data, error }) => {
        if (error) throw new Error(`Could not sign in: ${error.message}`)
        if (!data.user) throw new Error('Could not sign in: no user was returned')
        return data.user.id
      })
      .catch((error: unknown) => {
        // Cleared so a later call can retry rather than being stuck with a failure that
        // may have been a one-off network blip.
        sessionPromise = null
        throw error
      })

    return sessionPromise
  }

  async function readRow(): Promise<{
    week: Schedule | null
    settings: StoredSettings
  } | null> {
    const [client, userId] = await Promise.all([getClient(), getUserId()])
    const { data, error } = await client
      .from(TABLE)
      .select('week, settings')
      .eq('id', userId)
      .maybeSingle()

    // Thrown rather than swallowed into a null: a read failure and an empty store mean
    // completely different things, and collapsing them would show a first-run screen to
    // someone whose data exists but could not be fetched.
    if (error) throw new Error(`Could not read saved state: ${error.message}`)
    if (!data) return null

    return {
      week: (data.week as Schedule | null) ?? null,
      settings: (data.settings as StoredSettings | null) ?? DEFAULT_SETTINGS,
    }
  }

  async function writeRow(patch: Record<string, unknown>): Promise<void> {
    const [client, userId] = await Promise.all([getClient(), getUserId()])
    const { error } = await client.from(TABLE).upsert({ id: userId, ...patch })
    if (error) throw new Error(`Could not save state: ${error.message}`)
  }

  return {
    async loadWeek() {
      return (await readRow())?.week ?? null
    },

    async saveWeek(week) {
      await writeRow({ week })
    },

    async loadSettings() {
      return (await readRow())?.settings ?? DEFAULT_SETTINGS
    },

    async saveSettings(settings) {
      await writeRow({ settings })
    },

    async clear() {
      const [client, userId] = await Promise.all([getClient(), getUserId()])
      const { error } = await client.from(TABLE).delete().eq('id', userId)
      if (error) throw new Error(`Could not clear state: ${error.message}`)
    },
  }
}
