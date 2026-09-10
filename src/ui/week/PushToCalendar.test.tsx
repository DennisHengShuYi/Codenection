import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { PushToCalendar } from './PushToCalendar'

const connected = vi.fn<() => Promise<boolean>>()
const push = vi.fn<
  () => Promise<{ created: number; updated: number; removed: number }>
>()

vi.mock('../../google/connection', () => ({ hasCalendarConnected: () => connected() }))
vi.mock('../../google/client', () => ({
  pushCalendar: (...args: unknown[]) => push(...(args as [])),
}))

beforeEach(() => {
  connected.mockReset().mockResolvedValue(true)
  push.mockReset().mockResolvedValue({ created: 2, updated: 0, removed: 0 })
})

const block = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'b1',
  title: 'FYP writing',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 0,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

// `null` rather than `undefined` for "no anchor", so an explicit argument cannot trigger
// the default parameter and quietly anchor the week the test is about.
const week = (items: ScheduledItem[], startedOn: string | null = '2026-09-11'): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...(startedOn === null ? {} : { startedOn }),
})

const setup = (schedule: Schedule = week([block(), block({ id: 'b2', startHour: 14 })])) =>
  render(<PushToCalendar schedule={schedule} today={0} />)

/**
 * Sending the week out to Google, which happens only because a student pressed something.
 *
 * The whole write side is deliberately a visible act rather than a background sync. This
 * app writes into somebody's real calendar, which other people may be looking at, and a
 * thing that appears there is a thing they have to explain or delete. So it says what it
 * will do, in numbers, and waits.
 */
describe('PushToCalendar', () => {
  it('offers nothing at all when no calendar is connected', async () => {
    connected.mockResolvedValue(false)
    setup()

    await waitFor(() => expect(connected).toHaveBeenCalled())
    expect(screen.queryByTestId('push-calendar')).toBeNull()
  })

  it('offers to write the week once a calendar is connected', async () => {
    setup()

    expect(await screen.findByTestId('push-calendar')).toBeVisible()
  })

  /**
   * §1.4's rule about never importing silently, pointed the other way. The count comes from
   * the same pure function that does the writing, so the number said here is the number
   * that happens.
   */
  it('says how much it will write before it writes any of it', async () => {
    setup()

    await userEvent.click(await screen.findByTestId('push-calendar'))

    expect(screen.getByText(/2 blocks/i)).toBeVisible()
    expect(push).not.toHaveBeenCalled()
  })

  /** Which calendar, by name, and that it is one this app made. Somebody worried about
   *  their shared work calendar needs that answered before they press anything. */
  it('names the calendar it writes to, and says it is its own', async () => {
    setup()

    await userEvent.click(await screen.findByTestId('push-calendar'))

    expect(screen.getByText(/Codenection/)).toBeVisible()
    expect(screen.getByText(/nothing else in your calendar is touched/i)).toBeVisible()
  })

  it('writes when confirmed, and says what it did', async () => {
    setup()

    await userEvent.click(await screen.findByTestId('push-calendar'))
    await userEvent.click(screen.getByTestId('push-confirm'))

    await waitFor(() => expect(push).toHaveBeenCalledOnce())
    expect(await screen.findByTestId('push-done')).toHaveTextContent(/2 added/i)
  })

  /** The zone the times are meant in travels with them. Without it Google would read a
   *  9am block at whatever zone the calendar happens to default to. */
  it('sends the zone the student is actually in', async () => {
    setup()

    await userEvent.click(await screen.findByTestId('push-calendar'))
    await userEvent.click(screen.getByTestId('push-confirm'))

    await waitFor(() => expect(push).toHaveBeenCalledOnce())
    const [, timeZone] = push.mock.calls[0] as unknown as [unknown, string]
    expect(timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })

  it('changes nothing when the student backs out', async () => {
    setup()

    await userEvent.click(await screen.findByTestId('push-calendar'))
    await userEvent.click(screen.getByRole('button', { name: /not now/i }))

    expect(push).not.toHaveBeenCalled()
    expect(screen.getByTestId('push-calendar')).toBeVisible()
  })

  /** A failed write must not report a written week. Somebody told their calendar is up to
   *  date, whose calendar is not, has no reason to go and look. */
  it('says so plainly when the week could not be written', async () => {
    push.mockRejectedValue(new Error('no'))
    setup()

    await userEvent.click(await screen.findByTestId('push-calendar'))
    await userEvent.click(screen.getByTestId('push-confirm'))

    expect(await screen.findByTestId('push-problem')).toBeVisible()
    expect(screen.queryByTestId('push-done')).toBeNull()
  })

  /**
   * A week with no real dates cannot be written anywhere truthful. Offering the button and
   * then writing nothing would be worse than not offering it -- the student would believe
   * their calendar had been filled.
   */
  it('explains rather than offers when the week has no real dates', async () => {
    setup(week([block()], null))

    expect(await screen.findByTestId('push-undated')).toBeVisible()
    expect(screen.queryByTestId('push-calendar')).toBeNull()
  })

  /** Nothing to write is its own answer, not an error and not a button that does nothing. */
  it('says there is nothing to write for an empty week', async () => {
    setup(week([]))

    expect(await screen.findByTestId('push-nothing')).toBeVisible()
    expect(screen.queryByTestId('push-calendar')).toBeNull()
  })

  /** A block that came from Google is not sent back to Google. It would appear twice there,
   *  and the next import would read both. */
  it('does not count a block that came from the calendar in the first place', async () => {
    setup(week([block({ sourceId: 'gcal-1' }), block({ id: 'b2', startHour: 14 })]))

    await userEvent.click(await screen.findByTestId('push-calendar'))

    expect(screen.getByText(/1 block\b/i)).toBeVisible()
  })
})
