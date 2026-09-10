import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { RoomShell } from './room/RoomShell'

/**
 * §4.1's automatic trigger, and §8.1's accuracy note.
 *
 * §5's design moves micro-start off the clutter box (a display-only room has no tap target
 * left to carry it) and onto a live card on the room screen instead, which opens the same
 * block sheet -- "the sheet is where it lives; the card is how it finds you". What is left
 * to prove at this level, that `BlockSheet.test.tsx` cannot: that a genuinely stuck task
 * raises the card unprompted, and that it opens the right block.
 */
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

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

  // Ruling 61: the live cards wait behind the `Waiting` button now, so opening it is part
  // of arriving at one -- the press a student makes.
  await userEvent.click(screen.getByTestId('open-notices'))

  return repository
}

describe('RoomShell with a stuck task', () => {
  it('suggests nothing until a task is actually stuck', async () => {
    await renderHome()

    expect(screen.queryByTestId('micro-start')).toBeNull()
  })

  // §4.1's other half: three days past first appearance, with no clock in the domain
  // layer, so `today` has to be pushed forward via anchoring rather than misses.
  it('raises the card unprompted once a task has sat three days', async () => {
    counter += 1
    const repository = createLocalRepository(`micro-stuck-${counter}`)
    await repository.clear()
    const startedOn = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    await repository.saveWeek({ ...week({ items: [item({ dayIndex: 0 })] }), startedOn })

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
    // Ruling 61: the cards wait behind the `Waiting` button now, so getting to one is
    // the press a student makes.
    await waitFor(() => expect(screen.getByTestId('open-notices')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-notices'))

    const card = await screen.findByTestId('micro-start')
    expect(card.textContent).toMatch(/find the one detail/i)
    expect(card.textContent).toMatch(/\d+ minutes/i)
  })

  it('opens the block sheet for the stuck task, not a dead end', async () => {
    counter += 1
    const repository = createLocalRepository(`micro-opens-${counter}`)
    await repository.clear()
    const startedOn = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    await repository.saveWeek({
      ...week({ items: [item({ dayIndex: 0, id: 'laundry' })] }),
      startedOn,
    })

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
    // Ruling 61: the cards wait behind the `Waiting` button now, so getting to one is
    // the press a student makes.
    await waitFor(() => expect(screen.getByTestId('open-notices')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-notices'))
    await screen.findByTestId('micro-start')

    await userEvent.click(screen.getByRole('button', { name: /i'll do that/i }))

    expect(await screen.findByRole('dialog', { name: /laundry/i })).toBeVisible()
  })

  it('can be waved off and leaves the room as it was', async () => {
    counter += 1
    const repository = createLocalRepository(`micro-wave-${counter}`)
    await repository.clear()
    const startedOn = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    await repository.saveWeek({ ...week({ items: [item({ dayIndex: 0 })] }), startedOn })

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
    // Ruling 61: the cards wait behind the `Waiting` button now, so getting to one is
    // the press a student makes.
    await waitFor(() => expect(screen.getByTestId('open-notices')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-notices'))
    const card = await screen.findByTestId('micro-start')

    await userEvent.click(within(card).getByRole('button', { name: /not now/i }))

    await waitFor(() => expect(screen.queryByTestId('micro-start')).toBeNull())
    expect(screen.getByTestId('room-scene')).toBeVisible()
  })

  /**
   * §8.2's disclaimer: the 21-day projection is never described as validated, and that has
   * to be said in the product copy. The note now lives permanently on the room screen
   * rather than behind a tap.
   */
  it('says on screen that the three-week outlook is not validated', async () => {
    await renderHome()

    expect(screen.getByTestId('accuracy-disclaimer').textContent).toMatch(
      /not a validated|decision aid/i,
    )
  })

  // §8b: the seeded profile carries real history, so a fresh room is never a cold start for
  // the accuracy line -- it has something to publish from the first render.
  it('publishes a real accuracy number from the seeded profile rather than "not enough data"', async () => {
    await renderHome()

    expect(screen.getByTestId('accuracy-measured').textContent).toMatch(/off by about 9\.8/i)
  })
})
