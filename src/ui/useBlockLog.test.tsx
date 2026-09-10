import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { createLocalRepository, DEFAULT_SETTINGS } from '../data'
import type { BlockRecord } from '../domain/blockLog'
import { useBlockLog } from './useBlockLog'

let counter = 0

const repo = () => {
  counter += 1
  return createLocalRepository(`use-block-log-${counter}`)
}

const broken = () => ({
  loadWeek: () => Promise.reject(new Error('down')),
  saveWeek: () => Promise.reject(new Error('down')),
  loadSettings: () => Promise.reject(new Error('down')),
  saveSettings: () => Promise.reject(new Error('down')),
  loadBlockLog: () => Promise.reject(new Error('down')),
  recordBlockAnswer: () => Promise.reject(new Error('down')),
  clear: () => Promise.reject(new Error('down')),
})

const record = (over: Partial<BlockRecord> = {}): BlockRecord => ({
  blockId: 'essay',
  type: 'mental',
  plannedHours: 2,
  dayIndex: 0,
  answer: 'right',
  answeredAt: 0,
  ...over,
})

/**
 * Ruling 12: `RoomShell` requires a real block log rather than defaulting to `[]`, so
 * something has to load one from the repository and let the screen record new answers
 * without a reload. This is that something.
 */
describe('useBlockLog', () => {
  it('loads whatever is already recorded', async () => {
    const repository = repo()
    await repository.clear()
    await repository.recordBlockAnswer(record())

    const { result } = renderHook(() => useBlockLog(repository))

    await waitFor(() => expect(result.current.blockLog).toHaveLength(1))
  })

  /**
   * Ruling 49, replacing "starts empty rather than throwing": starting empty was the bug.
   * `[]` is what the log looks like when the student has answered nothing, and the screens
   * downstream price a whole week off it -- so a read that failed used to come out as a
   * confident, optimistic, entirely invented number. Unreadable is `null` and says so, the
   * same call `src/telegram/handle.ts` already makes on the other door.
   */
  it('reads as unreadable, not as empty, when storage cannot be read', async () => {
    const { result } = renderHook(() => useBlockLog(broken()))

    await waitFor(() => expect(result.current.blockLog).toBeNull())
    expect(result.current.problem).toMatch(/could not read/i)
  })

  // The refusal has to be recoverable: the read fails for a dropped connection as readily
  // as for the table `0005_block_log.sql` warns is not created automatically.
  it('reads again on request, and takes the message back down when it lands', async () => {
    let failing = true
    const repository = repo()
    await repository.clear()
    await repository.recordBlockAnswer(record())
    const flaky = {
      ...repository,
      loadBlockLog: () => (failing ? Promise.reject(new Error('down')) : repository.loadBlockLog()),
    }

    const { result } = renderHook(() => useBlockLog(flaky))
    await waitFor(() => expect(result.current.blockLog).toBeNull())

    failing = false
    act(() => result.current.retry())

    await waitFor(() => expect(result.current.blockLog).toHaveLength(1))
    expect(result.current.problem).toBeNull()
  })

  // One answer is not the log. Reporting it as the whole of what the student has answered
  // would be exactly the collapse the null is there to refuse -- but the write still goes.
  it('stays unreadable when an answer is recorded against a log it could not read', async () => {
    const written: BlockRecord[] = []
    const { result } = renderHook(() =>
      useBlockLog({
        ...broken(),
        recordBlockAnswer: (entry: BlockRecord) => {
          written.push(entry)
          return Promise.resolve()
        },
      }),
    )
    await waitFor(() => expect(result.current.blockLog).toBeNull())

    act(() => result.current.recordAnswer(record()))

    expect(result.current.blockLog).toBeNull()
    await waitFor(() => expect(written).toHaveLength(1))
  })

  /**
   * The project's "never silently swallow errors" rule, at the one seam where swallowing
   * costs the most. A block answer is a one-shot event -- unlike a week edit, which the
   * next change rewrites -- and it is the evidence Reality Check publishes an accuracy
   * figure against. A write that vanishes leaves the student looking at their own answer on
   * screen, believing it was kept, while the number derived from it quietly disagrees.
   *
   * The answer is deliberately NOT rolled back out of local state. Erasing what somebody
   * just said, to be truthful about storage, trades one lie for a worse one; saying so is
   * the honest half.
   */
  it('says so when the answer cannot be written, rather than swallowing it', async () => {
    const unwritable = {
      loadWeek: () => Promise.resolve(null),
      saveWeek: () => Promise.resolve(),
      loadSettings: () => Promise.resolve(DEFAULT_SETTINGS),
      saveSettings: () => Promise.resolve(),
      loadBlockLog: () => Promise.resolve([]),
      recordBlockAnswer: () => Promise.reject(new Error('down')),
      clear: () => Promise.resolve(),
    }

    const { result } = renderHook(() => useBlockLog(unwritable))
    await waitFor(() => expect(result.current.blockLog).toEqual([]))

    act(() => result.current.recordAnswer(record()))

    await waitFor(() => expect(result.current.problem).toMatch(/could not save/i))
    // Still on screen: the student's answer is not thrown away to make the message true.
    expect(result.current.blockLog).toHaveLength(1)
  })

  // And it clears once a write lands, so a message about a failure that is over does not
  // sit there telling the student something untrue in the other direction.
  it('clears the problem once a later answer is written', async () => {
    let failing = true
    const repository = repo()
    await repository.clear()
    const flaky = {
      ...repository,
      recordBlockAnswer: (entry: BlockRecord) => {
        if (failing) return Promise.reject(new Error('down'))
        return repository.recordBlockAnswer(entry)
      },
    }

    const { result } = renderHook(() => useBlockLog(flaky))
    await waitFor(() => expect(result.current.blockLog).toEqual([]))

    act(() => result.current.recordAnswer(record()))
    await waitFor(() => expect(result.current.problem).toMatch(/could not save/i))

    failing = false
    act(() => result.current.recordAnswer(record({ answer: 'less' })))
    await waitFor(() => expect(result.current.problem).toBeNull())
  })

  it('records a new answer so it shows up immediately, with nothing to reload for', async () => {
    const repository = repo()
    await repository.clear()

    const { result } = renderHook(() => useBlockLog(repository))
    await waitFor(() => expect(result.current.blockLog).toEqual([]))

    act(() => result.current.recordAnswer(record()))

    expect(result.current.blockLog).toHaveLength(1)
    await waitFor(async () => expect((await repository.loadBlockLog())).toHaveLength(1))
  })

  it('upserts on blockId, replacing rather than duplicating a corrected answer', async () => {
    const repository = repo()
    await repository.clear()

    const { result } = renderHook(() => useBlockLog(repository))
    await waitFor(() => expect(result.current.blockLog).toEqual([]))

    act(() => result.current.recordAnswer(record({ answer: 'less' })))
    act(() => result.current.recordAnswer(record({ answer: 'longer' })))

    expect(result.current.blockLog).toHaveLength(1)
    expect(result.current.blockLog?.[0]?.answer).toBe('longer')
  })
})
