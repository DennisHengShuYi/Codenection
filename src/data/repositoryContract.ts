import { beforeEach, describe, expect, it } from 'vitest'
import type { BlockRecord } from '../domain/blockLog'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { DEFAULT_SETTINGS, type Repository } from './types'

const week = (mental: number): Schedule => ({
  items: [],
  start: { mental, physical: 60, social: 50, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

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
 * The suite every adapter runs.
 *
 * Written once and shared because the Supabase adapter cannot be exercised in CI --
 * there are no credentials there by design, and this project's rules forbid testing
 * against a real project's data. A shared contract is therefore the only thing stopping
 * the two implementations quietly meaning different things.
 */
export function describeRepositoryContract(name: string, make: () => Repository): void {
  describe(`${name} (repository contract)`, () => {
    let repo: Repository

    // A fresh store, emptied before each test. Sharing one across the file would let one
    // test's leftovers decide another test's result.
    beforeEach(async () => {
      repo = make()
      await repo.clear()
    })

    // §0's no-cold-start rule reaches this far down: a first-run read has to be an
    // absence the caller can handle, never a throw.
    it('returns null for a week that was never saved', async () => {
      expect(await repo.loadWeek()).toBeNull()
    })

    it('returns what was saved', async () => {
      await repo.saveWeek(week(42))

      expect((await repo.loadWeek())?.start.mental).toBe(42)
    })

    it('replaces the week rather than accumulating', async () => {
      await repo.saveWeek(week(42))
      await repo.saveWeek(week(17))

      expect((await repo.loadWeek())?.start.mental).toBe(17)
    })

    it('falls back to default settings before any are saved', async () => {
      expect(await repo.loadSettings()).toEqual(DEFAULT_SETTINGS)
    })

    it('returns saved settings', async () => {
      await repo.saveSettings({ lowEnergyOverride: 'on' })

      expect((await repo.loadSettings()).lowEnergyOverride).toBe('on')
    })

    it('forgets everything after clear', async () => {
      await repo.saveWeek(week(42))
      await repo.saveSettings({ lowEnergyOverride: 'off' })

      await repo.clear()

      expect(await repo.loadWeek()).toBeNull()
      expect(await repo.loadSettings()).toEqual(DEFAULT_SETTINGS)
    })

    it('round-trips a week without losing its shape', async () => {
      const original = week(55)
      await repo.saveWeek(original)

      expect(await repo.loadWeek()).toEqual(original)
    })

    it('starts with an empty block log', async () => {
      expect(await repo.loadBlockLog()).toEqual([])
    })

    it('reads back what it recorded', async () => {
      await repo.recordBlockAnswer(record())

      expect(await repo.loadBlockLog()).toHaveLength(1)
    })

    it('corrects a repeated answer rather than stacking a second one', async () => {
      await repo.recordBlockAnswer(record({ answer: 'right' }))
      await repo.recordBlockAnswer(record({ answer: 'longer' }))

      const log = await repo.loadBlockLog()
      expect(log).toHaveLength(1)
      expect(log[0]?.answer).toBe('longer')
    })

    it('forgets the log on clear, like everything else', async () => {
      await repo.recordBlockAnswer(record())
      await repo.clear()

      expect(await repo.loadBlockLog()).toEqual([])
    })

    /**
     * `recordBlockAnswer` is a read-modify-write over one stored array. A naive
     * implementation reads the same near-empty snapshot for every concurrent caller and
     * the last `set` wins, silently dropping the rest -- exactly what the profile seed
     * does on first run (several records written via `Promise.all`), and what two blocks
     * answered in quick succession would do too. Every record must survive regardless.
     */
    it('lands every record from concurrent recordBlockAnswer calls', async () => {
      const records = Array.from({ length: 8 }, (_, index) => record({ blockId: `concurrent-${index}` }))

      await Promise.all(records.map((entry) => repo.recordBlockAnswer(entry)))

      const log = await repo.loadBlockLog()
      expect(log).toHaveLength(records.length)
      for (const entry of records) {
        expect(log.some((saved) => saved.blockId === entry.blockId)).toBe(true)
      }
    })
  })
}
