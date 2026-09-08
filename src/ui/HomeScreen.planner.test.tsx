import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { HomeScreen } from './HomeScreen'

/**
 * The planner wired into the screen, rather than the components in isolation.
 *
 * What this covers that the component tests cannot: that accepting chips actually reaches
 * the stored week. Everything downstream -- the room, the dial, the solver -- draws from
 * that, so an accept that never persists would look like it worked and lose the student's
 * week the moment they reload.
 *
 * The endpoint is stubbed unreachable, so this exercises the rule-based path.
 */
beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no endpoint'))))
afterEach(() => vi.unstubAllGlobals())

const emptyWeek = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

let counter = 0

const renderHome = async () => {
  counter += 1
  const repository = createLocalRepository(`planner-screen-${counter}`)
  await repository.clear()
  await repository.saveWeek(emptyWeek())

  render(<HomeScreen repository={repository} />)
  await waitFor(() => expect(screen.getByTestId('open-planner')).toBeVisible())

  return repository
}

describe('HomeScreen with the planner', () => {
  it('offers a way to say what you are carrying', async () => {
    await renderHome()

    expect(screen.getByTestId('open-planner')).toBeVisible()
  })

  it('opens the planner and can come back without changing anything', async () => {
    const repository = await renderHome()

    await userEvent.click(screen.getByTestId('open-planner'))
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    expect((await repository.loadWeek())?.items).toHaveLength(0)
  })

  // The point of the whole unit: accepted chips become the student's real, stored week.
  it('accepted items reach the saved week', async () => {
    const repository = await renderHome()

    await userEvent.click(screen.getByTestId('open-planner'))
    await userEvent.type(screen.getByLabelText(/on your mind/i), 'gym, laundry')
    await userEvent.click(screen.getByRole('button', { name: /read this/i }))
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(2))

    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(2))
    expect(screen.getByTestId('room-scene')).toBeVisible()
  })
})
