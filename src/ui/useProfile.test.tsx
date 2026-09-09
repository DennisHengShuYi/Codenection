import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createLocalRepository, DEFAULT_SETTINGS } from '../data'
import { DEFAULT_PROFILE, type CalibrationProfile } from '../domain/calibration'
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

    await waitFor(async () => expect((await repository.loadBlockLog()).length).toBeGreaterThan(0))
  })

  it('returns a saved profile untouched, rather than overwriting it with the seed', async () => {
    const repository = repo()
    await repository.clear()
    const saved: CalibrationProfile = { ...DEFAULT_PROFILE, mode: 'working' }
    await repository.saveSettings({ ...DEFAULT_SETTINGS, calibration: saved })

    const { result } = renderHook(() => useProfile(repository))

    await waitFor(() => expect(result.current.profile.mode).toBe('working'))
    expect(result.current.profile.predictions).toEqual([])
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

    result.current.setProfile({ ...result.current.profile, mode: 'working' })

    await waitFor(async () => expect((await repository.loadSettings()).calibration?.mode).toBe('working'))
  })
})
