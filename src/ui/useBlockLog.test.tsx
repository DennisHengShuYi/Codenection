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

  it('starts empty rather than throwing when storage cannot be read', async () => {
    const broken = {
      loadWeek: () => Promise.reject(new Error('down')),
      saveWeek: () => Promise.reject(new Error('down')),
      loadSettings: () => Promise.reject(new Error('down')),
      saveSettings: () => Promise.reject(new Error('down')),
      loadBlockLog: () => Promise.reject(new Error('down')),
      recordBlockAnswer: () => Promise.reject(new Error('down')),
      clear: () => Promise.reject(new Error('down')),
    }

    const { result } = renderHook(() => useBlockLog(broken))

    await waitFor(() => expect(result.current.blockLog).toEqual([]))
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
    expect(result.current.blockLog[0]?.answer).toBe('longer')
  })
})
