import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createStore } from '../../api/telegram'

/**
 * `createStore` lives in `api/telegram.ts` -- the only file that reads
 * `SUPABASE_SERVICE_ROLE_KEY` -- but it takes a `SupabaseClient` as a parameter rather than
 * reading the key itself, so it can be exercised here against a stub client with the key
 * nowhere in reach. This is what Task 17b's "second press corrects rather than duplicates"
 * evidence needs: that guarantee lives entirely in how `recordBlockAnswer` calls the client,
 * which `src/telegram/handle.test.ts` cannot see because `ChatStore` there is a fake.
 *
 * The stub's `upsert` actually performs the upsert semantics (replacing a row whose
 * `onConflict` columns match) rather than merely recording the call, so that breaking the
 * real `upsert` call into an `insert` produces a second row here -- an observable, not
 * merely asserted, difference.
 */
function fakeClient(): { client: SupabaseClient; rows: Array<Record<string, unknown>> } {
  const rows: Array<Record<string, unknown>> = []

  const table = {
    upsert: async (row: Record<string, unknown>, opts: { onConflict: string }) => {
      const keys = opts.onConflict.split(',')
      const survivors = rows.filter((existing) => !keys.every((key) => existing[key] === row[key]))
      rows.splice(0, rows.length, ...survivors, row)
      return { error: null }
    },
    // Present so that a source change from `.upsert(...)` to `.insert(...)` fails this
    // suite's duplication check rather than throwing "not a function" -- the point is to
    // see the *behaviour* break, not the type.
    insert: async (row: Record<string, unknown>) => {
      rows.push(row)
      return { error: null }
    },
  }

  const client = { from: () => table } as unknown as SupabaseClient

  return { client, rows }
}

describe('createStore (api/telegram.ts), recordBlockAnswer', () => {
  // Ruling 16's second required RED: Telegram re-sends an update it was not acknowledged
  // for, so a student's phone can press the same button's callback twice. Breaking the
  // `upsert` in api/telegram.ts into an `insert` makes this fail with rows.length === 2.
  it('corrects a second press on the same block rather than stacking a second row', async () => {
    const { client, rows } = fakeClient()
    const store = createStore(client)

    await store.recordBlockAnswer(
      'account-1',
      { blockId: 'b1', type: 'mental', plannedHours: 2, dayIndex: 1, answer: 'right' },
      1000,
    )
    await store.recordBlockAnswer(
      'account-1',
      { blockId: 'b1', type: 'mental', plannedHours: 2, dayIndex: 1, answer: 'longer' },
      2000,
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.answer).toBe('longer')
  })

  // A different block for the same account is a different fact and must not be merged into
  // one row -- the upsert key is the pair, not the account alone.
  it('keeps a separate row for a different block on the same account', async () => {
    const { client, rows } = fakeClient()
    const store = createStore(client)

    await store.recordBlockAnswer(
      'account-1',
      { blockId: 'b1', type: 'mental', plannedHours: 2, dayIndex: 1, answer: 'right' },
      1000,
    )
    await store.recordBlockAnswer(
      'account-1',
      { blockId: 'b2', type: 'physical', plannedHours: 1, dayIndex: 1, answer: 'less' },
      1000,
    )

    expect(rows).toHaveLength(2)
  })

  // §8b②'s vocabulary and columns, written as `outcomesFrom` and the today card's own
  // repository expect them -- `load_type`, `planned_hours`, `day_index`, and one of the
  // four answers, not the old `yes`/`no`/`partly`.
  it('writes the four-answer vocabulary and the three new columns', async () => {
    const { client, rows } = fakeClient()
    const store = createStore(client)

    await store.recordBlockAnswer(
      'account-1',
      { blockId: 'b1', type: 'physical', plannedHours: 1.5, dayIndex: 3, answer: 'didnt' },
      5000,
    )

    expect(rows[0]).toEqual({
      account_id: 'account-1',
      block_id: 'b1',
      load_type: 'physical',
      planned_hours: 1.5,
      day_index: 3,
      answer: 'didnt',
      answered_at: new Date(5000).toISOString(),
    })
  })
})
