import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { RoomShell } from './room/RoomShell'

/**
 * Photo import wired into the screen, rather than the components in isolation.
 *
 * What this covers that the component tests cannot: that accepting chips from a photo
 * actually reaches the stored week. Everything downstream -- the room, the dial, the solver
 * -- draws from stored state, so an accept that never persists would look like it worked
 * and lose the student's week on the next reload.
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
            { title: 'WIA3001 report', type: 'mental', hours: 8, deadlineDay: 9, hard: true },
          ],
        }),
    }),
  ),
)
afterEach(() => vi.unstubAllGlobals())

let counter = 0

const renderHome = async () => {
  counter += 1
  const repository = createLocalRepository(`photo-screen-${counter}`)
  await repository.clear()
  await repository.saveWeek(emptyWeek())

  render(<RoomShell repository={repository} />)
  await waitFor(() => expect(screen.getByTestId('object-desk')).toBeVisible())

  return repository
}

describe('RoomShell with photo import', () => {
  it('offers photographing something as a second way in', async () => {
    await renderHome()

    // §1.4's camera lives on the desk, named first because it ranks above typing.
    await userEvent.click(screen.getByTestId('object-desk'))
    expect(screen.getByTestId('desk-photograph')).toBeVisible()
  })

  it('comes back without changing anything when cancelled', async () => {
    const repository = await renderHome()

    await userEvent.click(screen.getByTestId('object-desk'))
    await userEvent.click(screen.getByTestId('desk-photograph'))
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await userEvent.click(screen.getByTestId('zoom-back'))

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    expect((await repository.loadWeek())?.items).toHaveLength(0)
  })

  // The point of the whole unit.
  it('accepted items from a photo reach the saved week', async () => {
    const repository = await renderHome()

    await userEvent.click(screen.getByTestId('object-desk'))
    await userEvent.click(screen.getByTestId('desk-photograph'))
    await userEvent.upload(
      screen.getByTestId('photo-input'),
      new File([new Uint8Array(64)], 'brief.jpg', { type: 'image/jpeg' }),
    )
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(1))
    expect(screen.getByTestId('room-scene')).toBeVisible()
  })

  // Both input paths sit together, so neither is buried behind the other.
  /**
   * Both ways in live on the desk, and neither is chosen for the student. §1.4 ranks the
   * camera above typing, so it is named first -- but the typing path has to stay reachable,
   * because it is the one that works with no key configured.
   */
  it('keeps the typing path alongside the camera', async () => {
    await renderHome()

    await userEvent.click(screen.getByTestId('object-desk'))

    expect(screen.getByTestId('desk-photograph')).toBeVisible()
    expect(screen.getByTestId('desk-type')).toBeVisible()
  })
})
