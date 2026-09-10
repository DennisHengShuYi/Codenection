import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createLocalRepository, DEFAULT_SETTINGS } from '../data'
import { DEFAULT_PROFILE, type CalibrationProfile } from '../domain/calibration'
import { umBlockLog } from '../fixtures/umBlockLog'
import { useProfile } from './useProfile'

let counter = 0

const repo = () => {
  counter += 1
  return createLocalRepository(`use-profile-${counter}`)
}

describe('useProfile', () => {
  it('falls back to a seeded profile with resolved predictions on first run', async () => {
    const repository = repo()
    await repository.clear()

    const { result } = renderHook(() => useProfile(repository))

    await waitFor(() => expect(result.current.profile.predictions.length).toBeGreaterThan(0))
  })

  it('seeds the block log on first run, so Reality Check has samples from a fresh install', async () => {
    const repository = repo()
    await repository.clear()

    renderHook(() => useProfile(repository))

    // Every seeded record, not just "more than zero" -- that weaker assertion passed even
    // when a concurrent-write bug dropped all but one of them (see repositoryContract.ts's
    // "lands every record from concurrent recordBlockAnswer calls"). The record count comes
    // from the fixture itself, so this keeps asserting the real thing if it grows.
    const seeded = umBlockLog('2026-01-01').length
    await waitFor(async () => expect((await repository.loadBlockLog()).length).toBe(seeded))
  })

  it('returns a saved profile untouched, rather than overwriting it with the seed', async () => {
    const repository = repo()
    await repository.clear()
    const saved: CalibrationProfile = {
      ...DEFAULT_PROFILE,
      predictions: [{ forDate: '2026-09-01', predicted: 55, reported: null }],
    }
    await repository.saveSettings({ ...DEFAULT_SETTINGS, calibration: saved })

    const { result } = renderHook(() => useProfile(repository))

    await waitFor(() => expect(result.current.profile.predictions).toEqual(saved.predictions))
  })

  /**
   * Task 17, "backwards compatibility that must hold": a profile saved before this task
   * shrank `CalibrationProfile` still carries `mode`, `focus`, `semesterBreak`,
   * `peakStartHour`, `painted`, `modeChosen` and `calibratedDays` in storage -- nobody
   * migrates old settings blobs on write. The loader must keep working on that shape
   * rather than reject it, because `DEFAULT_SETTINGS`/`useProfile` are the only place that
   * shape is ever read back into the running app.
   */
  it('still loads a profile saved before the calibration shrink, unknown keys and all', async () => {
    const repository = repo()
    await repository.clear()
    const legacy = {
      predictions: [{ forDate: '2026-09-01', predicted: 40, reported: 35 }],
      mode: 'working',
      focus: 'longer',
      semesterBreak: true,
      peakStartHour: 9,
      sleepBaselineHours: 7,
      confirmations: [{ type: 'mental', plannedHours: 2, actualHours: 3 }],
      confirmedItemIds: ['some-block'],
      calibratedDays: 12,
      modeChosen: true,
      painted: true,
    }
    await repository.saveSettings({
      ...DEFAULT_SETTINGS,
      calibration: legacy as unknown as CalibrationProfile,
    })

    const { result } = renderHook(() => useProfile(repository))

    // The app keeps working: the one field it still reads resolves correctly, and nothing
    // throws trying to read the rest.
    await waitFor(() =>
      expect(result.current.profile.predictions).toEqual([
        { forDate: '2026-09-01', predicted: 40, reported: 35 },
      ]),
    )
  })

  it('does not reseed the block log when one already exists', async () => {
    const repository = repo()
    await repository.clear()
    await repository.recordBlockAnswer({
      blockId: 'existing',
      type: 'mental',
      plannedHours: 2,
      dayIndex: 0,
      answer: 'right',
      answeredAt: Date.now(),
    })

    renderHook(() => useProfile(repository))

    // Give any (wrongly) fired seed a chance to land before asserting it didn't.
    await waitFor(async () => expect((await repository.loadBlockLog()).length).toBe(1))
  })

  it('writes back a changed profile', async () => {
    const repository = repo()
    await repository.clear()

    const { result } = renderHook(() => useProfile(repository))
    await waitFor(() => expect(result.current.profile.predictions.length).toBeGreaterThan(0))

    const next = { ...result.current.profile, predictions: [] }
    result.current.setProfile(next)

    await waitFor(async () => expect((await repository.loadSettings()).calibration?.predictions).toEqual([]))
  })
})
