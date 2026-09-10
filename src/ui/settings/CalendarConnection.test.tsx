import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CalendarConnection } from './CalendarConnection'

const connected = vi.fn<() => Promise<boolean>>()
const disconnect = vi.fn<() => Promise<boolean>>()

vi.mock('../../google/connection', () => ({ hasCalendarConnected: () => connected() }))
vi.mock('../../google/client', () => ({ disconnectCalendar: () => disconnect() }))

beforeEach(() => {
  // Reset as well as re-stubbed: `mockResolvedValue` replaces the behaviour but keeps the
  // call history, so without this a test asserting "was never called" reads the previous
  // test's calls and fails for a reason that has nothing to do with it.
  connected.mockReset().mockResolvedValue(true)
  disconnect.mockReset().mockResolvedValue(true)
})

/**
 * Withdrawing calendar access, which ships with the feature rather than after it.
 *
 * Asking somebody for standing access to their calendar without an in-app way to take it
 * back is not a thing to do. It sits in settings beside the Telegram unlink, for the same
 * reason and in the same place.
 */
describe('CalendarConnection', () => {
  it('says when a calendar is connected', async () => {
    render(<CalendarConnection />)

    expect(await screen.findByTestId('calendar-disconnect')).toBeVisible()
  })

  /** Nothing to withdraw, so nothing offered -- and no button that would fail if pressed. */
  it('offers nothing to disconnect when nothing is connected', async () => {
    connected.mockResolvedValue(false)
    render(<CalendarConnection />)

    await waitFor(() => expect(screen.getByTestId('calendar-none')).toBeVisible())
    expect(screen.queryByTestId('calendar-disconnect')).toBeNull()
  })

  /**
   * Withdrawing access is not a thing to do on a mis-tap, and it cannot be undone without
   * going through Google's consent screen again -- so it asks first, as every other
   * irreversible action in this app does.
   */
  it('asks before withdrawing anything', async () => {
    render(<CalendarConnection />)

    await userEvent.click(await screen.findByTestId('calendar-disconnect'))

    expect(disconnect).not.toHaveBeenCalled()
    expect(screen.getByTestId('calendar-confirm')).toBeVisible()
  })

  it('says what withdrawing will and will not do before it happens', async () => {
    render(<CalendarConnection />)

    await userEvent.click(await screen.findByTestId('calendar-disconnect'))

    // Both halves matter: the permission goes, and the blocks already imported stay. A
    // student who thinks this deletes their week will not press it.
    expect(screen.getByText(/blocks you already added stay/i)).toBeVisible()
  })

  it('withdraws when confirmed', async () => {
    render(<CalendarConnection />)

    await userEvent.click(await screen.findByTestId('calendar-disconnect'))
    await userEvent.click(screen.getByTestId('calendar-confirm'))

    await waitFor(() => expect(disconnect).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.getByTestId('calendar-none')).toBeVisible())
  })

  it('changes nothing when the student backs out', async () => {
    render(<CalendarConnection />)

    await userEvent.click(await screen.findByTestId('calendar-disconnect'))
    await userEvent.click(screen.getByRole('button', { name: /keep it/i }))

    expect(disconnect).not.toHaveBeenCalled()
    expect(screen.getByTestId('calendar-disconnect')).toBeVisible()
  })

  /**
   * A failed withdrawal must not report success. The endpoint leaves the row in place when
   * Google refuses, so both sides still agree -- and a student told "disconnected" who is
   * not would never think to check.
   */
  it('says so plainly when it could not withdraw the permission', async () => {
    disconnect.mockResolvedValue(false)
    render(<CalendarConnection />)

    await userEvent.click(await screen.findByTestId('calendar-disconnect'))
    await userEvent.click(screen.getByTestId('calendar-confirm'))

    await waitFor(() => expect(screen.getByTestId('calendar-problem')).toBeVisible())
    expect(screen.getByTestId('calendar-disconnect')).toBeVisible()
  })

  /** However it goes, the student is told where the permission ultimately lives -- Google's
   *  own account page is the one place it can always be removed. */
  it('names where the permission can always be removed', async () => {
    render(<CalendarConnection />)

    await userEvent.click(await screen.findByTestId('calendar-disconnect'))

    expect(screen.getByText(/myaccount\.google\.com/i)).toBeVisible()
  })
})
