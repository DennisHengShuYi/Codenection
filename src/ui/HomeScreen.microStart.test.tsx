import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { HomeScreen } from './HomeScreen'

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
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
  ...over,
})

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [item()],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

let counter = 0

const renderHome = async (schedule = week()) => {
  counter += 1
  const repository = createLocalRepository(`micro-screen-${counter}`)
  await repository.clear()
  await repository.saveWeek(schedule)

  render(<HomeScreen repository={repository} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

  return repository
}

describe('HomeScreen with Micro-Start and the accuracy note', () => {
  /**
   * §4.1's manual trigger: a "can't start this" on every task, zero friction, no explanation
   * asked for. Being asked why you are stuck is one more thing to be stuck on.
   */
  it('offers "I can\'t start this" on a task', async () => {
    await renderHome()

    await userEvent.click(screen.getByTestId('clutter-box-laundry'))

    expect(await screen.findByTestId('cant-start-laundry')).toBeVisible()
  })

  it('turns that into one concrete first action', async () => {
    await renderHome()

    await userEvent.click(screen.getByTestId('clutter-box-laundry'))
    await userEvent.click(await screen.findByTestId('cant-start-laundry'))

    const card = await screen.findByTestId('micro-start')

    expect(card).toBeVisible()
    expect(card.textContent).toMatch(/find the one detail/i)
  })

  it('boxes it in minutes rather than leaving it open-ended', async () => {
    await renderHome()

    await userEvent.click(screen.getByTestId('clutter-box-laundry'))
    await userEvent.click(await screen.findByTestId('cant-start-laundry'))

    expect((await screen.findByTestId('micro-start')).textContent).toMatch(/\d+ minutes/i)
  })

  it('can be waved off and leaves the room as it was', async () => {
    await renderHome()

    await userEvent.click(screen.getByTestId('clutter-box-laundry'))
    await userEvent.click(await screen.findByTestId('cant-start-laundry'))
    await userEvent.click(screen.getByRole('button', { name: /not now/i }))

    await waitFor(() => expect(screen.queryByTestId('micro-start')).toBeNull())
    expect(screen.getByTestId('room-scene')).toBeVisible()
  })

  it('suggests nothing until a task is actually stuck', async () => {
    await renderHome()

    expect(screen.queryByTestId('micro-start')).toBeNull()
  })

  /**
   * §8.2: the 21-day projection is never described as validated, and that must be said in
   * the product copy rather than only in the pitch. This is the test that keeps it there.
   */
  it('says on screen that the three-week outlook is not validated', async () => {
    await renderHome()

    expect(screen.getByTestId('accuracy-disclaimer').textContent).toMatch(
      /not a validated|decision aid/i,
    )
  })

  it('claims no accuracy before anything has been scored', async () => {
    await renderHome()

    expect(screen.getByTestId('accuracy-measured').textContent).toMatch(/not enough data/i)
  })
})
