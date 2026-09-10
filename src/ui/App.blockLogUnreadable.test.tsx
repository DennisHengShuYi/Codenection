import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Repository } from '../data'
import { App } from './App'

let readable = false

/**
 * Ruling 49: the repository REJECTS the block-log read -- the unmigrated deployment
 * `supabase/migrations/0005_block_log.sql` warns about, and a dropped connection.
 *
 * Mocked at `createRepository` rather than at the hook, because the thing that went wrong
 * here is what the app DOES with a failed read, and a stubbed hook would answer that
 * question by assuming it. Everything else about the repository is real.
 */
vi.mock('../data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data')>()
  const local = actual.createLocalRepository('app-unreadable-block-log')
  const repository: Repository = {
    ...local,
    loadBlockLog: () =>
      readable
        ? local.loadBlockLog()
        : Promise.reject(new Error('relation "block_answers" does not exist')),
  }

  return { ...actual, createRepository: () => repository }
})

const lookAround = async () => {
  render(<App />)
  await waitFor(() => expect(screen.getByRole('button', { name: /look around/i })).toBeVisible())
  await userEvent.click(screen.getByRole('button', { name: /look around/i }))
}

describe('App when the block log cannot be read', () => {
  /**
   * `api/telegram.ts:168` states the rule and `handle.ts:264` obeys it: an empty log and an
   * unreadable one mean opposite things, so `/ask` refuses to price rather than quoting a
   * number computed from an assumption nobody made. The web collapsed the read to `[]` and
   * drew a whole room from it -- the same student, the same week, two answers by door.
   */
  it('quotes no calibrated number at all, rather than an optimistic one', async () => {
    readable = false
    await lookAround()

    await waitFor(() =>
      expect(screen.getByTestId('block-log-problem')).toHaveTextContent(/could not read/i),
    )
    expect(screen.queryByTestId('room-scene')).toBeNull()
    // The gauge is the number in question: a reserve percentage read off a projection that
    // is calibrated against exactly the answers that could not be read.
    expect(screen.queryByTestId('room-gauge')).toBeNull()
  })

  // A refusal with no way out of it would be its own defect: the read fails for a dropped
  // connection as readily as for a missing table.
  it('lets the student ask again once storage is back', async () => {
    readable = false
    await lookAround()
    await waitFor(() => expect(screen.getByTestId('block-log-problem')).toBeVisible())

    readable = true
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    expect(screen.queryByTestId('block-log-problem')).toBeNull()
  })
})
