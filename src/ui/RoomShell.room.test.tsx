import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { RoomShell } from './room/RoomShell'

/**
 * The room wired into the screen, rather than the components in isolation.
 *
 * What this covers that the component tests cannot: that a tap reaches the panel, and
 * that acting on a clutter box actually changes the stored week. §1.3 asks for "real
 * model consequences", and only this level shows whether they arrive.
 */
const weekWithErrands = (): Schedule => ({
  items: [
    {
      id: 'laundry',
      title: 'Laundry',
      type: 'errands',
      kind: 'errands',
      hours: 1,
      intensity: 1,
      dayIndex: 2,
      startHour: 17,
      fixed: false,
      deadlineDay: null,
      protectedRest: false,
    },
  ],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

let counter = 0

const renderWithErrand = async () => {
  counter += 1
  const repository = createLocalRepository(`room-screen-${counter}`)
  await repository.clear()
  await repository.saveWeek(weekWithErrands())

  render(<RoomShell repository={repository} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

  return repository
}

describe('RoomShell with the room', () => {
  // §1.1: the room is the surface, the dial a compact readout beside it.
  it('leads with the room and keeps the dial as a compact readout', async () => {
    await renderWithErrand()

    /**
     * §1.1: the room is the surface. The dial is no longer a panel beside it -- it lives
     * behind the light, which already means the reserve. It is still one tap away and still
     * carries §1.2's five bars, which the next test checks.
     */
    expect(screen.getByTestId('room-scene')).toBeVisible()
    expect(screen.getByTestId('object-light')).toHaveAccessibleName(/reserve/i)
  })

  // Nothing from the glance layer is lost when the room takes the lead.
  it('still shows the five domain bars and the spoken summary', async () => {
    await renderWithErrand()

    await userEvent.click(screen.getByTestId('object-light'))

    expect(screen.getAllByRole('meter')).toHaveLength(5)
    expect(screen.getByTestId('reserve-text-equivalent')).toBeVisible()
  })

  it('opens an object when it is tapped', async () => {
    await renderWithErrand()

    await userEvent.click(screen.getByTestId('object-plant'))

    expect(await screen.findByRole('dialog')).toHaveTextContent(/sleep and movement/i)
  })

  it('closes the panel again', async () => {
    await renderWithErrand()
    await userEvent.click(screen.getByTestId('object-plant'))
    await screen.findByRole('dialog')

    await userEvent.click(screen.getByTestId('zoom-back'))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  // The point of the whole unit: an errand marked done leaves the real week.
  it('completing an errand removes it from the saved week', async () => {
    const repository = await renderWithErrand()

    await userEvent.click(screen.getByTestId('object-clutter-laundry'))
    await userEvent.click(await screen.findByRole('button', { name: /done/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(0))
  })

  it('deferring an errand moves it later in the saved week', async () => {
    const repository = await renderWithErrand()

    await userEvent.click(screen.getByTestId('object-clutter-laundry'))
    await userEvent.click(await screen.findByRole('button', { name: /later/i }))

    await waitFor(async () =>
      expect((await repository.loadWeek())?.items[0]?.dayIndex).toBeGreaterThan(2),
    )
  })
})
