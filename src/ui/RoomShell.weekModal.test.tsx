import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { RoomShell } from './room/RoomShell'

/**
 * Ruling 59: the week is a sheet like everything else, and the breakdown lives behind the
 * gauge.
 *
 * Two faults were being fixed. The week was the only destination in the app that was a
 * PAGE -- it replaced the room, carried its own "Codenection" title bar and its own
 * Settings button, and needed a "Back to the room" link to undo itself, while every other
 * destination was a sheet you dismissed. And it ended in a full dashboard -- dial, trend
 * line, five bars -- underneath a calendar, which is not what a student opening "the week"
 * came for.
 *
 * So: the week is a wide sheet holding the calendar and Rebalance, and the room's corner
 * gauge -- the compact readout that was already there -- is the door to the full one.
 */
const weekWithErrand = (): Schedule => ({
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

const renderShell = async () => {
  counter += 1
  const repository = createLocalRepository(`week-modal-${counter}`)
  await repository.clear()
  await repository.saveWeek(weekWithErrand())

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
}

beforeEach(() => window.history.replaceState(null, '', '/'))

describe('the week, as a sheet over the room', () => {
  it('opens as a dialog rather than replacing the room with a page', async () => {
    await renderShell()

    await userEvent.click(screen.getByTestId('open-week'))

    expect(await screen.findByRole('dialog', { name: /the week/i })).toBeVisible()
    // The room is still there underneath, which is what makes it a sheet and not a screen.
    expect(screen.getByTestId('room-stage')).toBeVisible()
  })

  it('holds the calendar and Rebalance', async () => {
    await renderShell()
    await userEvent.click(screen.getByTestId('open-week'))

    const sheet = await screen.findByRole('dialog', { name: /the week/i })

    expect(within(sheet).getByTestId('day-2')).toBeVisible()
    expect(within(sheet).getByTestId('rebalance')).toBeVisible()
  })

  /**
   * The title bar and the Settings button were there because this was a page and had to
   * carry the app's own furniture. A sheet does not: Settings is on the room's control row,
   * one layer behind, and the sheet's own close control is the way back.
   */
  it('carries no title bar, no Settings button and no way-back link of its own', async () => {
    await renderShell()
    await userEvent.click(screen.getByTestId('open-week'))

    const sheet = await screen.findByRole('dialog', { name: /the week/i })

    expect(within(sheet).queryByText('Codenection')).toBeNull()
    expect(within(sheet).queryByTestId('open-settings')).toBeNull()
    expect(within(sheet).queryByTestId('week-back')).toBeNull()
  })

  it('leaves the room behind when it closes', async () => {
    await renderShell()
    await userEvent.click(screen.getByTestId('open-week'))
    await screen.findByRole('dialog', { name: /the week/i })

    await userEvent.click(screen.getByRole('button', { name: /close/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(window.location.pathname).toBe('/')
  })

  /** The dashboard is not what "the week" means. It has its own door now. */
  it('no longer ends in the five-bar breakdown', async () => {
    await renderShell()
    await userEvent.click(screen.getByTestId('open-week'))
    await screen.findByRole('dialog', { name: /the week/i })

    expect(screen.queryByTestId('week-reserves')).toBeNull()
  })
})

describe('the reserves, behind the gauge', () => {
  it('opens from the room gauge, which used to be a readout and nothing more', async () => {
    await renderShell()

    await userEvent.click(screen.getByTestId('room-gauge'))

    expect(await screen.findByRole('dialog', { name: /reserves/i })).toBeVisible()
    expect(window.location.pathname).toBe('/reserves')
  })

  it('holds the dial and the breakdown the week screen used to end with', async () => {
    await renderShell()
    await userEvent.click(screen.getByTestId('room-gauge'))

    const sheet = await screen.findByRole('dialog', { name: /reserves/i })

    expect(within(sheet).getByTestId('dial-gauge')).toBeVisible()
  })

  it('opens straight from a pasted address', async () => {
    window.history.replaceState(null, '', '/reserves')
    await renderShell()

    expect(await screen.findByRole('dialog', { name: /reserves/i })).toBeVisible()
  })
})

/**
 * The consequence of everything above being a sheet over a LIVE room: the room's own
 * controls -- the gauge, `+`, whatever the visible card is offering -- are still in the
 * document behind the panel. Dimmed by the backdrop and unclickable, but reachable by Tab
 * and announced to a screen reader, which is what `aria-modal="true"` promises they are
 * not.
 *
 * `inert` on the stage is what makes that promise true: the background leaves the tab
 * order and the accessibility tree for as long as a sheet is open.
 */
describe('the room behind an open sheet', () => {
  it('goes inert while a sheet is open, and comes back when it closes', async () => {
    await renderShell()

    const stage = screen.getByTestId('room-stage')
    expect(stage).not.toHaveAttribute('inert')

    await userEvent.click(screen.getByTestId('open-week'))
    await screen.findByRole('dialog', { name: /the week/i })
    expect(stage).toHaveAttribute('inert')

    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() => expect(stage).not.toHaveAttribute('inert'))
  })

  /**
   * The other half of that, and the half a browser had to teach us: `inert` applies to a
   * whole subtree. The sheets used to be rendered INSIDE the stage, so marking it inert
   * made the panel inert too -- a modal that ignored every click made at it. jsdom
   * implements no part of `inert`, so the unit suite stayed green and `dial.spec.ts` failed
   * with "intercepts pointer events". This asserts the containment that keeps them apart.
   */
  it('renders the sheet outside the stage it makes inert', async () => {
    await renderShell()

    await userEvent.click(screen.getByTestId('open-week'))
    const sheet = await screen.findByRole('dialog', { name: /the week/i })

    expect(screen.getByTestId('room-stage').contains(sheet)).toBe(false)
  })
})
