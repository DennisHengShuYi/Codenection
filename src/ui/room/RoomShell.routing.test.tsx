import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../../data'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'
import { RoomShell } from './RoomShell'

/**
 * Where the student is, said in the address bar.
 *
 * The unit tests either side of this one prove the two halves in isolation:
 * `viewPath.test.ts` that a `View` and a path are each other's inverse, and
 * `useUrlView.test.tsx` that the hook pushes, replaces and follows Back. What only this
 * file proves is that the two are actually WIRED to the screen -- the defect this app has
 * already shipped twice, where a function was written and tested and then connected to
 * nothing.
 */
const emptyWeek = (): Schedule => ({
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

const startAt = (path: string) => window.history.replaceState(null, '', path)

const renderShell = async () => {
  counter += 1
  const repository = createLocalRepository(`routing-${counter}`)
  await repository.clear()
  await repository.saveWeek(emptyWeek())

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
}

beforeEach(() => startAt('/'))

describe('the address, while the student moves around', () => {
  it('stays at the root in the room', async () => {
    await renderShell()
    await waitFor(() => expect(screen.getByTestId('open-add')).toBeVisible())

    expect(window.location.pathname).toBe('/')
  })

  it('names the add sheet, then the way into it', async () => {
    await renderShell()
    await waitFor(() => expect(screen.getByTestId('open-add')).toBeVisible())

    await userEvent.click(screen.getByTestId('open-add'))
    expect(window.location.pathname).toBe('/add')

    await userEvent.click(screen.getByTestId('add-photo'))
    expect(window.location.pathname).toBe('/add/photo')
  })

  it('names settings, and comes back to the root when it closes', async () => {
    await renderShell()
    await waitFor(() => expect(screen.getByTestId('open-settings')).toBeVisible())

    await userEvent.click(screen.getByTestId('open-settings'))
    expect(window.location.pathname).toBe('/settings')

    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() => expect(window.location.pathname).toBe('/'))
  })

  it('names the week', async () => {
    await renderShell()
    await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())

    await userEvent.click(screen.getByTestId('open-week'))
    expect(window.location.pathname).toBe('/week')
  })

  /**
   * A block sits under the week in the address because it sits under the week in the app:
   * `RoomShell` renders the week screen behind the block sheet, and closing a block returns
   * there rather than to the room.
   */
  it('names a block underneath the week it was opened from', async () => {
    await renderShell()
    await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-week'))

    await userEvent.click(await screen.findByTestId('day-2'))
    await userEvent.click(await screen.findByTestId('block-laundry'))

    expect(window.location.pathname).toBe('/week/block/laundry')
  })

  /**
   * The whole point of the exercise: an address that was only ever a projection would not
   * survive being handed to someone else.
   */
  it('opens settings when the address already says settings', async () => {
    startAt('/settings')
    await renderShell()

    expect(await screen.findByRole('dialog', { name: /settings/i })).toBeVisible()
  })

  it('opens a sub-flow when the address already names one', async () => {
    startAt('/add/type')
    await renderShell()

    expect(await screen.findByRole('dialog', { name: /what are you carrying/i })).toBeVisible()
  })

  /** Back steps down one level rather than out of the app. */
  it('returns to the chooser when Back is pressed inside a sub-flow', async () => {
    await renderShell()
    await waitFor(() => expect(screen.getByTestId('open-add')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-add'))
    await userEvent.click(screen.getByTestId('add-photo'))

    act(() => {
      window.history.replaceState(null, '', '/add')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(await screen.findByTestId('add-photo')).toBeVisible()
  })
})

/**
 * Ruling 60: Back and close are two different promises.
 *
 * `Cancel` was making both, badly -- inside a sub-flow it dropped you at the chooser, at
 * the chooser it closed the whole thing, so the same word meant two things depending on
 * where you were standing. Back is now one level up and follows the history; close means
 * "done with this", from any depth, straight to the room.
 */
describe('Back and close, which are not the same button', () => {
  it('steps Back from a sub-flow to the chooser', async () => {
    await renderShell()
    await waitFor(() => expect(screen.getByTestId('open-add')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-add'))
    await userEvent.click(screen.getByTestId('add-photo'))

    await userEvent.click(screen.getByTestId('sheet-back'))

    expect(await screen.findByTestId('add-photo')).toBeVisible()
    await waitFor(() => expect(window.location.pathname).toBe('/add'))
  })

  it('closes from a sub-flow straight to the room, not to the chooser', async () => {
    await renderShell()
    await waitFor(() => expect(screen.getByTestId('open-add')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-add'))
    await userEvent.click(screen.getByTestId('add-photo'))

    await userEvent.click(screen.getByRole('button', { name: /close/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(window.location.pathname).toBe('/')
  })

  it('offers no Back where nothing is above, and no Cancel anywhere', async () => {
    await renderShell()
    await waitFor(() => expect(screen.getByTestId('open-add')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-add'))

    expect(screen.queryByTestId('sheet-back')).toBeNull()
    expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull()
  })

  it('steps Back from a block to the week, and closes from it to the room', async () => {
    await renderShell()
    await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(await screen.findByTestId('day-2'))
    await userEvent.click(await screen.findByTestId('block-laundry'))

    await userEvent.click(screen.getByTestId('sheet-back'))
    expect(await screen.findByRole('dialog', { name: /the week/i })).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(window.location.pathname).toBe('/')
  })
})
