import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { RoomShell } from './room/RoomShell'

/**
 * The planner wired into the screen, rather than the component in isolation.
 *
 * What this covers that `PlannerScreen.test.tsx` cannot: that accepting chips typed into
 * the `+` sheet's typing way actually reaches the stored week. The endpoint is stubbed
 * unreachable, so this exercises the rule-based path.
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

const openPlanner = async () => {
  counter += 1
  const repository = createLocalRepository(`planner-screen-${counter}`)
  await repository.clear()
  await repository.saveWeek(emptyWeek())

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('open-add')).toBeVisible())
  await userEvent.click(screen.getByTestId('open-add'))
  await userEvent.click(screen.getByTestId('add-type'))

  return repository
}

describe('RoomShell with the planner', () => {
  it('opens the planner and can come back without changing anything', async () => {
    const repository = await openPlanner()

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.getByTestId('add-type')).toBeVisible())

    expect((await repository.loadWeek())?.items).toHaveLength(0)
  })

  // The point of the whole unit: accepted chips become the student's real, stored week.
  it('accepted items reach the saved week', async () => {
    const repository = await openPlanner()

    await userEvent.type(screen.getByLabelText(/on your mind/i), 'gym, laundry')
    await userEvent.click(screen.getByRole('button', { name: /read this/i }))
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(2))

    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByTestId('room-scene')).toBeVisible()
  })

  /**
   * §16: never silently reshuffle. A student who adds something and finds their week
   * quietly rearranged has lost their grip on it, so the app says what it did and offers
   * anything further as a choice.
   */
  it('says what it did with what was added', async () => {
    await openPlanner()

    await userEvent.type(screen.getByLabelText(/on your mind/i), 'gym, laundry')
    await userEvent.click(screen.getByRole('button', { name: /read this/i }))
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(2))

    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    await waitFor(() => expect(screen.getByTestId('placement-note')).toBeVisible())
    expect(screen.getByTestId('placement-note')).toHaveTextContent(/Added/)
  })

  /** A week that simply absorbed the new work has nothing to apologise for and nothing to
   *  offer, so no move is proposed. */
  it('offers no move when nothing had to give', async () => {
    await openPlanner()

    await userEvent.type(screen.getByLabelText(/on your mind/i), 'laundry')
    await userEvent.click(screen.getByRole('button', { name: /read this/i }))
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    await waitFor(() => expect(screen.getByTestId('placement-note')).toBeVisible())
    expect(screen.queryByTestId('placement-do')).toBeNull()
  })

  /** "Leave it" is the healthy default: doing nothing keeps the week the student decided
   *  on, which is the principle underneath provisional yes pointed at placement. */
  it('leaves the week exactly as it was when the offer is declined', async () => {
    const repository = await openPlanner()

    await userEvent.type(screen.getByLabelText(/on your mind/i), 'gym, laundry')
    await userEvent.click(screen.getByRole('button', { name: /read this/i }))
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(2))
    await userEvent.click(screen.getByRole('button', { name: /add these/i }))
    await waitFor(() => expect(screen.getByTestId('placement-note')).toBeVisible())

    const settled = (await repository.loadWeek())?.items.map((item) => ({
      id: item.id,
      dayIndex: item.dayIndex,
      startHour: item.startHour,
    }))

    const leave = screen.queryByTestId('placement-leave')
    if (leave !== null) await userEvent.click(leave)

    expect(
      (await repository.loadWeek())?.items.map((item) => ({
        id: item.id,
        dayIndex: item.dayIndex,
        startHour: item.startHour,
      })),
    ).toEqual(settled)
  })
})
