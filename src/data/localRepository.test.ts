import { set } from 'idb-keyval'
import { describe, expect, it, vi } from 'vitest'
import type { BlockRecord } from '../domain/blockLog'
import { createLocalRepository } from './localRepository'
import { describeRepositoryContract } from './repositoryContract'

vi.mock('idb-keyval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('idb-keyval')>()
  return { ...actual, set: vi.fn(actual.set) }
})

// No cases of its own beyond the write-queue test below: this adapter has no behaviour
// beyond being the contract, implemented, plus the failure-resilience of its own
// serialising write queue, which is an implementation detail the shared contract has no
// way to exercise (it cannot make a generic write reject on demand).
describeRepositoryContract('localRepository', createLocalRepository)

const record = (over: Partial<BlockRecord> = {}): BlockRecord => ({
  blockId: 'essay',
  type: 'mental',
  plannedHours: 3,
  dayIndex: 2,
  answer: 'right',
  answeredAt: 1_757_000_000_000,
  ...over,
})

describe('localRepository write queue', () => {
  it('keeps taking writes after one recordBlockAnswer call rejects', async () => {
    const repo = createLocalRepository(`local-queue-failure-${Date.now()}`)
    const mockedSet = vi.mocked(set)
    mockedSet.mockRejectedValueOnce(new Error('simulated storage failure'))

    // The rejected write must surface to its own caller...
    await expect(repo.recordBlockAnswer(record({ blockId: 'a' }))).rejects.toThrow(
      'simulated storage failure',
    )

    // ...but must not wedge the queue for whatever is chained after it.
    await expect(repo.recordBlockAnswer(record({ blockId: 'b' }))).resolves.toBeUndefined()

    const log = await repo.loadBlockLog()
    expect(log.map((entry) => entry.blockId)).toEqual(['b'])
  })
})
