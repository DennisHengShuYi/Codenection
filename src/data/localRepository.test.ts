import { set } from 'idb-keyval'
import { describe, expect, it, vi } from 'vitest'
import type { BlockRecord } from '../domain/blockLog'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { createLocalRepository } from './localRepository'
import { DEFAULT_SETTINGS } from './types'
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

/**
 * §7 deleted `Schedule.recoveryLog` from the type, but weeks saved before this change carry
 * one in storage and must still load -- the field is ignored, not rejected. Nothing in this
 * repository validates the shape it stores, so the risk is only ever in a consumer choking
 * on the unexpected key; this proves the round trip stays silent about it.
 */
describe('a week persisted with the retired recoveryLog field', () => {
  it('still loads, with the legacy field simply along for the ride', async () => {
    const repo = createLocalRepository(`local-legacy-recovery-log-${Date.now()}`)
    const legacyWeek = {
      items: [],
      start: { mental: 70, physical: 70, social: 70, errands: 70 },
      horizonDays: HORIZON_DAYS,
      sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
      // A week saved by the app before this task shipped.
      recoveryLog: [{ kind: 'rest', helped: false }],
    }

    await expect(repo.saveWeek(legacyWeek as unknown as Schedule)).resolves.toBeUndefined()

    const loaded = await repo.loadWeek()
    expect(loaded).not.toBeNull()
    expect(loaded?.items).toEqual([])
    expect(loaded?.start.mental).toBe(70)
  })
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

/**
 * §8's sleep target and the nights behind it, on the settings blob.
 *
 * There for the reason `calibration` and `ladders` are, which `types.ts` states over both:
 * every adapter already persists settings as one blob, so this needs no migration and no
 * adapter change. These cases are what prove that claim rather than assuming it.
 */
describe('a sleep target and the nights behind it', () => {
  it('round-trips through the settings blob with no adapter change', async () => {
    const repo = createLocalRepository(`local-sleep-${Date.now()}`)

    await repo.saveSettings({
      ...DEFAULT_SETTINGS,
      sleepTargetHours: 9,
      sleepNights: [{ isoDate: '2026-09-12', hours: 6, answeredAt: 1_757_000_000_000 }],
    })

    const saved = await repo.loadSettings()

    expect(saved.sleepTargetHours).toBe(9)
    expect(saved.sleepNights).toEqual([
      { isoDate: '2026-09-12', hours: 6, answeredAt: 1_757_000_000_000 },
    ])
  })

  /**
   * Absent must mean "never set", not "set to the default".
   *
   * `sleepReality` treats a stated target differently from an unstated one, and `roomState`
   * keeps the population norm until one exists -- so this pins the *absence*, not merely that
   * an old blob loads. A default written into `DEFAULT_SETTINGS` would make every student look
   * as though they had stated a target, which is why neither field has one.
   */
  it('loads a blob saved before sleep existed, with both fields still absent', async () => {
    const repo = createLocalRepository(`local-sleep-legacy-${Date.now()}`)

    await repo.saveSettings({ lowEnergyOverride: 'auto' })

    const saved = await repo.loadSettings()

    expect(saved.sleepTargetHours).toBeUndefined()
    expect(saved.sleepNights).toBeUndefined()
  })
})
