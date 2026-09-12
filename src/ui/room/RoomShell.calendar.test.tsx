import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../../data'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'
import { RoomShell } from './RoomShell'

/**
 * The calendar's connected state, reaching the one screen a student connects from.
 *
 * The defect this file exists for is the one this repository has now shipped three times: a
 * function written, tested in isolation, and then wired to nothing. `hasCalendarConnected`
 * has answered this question correctly since the feature shipped and `CalendarConnection` in
 * settings has been asking it -- but `AddSheet.calendarConnected` defaults to false and
 * `RoomShell` passed no value, so the import screen offered "Connect Google Calendar" to a
 * student who had already connected and offered "Read my calendar" to nobody. Nothing in any
 * calendar could ever reach a week, and every test passed.
 *
 * Driven through the shell rather than through `AddSheet`, because a prop the shell does not
 * pass is exactly what `AddSheet.test.tsx` cannot see: it supplies the prop itself.
 */
const asking = vi.hoisted(() => ({ answer: vi.fn<() => Promise<boolean>>() }))

vi.mock('../../google/connection', () => ({ hasCalendarConnected: asking.answer }))

const week = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const SESSION = {
  user: { id: 'student-1', email: 'student@example.com' },
  accessToken: 'token',
} as never

let counter = 0

async function openCalendarWay(connected: boolean) {
  asking.answer.mockResolvedValue(connected)

  counter += 1
  const repository = createLocalRepository(`calendar-${counter}`)
  await repository.clear()
  await repository.saveWeek(week())

  window.history.replaceState(null, '', '/add/calendar')

  render(
    <RoomShell
      repository={repository}
      session={SESSION}
      blockLog={[]}
      onAnswerBlock={vi.fn()}
    />,
  )

  return await screen.findByRole('dialog', { name: /from my calendar/i })
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('the calendar import screen, opened from the room', () => {
  it('offers the read step to a student who has already connected', async () => {
    await openCalendarWay(true)

    await waitFor(() => expect(screen.getByTestId('calendar-read')).toBeVisible())
    expect(screen.queryByTestId('calendar-connect')).toBeNull()
  })

  it('still offers the connect step to one who has not', async () => {
    await openCalendarWay(false)

    await waitFor(() => expect(asking.answer).toHaveBeenCalled())
    expect(screen.getByTestId('calendar-connect')).toBeVisible()
    expect(screen.queryByTestId('calendar-read')).toBeNull()
  })

  /** A grant belongs to an account, so there is nothing to ask about without one -- and
   *  `getClient` would be asked for a session that is not there. */
  it('asks nothing on behalf of a signed-out visitor', async () => {
    counter += 1
    const repository = createLocalRepository(`calendar-guest-${counter}`)
    await repository.clear()
    await repository.saveWeek(week())

    window.history.replaceState(null, '', '/add/calendar')

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)

    await screen.findByRole('dialog', { name: /from my calendar/i })

    expect(asking.answer).not.toHaveBeenCalled()
    expect(screen.getByTestId('calendar-connect')).toBeVisible()
  })
})
