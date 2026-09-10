import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { createLocalRepository } from '../data'
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
