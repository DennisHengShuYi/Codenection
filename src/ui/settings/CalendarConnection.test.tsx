import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CalendarConnection } from './CalendarConnection'

const connected = vi.fn<() => Promise<boolean>>()
const disconnect = vi.fn<() => Promise<boolean>>()
const begin = vi.fn<() => Promise<{ ok: boolean; reason?: string }>>()

vi.mock('../../google/connection', () => ({ hasCalendarConnected: () => connected() }))
vi.mock('../../google/client', () => ({
  disconnectCalendar: () => disconnect(),
  beginConnect: () => begin(),
}))

beforeEach(() => {
  // Reset as well as re-stubbed: `mockResolvedValue` replaces the behaviour but keeps the
  // call history, so without this a test asserting "was never called" reads the previous
  // test's calls and fails for a reason that has nothing to do with it.
  connected.mockReset().mockResolvedValue(true)
  disconnect.mockReset().mockResolvedValue(true)
  begin.mockReset().mockResolvedValue({ ok: true })
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

  /** Nothing to withdraw, so nothing offered -- and no button that would fail if pressed.
   *  What stands in its place is the connect card, which is the point of this screen now. */
  it('offers nothing to disconnect when nothing is connected', async () => {
    connected.mockResolvedValue(false)
    render(<CalendarConnection />)

    await waitFor(() => expect(screen.getByTestId('calendar-connect')).toBeVisible())
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
    // Back to the offer to connect, in place, rather than to a sentence pointing elsewhere.
    await waitFor(() => expect(screen.getByTestId('calendar-connect')).toBeVisible())
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

/**
 * Connecting, from the place a student goes to connect things.
 *
 * This card said "No calendar connected. You can connect one from the + button" and stopped
 * there -- a sentence pointing at another screen, in a panel whose neighbour offers Link
 * Telegram in place. A student looking for their integrations found one they could act on
 * and one they had to be told where to find.
 *
 * The same door either way: `beginConnect` is what the import screen presses too, so there is
 * one consent flow rather than two that can drift. It navigates to Google on success, which
 * is why nothing here reports one -- the page is leaving.
 */
describe('connecting from settings', () => {
  it('offers to connect when nothing is connected', async () => {
    connected.mockResolvedValue(false)
    render(<CalendarConnection />)

    expect(await screen.findByTestId('calendar-connect')).toBeVisible()
  })

  it('says what it is for before asking for access', async () => {
    connected.mockResolvedValue(false)
    render(<CalendarConnection />)

    await screen.findByTestId('calendar-connect')

    expect(screen.getByTestId('calendar-card').textContent ?? '').toMatch(/read/i)
  })

  it('goes through the same consent flow the import screen uses', async () => {
    connected.mockResolvedValue(false)
    begin.mockResolvedValue({ ok: true })
    render(<CalendarConnection />)

    await userEvent.click(await screen.findByTestId('calendar-connect'))

    expect(begin).toHaveBeenCalledTimes(1)
  })

  /** A refusal has to reach the person who pressed the button. The same failure used to go
   *  to a browser console, which is where this app has put a message nobody reads before. */
  it('says why when the flow cannot start', async () => {
    connected.mockResolvedValue(false)
    begin.mockResolvedValue({ ok: false, reason: 'Calendars are not set up on this version.' })
    render(<CalendarConnection />)

    await userEvent.click(await screen.findByTestId('calendar-connect'))

    expect(await screen.findByTestId('calendar-problem')).toHaveTextContent(
      'Calendars are not set up on this version.',
    )
  })

  it('offers nothing to connect when one already is', async () => {
    render(<CalendarConnection />)

    await screen.findByTestId('calendar-disconnect')
    expect(screen.queryByTestId('calendar-connect')).toBeNull()
  })
})
