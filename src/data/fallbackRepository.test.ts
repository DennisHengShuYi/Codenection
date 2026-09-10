import { describe, expect, it, vi } from 'vitest'
import type { BlockRecord } from '../domain/blockLog'
import { createFallbackRepository } from './fallbackRepository'
import { createLocalRepository } from './localRepository'
import { DEFAULT_SETTINGS, type Repository } from './types'

const unreachable = (): Repository => ({
  loadWeek: () => Promise.reject(new Error('relation "user_state" does not exist')),
  saveWeek: () => Promise.reject(new Error('relation "user_state" does not exist')),
  loadSettings: () => Promise.reject(new Error('relation "user_state" does not exist')),
  saveSettings: () => Promise.reject(new Error('relation "user_state" does not exist')),
  loadBlockLog: () => Promise.reject(new Error('relation "block_answers" does not exist')),
  recordBlockAnswer: () => Promise.reject(new Error('relation "block_answers" does not exist')),
  clear: () => Promise.reject(new Error('relation "user_state" does not exist')),
})

const week = () => ({
  items: [],
  start: { mental: 42, physical: 60, social: 50, errands: 70 },
  horizonDays: 21,
  sleepByDay: Array.from({ length: 21 }, () => 7),
})

const record = (): BlockRecord => ({
  blockId: 'essay',
  type: 'mental',
  plannedHours: 3,
  dayIndex: 2,
  answer: 'right',
  answeredAt: 1_757_000_000_000,
})

describe('createFallbackRepository', () => {
  /**
   * The case that made this necessary.
   *
   * Configuring Supabase without applying the migration points the app at a table that
   * does not exist. Every read and write then fails, and persistence disappears silently
   * -- strictly worse than the browser storage it replaced. Falling back keeps the
   * student's week rather than punishing them for a half-finished setup.
   */
  it('falls back to the backup store when the primary cannot be reached', async () => {
    const repo = createFallbackRepository(unreachable(), createLocalRepository())
    await repo.clear()

    await repo.saveWeek(week())

    expect((await repo.loadWeek())?.start.mental).toBe(42)
  })

  it('uses the primary when it works', async () => {
    const primary = createLocalRepository()
    const backup = createLocalRepository()
    const repo = createFallbackRepository(primary, backup)
    await repo.clear()

    await repo.saveWeek(week())

    expect((await primary.loadWeek())?.start.mental).toBe(42)
  })

  it('falls back for settings too', async () => {
    const repo = createFallbackRepository(unreachable(), createLocalRepository())
    await repo.clear()

    await repo.saveSettings({ lowEnergyOverride: 'on' })

    expect((await repo.loadSettings()).lowEnergyOverride).toBe('on')
  })

  it('returns defaults when both stores are unreachable rather than throwing', async () => {
    const repo = createFallbackRepository(unreachable(), unreachable())

    expect(await repo.loadWeek()).toBeNull()
    expect(await repo.loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  // §8b: the block log degrades exactly like the week and settings do -- a broken
  // primary must not silently stop Reality Check working for anyone.
  it('falls back to the backup store for the block log too', async () => {
    const repo = createFallbackRepository(unreachable(), createLocalRepository())
    await repo.clear()

    await repo.recordBlockAnswer(record())

    expect(await repo.loadBlockLog()).toHaveLength(1)
  })

  it('returns an empty block log when both stores are unreachable rather than throwing', async () => {
    const repo = createFallbackRepository(unreachable(), unreachable())

    expect(await repo.loadBlockLog()).toEqual([])
  })

  // A silent fallback would hide a misconfiguration forever. It degrades rather than
  // failing, and says so once so the cause is findable.
  it('warns once rather than on every call', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const repo = createFallbackRepository(unreachable(), createLocalRepository())

    await repo.loadWeek()
    await repo.loadWeek()
    await repo.saveWeek(week())

    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
