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

/**
 * Rebalance used to solve the week, write it, and then say what it had done. A student who
 * disagreed with one of the moves had no moment at which to say so.
 *
 * These run against the whole shell rather than the preview component, because the point
 * being tested is exactly that the solve does NOT reach the schedule until approved -- and
 * no component-level test can see that.
 */
describe('rebalance, which now asks first', () => {
  it('opens the proposal instead of changing the week', async () => {
    await renderShell()
    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(screen.getByTestId('rebalance'))

    expect(await screen.findByRole('dialog', { name: /what i'd change/i })).toBeVisible()
    expect(window.location.pathname).toBe('/week/rebalance')
  })

  it('says nothing about what it did while it is still only an offer', async () => {
    await renderShell()
    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(screen.getByTestId('rebalance'))
    await screen.findByTestId('approve-rebalance')

    expect(screen.queryByTestId('rebalance-report')).toBeNull()
  })

  it('leaves the week alone when the proposal is discarded', async () => {
    await renderShell()
    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(screen.getByTestId('rebalance'))
    await userEvent.click(await screen.findByTestId('discard-rebalance'))

    expect(await screen.findByRole('dialog', { name: /the week/i })).toBeVisible()
    // The report is the app's own record that a rebalance happened. Its absence is the
    // observable difference between a discarded proposal and an approved one.
    expect(screen.queryByTestId('rebalance-report')).toBeNull()
    expect(window.location.pathname).toBe('/week')
  })

  it('reports what it did, once approved', async () => {
    await renderShell()
    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(screen.getByTestId('rebalance'))
    await userEvent.click(await screen.findByTestId('approve-rebalance'))

    expect(await screen.findByTestId('rebalance-report')).toHaveTextContent(/^I /)
    expect(window.location.pathname).toBe('/week')
  })

  /**
   * A proposal is about a moment, not a place. A reload, a pasted link, or a Back into a
   * discarded one all arrive here with nothing to approve -- and the same rule `fromPath`
   * applies to an address it does not recognise applies: land somewhere real and correct
   * the bar, rather than assert a state the app is not in.
   */
  it('lands on the week when a proposal address is opened cold', async () => {
    window.history.replaceState(null, '', '/week/rebalance')
    await renderShell()

    expect(await screen.findByRole('dialog', { name: /the week/i })).toBeVisible()
    expect(window.location.pathname).toBe('/week')
  })
})

/**
 * The picker `blockActions` recorded as missing, reached from both its doors.
 *
 * Run against the whole shell rather than the form alone: what is being tested is that the
 * change reaches the schedule and comes back out on the grid, which is the half a
 * component-level test cannot see.
 */
describe('editing the week by hand', () => {
  const openTheOnlyBlock = async () => {
    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(await screen.findByTestId('day-2'))
    await userEvent.click(await screen.findByTestId('block-laundry'))
  }

  it('opens the edit form at its own address', async () => {
    await renderShell()
    await openTheOnlyBlock()
    await userEvent.click(screen.getByTestId('edit-block'))

    expect(await screen.findByRole('dialog', { name: /edit this block/i })).toBeVisible()
    expect(window.location.pathname).toBe('/week/block/laundry/edit')
  })

  it('writes the change back into the week', async () => {
    await renderShell()
    await openTheOnlyBlock()
    await userEvent.click(screen.getByTestId('edit-block'))

    const name = await screen.findByLabelText('What')
    await userEvent.clear(name)
    await userEvent.type(name, 'Renamed by hand')
    await userEvent.click(screen.getByTestId('save-block'))

    expect(await screen.findByRole('dialog', { name: /the week/i })).toBeVisible()
    await userEvent.click(await screen.findByTestId('day-2'))
    expect(await screen.findByTestId('block-laundry')).toHaveTextContent('Renamed by hand')
  })

  it('takes a removed block out of the week', async () => {
    await renderShell()
    await openTheOnlyBlock()

    await userEvent.click(screen.getByTestId('remove-block'))
    await userEvent.click(screen.getByTestId('confirm-remove-yes'))

    expect(await screen.findByRole('dialog', { name: /the week/i })).toBeVisible()
    await userEvent.click(await screen.findByTestId('day-2'))
    expect(screen.queryByTestId('block-laundry')).toBeNull()
  })

  it('adds a block where the student put it', async () => {
    await renderShell()
    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(await screen.findByTestId('day-4'))
    await userEvent.click(await screen.findByTestId('add-block'))

    expect(await screen.findByRole('dialog', { name: /add a block/i })).toBeVisible()
    expect(window.location.pathname).toBe('/week/new/4')

    await userEvent.type(screen.getByLabelText('What'), 'Coffee with Sam')
    await userEvent.click(screen.getByTestId('save-block'))

    expect(await screen.findByRole('dialog', { name: /the week/i })).toBeVisible()
    await userEvent.click(await screen.findByTestId('day-4'))
    expect(await screen.findByText('Coffee with Sam')).toBeVisible()
  })

  // The same stale-id case `blockSheet` already handles by closing: land somewhere real
  // rather than render a form over a block that is not there.
  it('lands on the week when an edit address names a block that is gone', async () => {
    window.history.replaceState(null, '', '/week/block/no-such-block/edit')
    await renderShell()

    expect(await screen.findByRole('dialog', { name: /the week/i })).toBeVisible()
    expect(window.location.pathname).toBe('/week')
  })
})
