import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { RoomShell } from './room/RoomShell'

/**
 * Ruling 61: the room is the drawing again.
 *
 * The band under it had grown to five things stacked one on another -- the preview notice,
 * the room said in words, the accuracy line, the three-week-outlook disclaimer and however
 * many live cards were firing -- over a character whose whole job is to say how the student
 * is doing. Four of those five are things to READ, and reading them is not why anyone opens
 * this app; the fifth is a card that wants a decision. All of it now waits behind one
 * button, which says how much is there.
 *
 * The exception is §1.5. A student below the threshold gets the collapsed interface -- one
 * number and one action -- and a card behind a button is not an action they have been
 * handed. At low energy the card stays where it was and there is no button at all.
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

const renderShell = async (over?: Partial<Schedule>) => {
  counter += 1
  const repository = createLocalRepository(`notices-${counter}`)
  await repository.clear()
  await repository.saveWeek({ ...weekWithErrand(), ...over })

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
}

beforeEach(() => window.history.replaceState(null, '', '/'))

describe('the room, with its band behind a button', () => {
  it('shows the drawing and its controls, and nothing stacked underneath', async () => {
    await renderShell()

    expect(screen.queryByTestId('room-band')).toBeNull()
    expect(screen.queryByTestId('room-text-equivalent')).toBeNull()
    expect(screen.queryByTestId('accuracy-note')).toBeNull()

    // What remains is the room itself and the ways out of it.
    expect(screen.getByTestId('room-scene')).toBeVisible()
    expect(screen.getByTestId('room-gauge')).toBeVisible()
    expect(screen.getByTestId('open-add')).toBeVisible()
  })

  it('opens what is waiting from the control row, at its own address', async () => {
    await renderShell()

    await userEvent.click(screen.getByTestId('open-notices'))

    const sheet = await screen.findByRole('dialog', { name: /waiting/i })
    expect(window.location.pathname).toBe('/notices')
    expect(within(sheet).getByTestId('room-text-equivalent')).toBeVisible()
    expect(within(sheet).getByTestId('accuracy-note')).toBeVisible()
  })

  it('carries the live cards, which is the part that wanted a decision', async () => {
    await renderShell()

    await userEvent.click(screen.getByTestId('open-notices'))

    const sheet = await screen.findByRole('dialog', { name: /waiting/i })
    expect(within(sheet).getByRole('region', { name: /today's check-in/i })).toBeVisible()
  })

  /**
   * A button that only ever says "waiting" gives the student no reason to press it or to
   * leave it alone. The count is what makes ignoring it safe.
   *
   * The live cards and nothing else. The paragraph and the accuracy line are always
   * present, and a badge that reads the same on a quiet week as on a bad one teaches the
   * student to ignore it; the preview notice is not counted either, because it is not
   * behind the button at all -- see below.
   */
  it('says how many things are waiting, rather than only that something is', async () => {
    await renderShell()

    expect(screen.getByTestId('notices-count')).toHaveTextContent('1')
    expect(screen.getByTestId('open-notices')).toHaveAccessibleName(/1 waiting/i)
  })

  /**
   * The one thing that does NOT go behind the button.
   *
   * "This week is not being saved" is a warning about losing work, and a warning about
   * losing work that a student has to press something to find is a warning that arrives
   * after the loss. It sits on the room itself, after the last control, where it is read
   * without being asked for.
   */
  it('keeps the preview warning on the room, after the controls, rather than behind them', async () => {
    await renderShell()

    const banner = screen.getByTestId('preview-banner')
    expect(banner).toBeVisible()
    expect(screen.getByTestId('room-stage')).toContainElement(banner)

    const add = screen.getByTestId('open-add')
    expect(
      Boolean(add.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true)
  })

  it('does not repeat the preview warning inside the sheet', async () => {
    await renderShell()

    await userEvent.click(screen.getByTestId('open-notices'))
    const sheet = await screen.findByRole('dialog', { name: /waiting/i })

    expect(within(sheet).queryByTestId('preview-banner')).toBeNull()
  })

  it('opens straight from a pasted address', async () => {
    window.history.replaceState(null, '', '/notices')
    await renderShell()

    expect(await screen.findByRole('dialog', { name: /waiting/i })).toBeVisible()
  })
})
