import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Repository, type StoredSettings } from '../data'
import type { Ladder } from '../domain/ladder'
import { useLadders } from './useLadders'

const ladder = (blockId: string, done = 0): Ladder => ({
  blockId,
  rungs: [
    { action: 'first', minutes: 2 },
    { action: 'second', minutes: 3 },
    { action: 'third', minutes: 4 },
  ],
  done,
})

const repoWith = (settings: StoredSettings) => {
  const saveSettings = vi.fn<(next: StoredSettings) => Promise<void>>().mockResolvedValue(undefined)

  const repo = {
    loadWeek: vi.fn().mockResolvedValue(null),
    saveWeek: vi.fn().mockResolvedValue(undefined),
    loadSettings: vi.fn().mockResolvedValue(settings),
    saveSettings,
    loadBlockLog: vi.fn().mockResolvedValue([]),
    recordBlockAnswer: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  } as unknown as Repository

  return { repo, saveSettings }
}

describe('useLadders', () => {
  it('loads the ladders already stored', async () => {
    const { repo } = repoWith({ ...DEFAULT_SETTINGS, ladders: [ladder('b1', 2)] })
    const { result } = renderHook(() => useLadders(repo))

    await waitFor(() => expect(result.current.ladders).toHaveLength(1))
    expect(result.current.ladders[0]?.done).toBe(2)
  })

  // No migration: settings written before this feature have no `ladders` field at all and
  // must keep loading rather than taking the screen down.
  it('loads settings written before ladders existed', async () => {
    const { repo } = repoWith({ lowEnergyOverride: 'auto' })
    const { result } = renderHook(() => useLadders(repo))

    await waitFor(() => expect(result.current.ladders).toEqual([]))
  })

  it('keeps working when storage cannot be read', async () => {
    const { repo } = repoWith(DEFAULT_SETTINGS)
    vi.mocked(repo.loadSettings).mockRejectedValue(new Error('no storage'))

    const { result } = renderHook(() => useLadders(repo))

    await waitFor(() => expect(result.current.ladders).toEqual([]))
  })

  it('writes a new ladder back to settings', async () => {
    const { repo, saveSettings } = repoWith(DEFAULT_SETTINGS)
    const { result } = renderHook(() => useLadders(repo))

    await waitFor(() => expect(repo.loadSettings).toHaveBeenCalled())
    act(() => result.current.saveLadder(ladder('b1')))

    await waitFor(() => expect(saveSettings).toHaveBeenCalled())
    expect(saveSettings.mock.calls.at(-1)?.[0].ladders).toEqual([ladder('b1')])
  })

  // The blob is shared with useProfile and useLowEnergy, so the write starts from a fresh
  // read rather than from whatever this hook happens to be holding.
  it('writes over a fresh read of the settings blob', async () => {
    const { repo, saveSettings } = repoWith({ ...DEFAULT_SETTINGS, lowEnergyOverride: 'on' })
    const { result } = renderHook(() => useLadders(repo))

    await waitFor(() => expect(repo.loadSettings).toHaveBeenCalled())
    act(() => result.current.saveLadder(ladder('b1')))

    await waitFor(() => expect(saveSettings).toHaveBeenCalled())
    expect(saveSettings.mock.calls.at(-1)?.[0].lowEnergyOverride).toBe('on')
  })

  // Upsert, not append. Advancing a rung saves the same ladder again, and a second copy
  // would leave two disagreeing records of where the student got to.
  it('replaces a ladder for a block it already has', async () => {
    const { repo } = repoWith({ ...DEFAULT_SETTINGS, ladders: [ladder('b1', 0)] })
    const { result } = renderHook(() => useLadders(repo))

    await waitFor(() => expect(result.current.ladders).toHaveLength(1))
    act(() => result.current.saveLadder(ladder('b1', 1)))

    await waitFor(() => expect(result.current.ladders).toHaveLength(1))
    expect(result.current.ladders[0]?.done).toBe(1)
  })

  it('drops the ladder for a block that is gone', async () => {
    const { repo } = repoWith({ ...DEFAULT_SETTINGS, ladders: [ladder('b1'), ladder('b2')] })
    const { result } = renderHook(() => useLadders(repo))

    await waitFor(() => expect(result.current.ladders).toHaveLength(2))
    act(() => result.current.dropLadder('b1'))

    await waitFor(() => expect(result.current.ladders).toHaveLength(1))
    expect(result.current.ladders[0]?.blockId).toBe('b2')
  })

  // Applied on screen whether or not it persists, exactly as `useLowEnergy` does: a student
  // who ticks a step must see the next one even if the write fails.
  it('advances on screen even when the write fails', async () => {
    const { repo, saveSettings } = repoWith(DEFAULT_SETTINGS)
    saveSettings.mockRejectedValue(new Error('no storage'))

    const { result } = renderHook(() => useLadders(repo))
    await waitFor(() => expect(repo.loadSettings).toHaveBeenCalled())

    act(() => result.current.saveLadder(ladder('b1', 1)))

    await waitFor(() => expect(result.current.ladders).toHaveLength(1))
  })
})
