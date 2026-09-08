import type { SupabaseClient } from '@supabase/supabase-js'
import type { Schedule } from '../optimizer'
import { DEFAULT_SETTINGS, type Repository, type StoredSettings } from './types'

/** One row holding the whole week as JSON. Deliberately not normalised: the schedule's
 *  shape changes with every plan in this project, and a relational schema would have to
 *  change with it for no benefit while there is exactly one reader. */
const TABLE = 'user_state'
const SINGLETON_ID = 'me'

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

  async function readRow(): Promise<{
    week: Schedule | null
    settings: StoredSettings
  } | null> {
    const client = await getClient()
    const { data, error } = await client
      .from(TABLE)
      .select('week, settings')
      .eq('id', SINGLETON_ID)
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
    const client = await getClient()
    const { error } = await client.from(TABLE).upsert({ id: SINGLETON_ID, ...patch })
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
      const client = await getClient()
      const { error } = await client.from(TABLE).delete().eq('id', SINGLETON_ID)
      if (error) throw new Error(`Could not clear state: ${error.message}`)
    },
  }
}
