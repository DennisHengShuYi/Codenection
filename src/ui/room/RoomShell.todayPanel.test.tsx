import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../../data'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'
import { RoomShell } from './RoomShell'

/**
 * Ruling 46: the panel, in the two places it lives.
 *
 * The room is full-bleed, so there is no "beside" at 320px -- and Ruling 55 forbids covering
 * the character. From 768px the panel floats over the wall; below it, it opens from a button
 * in the control row, the pattern `Waiting` already established, so a phone gains no new
 * furniture.
 *
 * jsdom has no viewport, so which of the two is VISIBLE at a given width is a question only
 * `room.spec.ts` can answer. What is checkable here is that both exist, that they are the
 * right kind of thing, and that the sheet has an address like every other destination.
 */
const dayWithWork = (): Schedule => ({
  items: [
    {
      id: 'lecture',
      title: 'WIA3001 lecture',
      type: 'mental',
      kind: 'studyBlock',
      hours: 2,
      intensity: 1,
      dayIndex: 0,
      startHour: 9,
      fixed: true,
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
  const repository = createLocalRepository(`today-panel-${counter}`)
  await repository.clear()
  await repository.saveWeek(dayWithWork())

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
}

beforeEach(() => window.history.replaceState(null, '', '/'))

describe('the panel beside the room', () => {
  it('floats beside the room, outside the drawing', async () => {
    await renderShell()

    const floating = screen.getByTestId('today-panel-floating')

    expect(floating).toBeInTheDocument()
    // Outside `role="img"`, which hides its whole subtree from a screen reader -- the whole
    // reason the panel is the control surface and the drawing is not.
    expect(screen.getByTestId('room-scene').contains(floating)).toBe(false)
  })

  it('carries a row for every object the room draws', async () => {
    await renderShell()

    const floating = screen.getByTestId('today-panel-floating')

    for (const id of ['books', 'dumbbell', 'people', 'boxes', 'bed', 'rest']) {
      expect(within(floating).getByTestId(`panel-row-${id}`)).toBeInTheDocument()
    }
  })

  it('shows what is actually on today behind the object', async () => {
    await renderShell()

    await userEvent.click(
      within(screen.getByTestId('today-panel-floating')).getByTestId('panel-row-books'),
    )

    expect(screen.getByText(/WIA3001 lecture/)).toBeVisible()
    expect(screen.getByText(/09:00/)).toBeVisible()
  })
})

describe('the panel on a phone', () => {
  it('opens from the control row, at its own address', async () => {
    await renderShell()

    await userEvent.click(screen.getByTestId('open-today'))

    expect(await screen.findByRole('dialog', { name: /today/i })).toBeVisible()
    expect(window.location.pathname).toBe('/today')
  })

  it('opens straight from a pasted address', async () => {
    window.history.replaceState(null, '', '/today')
    await renderShell()

    expect(await screen.findByRole('dialog', { name: /today/i })).toBeVisible()
  })

  it('holds the same rows the floating one does', async () => {
    await renderShell()
    await userEvent.click(screen.getByTestId('open-today'))

    const sheet = await screen.findByRole('dialog', { name: /today/i })

    expect(within(sheet).getByTestId('panel-row-books')).toBeInTheDocument()
    expect(within(sheet).getByTestId('panel-row-bed')).toBeInTheDocument()
  })
})

/**
 * §3 survived this change, which is the point of doing it this way. The room gained no
 * handlers and no tap targets; every control is out here where a keyboard can reach it.
 */
describe('the room, still a picture', () => {
  it('has no controls inside the drawing', async () => {
    await renderShell()

    const scene = screen.getByTestId('room-scene')

    expect(scene.querySelectorAll('button, a, [role="button"]')).toHaveLength(0)
  })
})
