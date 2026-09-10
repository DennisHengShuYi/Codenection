import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { RoomShell } from './room/RoomShell'

/**
 * Photo import wired into the screen, rather than the component in isolation.
 *
 * What this covers that `PhotoImportScreen.test.tsx` cannot: that accepting chips from a
 * photo, reached through the `+` sheet's photograph way, actually reaches the stored week.
 */
const emptyWeek = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          items: [
            {
              title: 'WIA3001 report',
              type: 'mental',
              kind: 'studyBlock',
              hours: 8,
              deadlineDay: 9,
              hard: true,
            },
          ],
        }),
    }),
  ),
)
afterEach(() => vi.unstubAllGlobals())

let counter = 0

const openPhoto = async () => {
  counter += 1
  const repository = createLocalRepository(`photo-screen-${counter}`)
  await repository.clear()
  await repository.saveWeek(emptyWeek())

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('open-add')).toBeVisible())
  await userEvent.click(screen.getByTestId('open-add'))
  await userEvent.click(screen.getByTestId('add-photo'))

  return repository
}

describe('RoomShell with photo import', () => {
  it('comes back without changing anything when cancelled', async () => {
    const repository = await openPhoto()

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.getByTestId('add-photo')).toBeVisible())

    expect((await repository.loadWeek())?.items).toHaveLength(0)
  })

  // The point of the whole unit.
  it('accepted items from a photo reach the saved week', async () => {
    const repository = await openPhoto()

    await userEvent.upload(
      screen.getByTestId('photo-input'),
      new File([new Uint8Array(64)], 'brief.jpg', { type: 'image/jpeg' }),
    )
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByTestId('room-scene')).toBeVisible()
  })
})
