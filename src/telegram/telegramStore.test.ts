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
function fakeClient(failWith: string | null = null): {
  client: SupabaseClient
  rows: Array<Record<string, unknown>>
} {
  const rows: Array<Record<string, unknown>> = []
  const failure = failWith === null ? null : { message: failWith }

  const table = {
    // `select(...).eq(...)` resolves to the rows, so the read path can be exercised with
    // the same stub as the write path.
    select: () => ({
      eq: async () => ({ data: failure === null ? rows : null, error: failure }),
    }),
    upsert: async (row: Record<string, unknown>, opts: { onConflict: string }) => {
      const keys = opts.onConflict.split(',')
      const survivors = rows.filter((existing) => !keys.every((key) => existing[key] === row[key]))
      if (failure !== null) return { error: failure }
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

/**
 * Ruling 41: `/ask` needs the same evidence the app reads, so the chat's store gained the
 * read side of the log its write side had always had.
 */
describe('createStore (api/telegram.ts), loadBlockLog', () => {
  it('reads back what recordBlockAnswer wrote, in the shape outcomesFrom expects', async () => {
    const { client } = fakeClient()
    const store = createStore(client)

    await store.recordBlockAnswer(
      'account-1',
      { blockId: 'b1', type: 'mental', plannedHours: 2, dayIndex: 3, answer: 'longer' },
      5000,
    )

    expect(await store.loadBlockLog('account-1')).toEqual([
      {
        blockId: 'b1',
        type: 'mental',
        plannedHours: 2,
        dayIndex: 3,
        answer: 'longer',
        answeredAt: 5000,
      },
    ])
  })

  it('is empty for an account that has answered nothing', async () => {
    const { client } = fakeClient()

    expect(await createStore(client).loadBlockLog('account-1')).toEqual([])
  })
})

/**
 * Ruling 42. `supabase/migrations/0005_block_log.sql` is NOT applied automatically, and
 * nothing in the repository applies it -- so on a deployment where it has not been run by
 * hand, `load_type`, `planned_hours` and `day_index` do not exist and every one of these
 * calls fails at the database.
 *
 * These two are the difference between that being loud and being invisible. The write side
 * dropped its error entirely and answered "Noted."; the read side did not exist. Both now
 * reject, and `handle.ts` turns the rejection into something the student is actually told.
 */
describe('createStore (api/telegram.ts), when the block-log columns are missing', () => {
  const missingColumn = 'column "load_type" does not exist'

  it('refuses to claim an answer was recorded when the write failed', async () => {
    const { client } = fakeClient(missingColumn)

    await expect(
      createStore(client).recordBlockAnswer(
        'account-1',
        { blockId: 'b1', type: 'mental', plannedHours: 2, dayIndex: 1, answer: 'right' },
        1000,
      ),
    ).rejects.toThrow(/load_type/)
  })

  // Not an empty log. "This student has answered nothing" and "we could not find out" are
  // opposite facts, and §2.4 prices a request differently on each.
  it('refuses to report an unreadable log as an empty one', async () => {
    const { client } = fakeClient(missingColumn)

    await expect(createStore(client).loadBlockLog('account-1')).rejects.toThrow(/load_type/)
  })
})
