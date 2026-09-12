import type { SupabaseClient } from '@supabase/supabase-js'
import type { BlockRecord } from '../domain/blockLog'
import type { Schedule } from '../optimizer'
import { DEFAULT_SETTINGS, type Repository, type StoredSettings } from './types'
import { getSharedClient } from './supabaseClient'

/** One row per student holding their whole week as JSON. Deliberately not normalised:
 *  the schedule's shape changes with every plan in this project, and a relational schema
 *  would have to change with it for no benefit while there is exactly one reader. */
const TABLE = 'user_state'

/** §8b's block log. One row per block per student -- unlike `user_state`, this is
 *  genuinely relational: each answer is its own fact, upserted on `(account_id, block_id)`
 *  by migration 0005's primary key, which is what makes a repeated answer correct the
 *  first one instead of stacking a second. */
const BLOCK_LOG_TABLE = 'block_answers'

/**
 * The identity is passed in rather than discovered here.
 *
 * This repository's job is storage, not authentication. An earlier version signed itself
 * in anonymously, which conflated the two -- and is also why the identity it produced
 * could only ever live in the browser and die with it. `0002`'s policies key each row to
 * `auth.uid()`, which is identical for a registered account, so nothing about the schema
 * changes when the identity becomes a real one.
 */
export function createSupabaseRepository(
  url: string,
  anonKey: string,
  userId: string,
): Repository {
  const getClient = (): Promise<SupabaseClient> => getSharedClient(url, anonKey)

  async function readRow(): Promise<{
    week: Schedule | null
    settings: StoredSettings
  } | null> {
    const client = await getClient()
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
    const client = await getClient()
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

    async loadBlockLog() {
      const client = await getClient()
      const { data, error } = await client
        .from(BLOCK_LOG_TABLE)
        .select('block_id, load_type, activity_kind, title, planned_hours, day_index, answer, answered_at')
        .eq('account_id', userId)
        // Ordered, because the contract has to mean one thing on both adapters. PostgREST
        // makes no ordering promise without this, while the local adapter returns insertion
        // order -- so `loadBlockLog` answered the same question two ways depending on
        // whether a student was signed in. Nothing reads it in order today (`outcomesFrom`
        // and `checkedInDays` are both order-independent), which is exactly why it would
        // have gone unnoticed until something did.
        .order('answered_at', { ascending: true })

      if (error) throw new Error(`Could not read block log: ${error.message}`)

      return ((data ?? []) as Record<string, unknown>[]).map(
        (row): BlockRecord => ({
          blockId: row.block_id as string,
          type: row.load_type as BlockRecord['type'],
          // Absent on anything written before migration 0008, which is the honest state:
          // nothing recorded what those blocks were. They go on counting at the rung that
          // never needed them.
          ...(row.activity_kind === null || row.activity_kind === undefined
            ? {}
            : { kind: row.activity_kind as BlockRecord['kind'] }),
          ...(row.title === null || row.title === undefined ? {} : { title: row.title as string }),
          plannedHours: row.planned_hours as number,
          dayIndex: row.day_index as number,
          answer: row.answer as BlockRecord['answer'],
          answeredAt: Date.parse(row.answered_at as string),
        }),
      )
    },

    async recordBlockAnswer(record) {
      const client = await getClient()
      const { error } = await client.from(BLOCK_LOG_TABLE).upsert(
        {
          account_id: userId,
          block_id: record.blockId,
          load_type: record.type,
          // §2.4's two narrow rungs. Null rather than absent, so an answer corrected later
          // by a path that has neither clears what a previous one wrote rather than leaving
          // a stale title attached to it.
          activity_kind: record.kind ?? null,
          title: record.title ?? null,
          planned_hours: record.plannedHours,
          day_index: record.dayIndex,
          answer: record.answer,
          answered_at: new Date(record.answeredAt).toISOString(),
        },
        { onConflict: 'account_id,block_id' },
      )

      if (error) throw new Error(`Could not record block answer: ${error.message}`)
    },

    async clear() {
      const client = await getClient()
      const { error: weekError } = await client.from(TABLE).delete().eq('id', userId)
      if (weekError) throw new Error(`Could not clear state: ${weekError.message}`)

      const { error: logError } = await client.from(BLOCK_LOG_TABLE).delete().eq('account_id', userId)
      if (logError) throw new Error(`Could not clear state: ${logError.message}`)
    },
  }
}
