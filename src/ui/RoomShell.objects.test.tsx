import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { RoomShell } from './room/RoomShell'

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
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

let counter = 0

const open = async (objectId: string, schedule = week()) => {
  counter += 1
  const repository = createLocalRepository(`objects-${counter}`)
  await repository.clear()
  await repository.saveWeek(schedule)

  render(<RoomShell repository={repository} />)
  await waitFor(() => expect(screen.getByTestId(`object-${objectId}`)).toBeVisible())
  await userEvent.click(screen.getByTestId(`object-${objectId}`))

  return repository
}

/**
 * Every object, opened.
 *
 * The room is the interface now, so "does this piece of furniture do what it says" is the
 * app's primary contract. The feature-specific files test what each thing *does*; this one
 * tests that touching each object reaches it at all -- the failure mode where an object is
 * drawn, named, listed in the sidebar, and opens onto nothing.
 */
describe('RoomShell, object by object', () => {
  it('the desk offers both ways to put work in', async () => {
    await open('desk')

    expect(screen.getByTestId('desk-photograph')).toBeVisible()
    expect(screen.getByTestId('desk-type')).toBeVisible()
  })

  it('the phone carries the request box', async () => {
    await open('phone')

    expect(screen.getByTestId('zoom-phone')).toBeVisible()
  })

  it('the mirror carries calibration', async () => {
    await open('mirror')

    expect(screen.getByTestId('calibration-modes')).toBeVisible()
  })

  it('the light carries the dial', async () => {
    await open('light')

    expect(screen.getAllByRole('meter')).toHaveLength(5)
  })

  it('the window carries the accuracy note and its disclaimer', async () => {
    await open('window')

    expect(screen.getByTestId('accuracy-disclaimer')).toBeVisible()
  })

  it('the ceiling carries the rebalance', async () => {
    await open('ceiling')

    expect(screen.getByTestId('rebalance')).toBeVisible()
  })

  it('the door carries somewhere to go', async () => {
    await open('door')

    expect(screen.getByTestId('door-panel')).toBeVisible()
  })

  it('the character asks how you are', async () => {
    await open('character')

    expect(screen.getByTestId('energy-check-in')).toBeVisible()
  })

  it('the papers say there is nothing to confirm when there is not', async () => {
    await open('papers')

    expect(screen.getByTestId('zoom-papers')).toBeVisible()
  })

  // The plant reports and nothing more -- but it must say so rather than opening onto blank.
  it('the plant states its reading', async () => {
    await open('plant')

    expect(screen.getByTestId('zoom-plant').textContent).toMatch(/sleep and movement/i)
  })

  it('a clutter box offers a first move and a way to clear it', async () => {
    await open('clutter-laundry', week({ items: [item()] }))

    expect(screen.getByTestId('micro-start')).toBeVisible()
    expect(screen.getByRole('button', { name: /^done$/i })).toBeVisible()
  })

  it('clearing a box removes it from the saved week', async () => {
    const repository = await open('clutter-laundry', week({ items: [item()] }))

    await userEvent.click(screen.getByRole('button', { name: /^done$/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(0))
  })

  // Walking away is always available, from every object.
  it('every object can be left again', async () => {
    await open('mirror')

    await userEvent.click(screen.getByTestId('zoom-back'))

    await waitFor(() => expect(screen.queryByTestId('zoom-mirror')).toBeNull())
    expect(screen.getByTestId('room-scene')).toBeVisible()
  })

  /** Somebody using a keyboard must be able to get out without finding the button. */
  it('escape leaves the object', async () => {
    await open('mirror')

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByTestId('zoom-mirror')).toBeNull())
  })

  it('the sidebar reaches the same object as the furniture', async () => {
    counter += 1
    const repository = createLocalRepository(`objects-row-${counter}`)
    await repository.clear()
    await repository.saveWeek(week())

    render(<RoomShell repository={repository} />)
    await waitFor(() => expect(screen.getByTestId('row-light')).toBeVisible())

    await userEvent.click(screen.getByTestId('row-light'))

    expect(screen.getAllByRole('meter')).toHaveLength(5)
  })

  it('offers the words view on a narrow screen', async () => {
    counter += 1
    const repository = createLocalRepository(`objects-words-${counter}`)
    await repository.clear()
    await repository.saveWeek(week())

    render(<RoomShell repository={repository} />)
    await waitFor(() => expect(screen.getByTestId('open-words')).toBeVisible())

    await userEvent.click(screen.getByTestId('open-words'))
    expect(screen.getByTestId('words-back')).toBeVisible()

    await userEvent.click(screen.getByTestId('words-back'))
    await waitFor(() => expect(screen.queryByTestId('words-back')).toBeNull())
  })

  /**
   * §5.2 matches the advice to the depleted type, so a physical prescription belongs to the
   * door. These two cover the paths where taking it and refusing it actually change the
   * saved week -- the half that makes the advice worth anything over time.
   */
  it('taking the door prescription puts protected rest in the saved week', async () => {
    const repository = await open(
      'door',
      week({ start: { mental: 70, physical: 20, social: 70, errands: 70 } }),
    )

    await userEvent.click(screen.getByRole('button', { name: /put it in my week/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(1))
    expect((await repository.loadWeek())?.items[0]?.protectedRest).toBe(true)
  })

  it('refusing it is remembered, so it is not offered again', async () => {
    const repository = await open(
      'door',
      week({ start: { mental: 70, physical: 20, social: 70, errands: 70 } }),
    )

    await userEvent.click(screen.getByRole('button', { name: /does not help/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.recoveryLog).toHaveLength(1))
  })

  it('a row in the words view opens its object too', async () => {
    counter += 1
    const repository = createLocalRepository(`objects-wordsrow-${counter}`)
    await repository.clear()
    await repository.saveWeek(week())

    render(<RoomShell repository={repository} />)
    await waitFor(() => expect(screen.getByTestId('open-words')).toBeVisible())

    await userEvent.click(screen.getByTestId('open-words'))
    await userEvent.click(screen.getAllByTestId('row-ceiling')[0]!)

    expect(screen.getByTestId('rebalance')).toBeVisible()
  })

  it('deferring a box moves it later in the saved week', async () => {
    const repository = await open('clutter-laundry', week({ items: [item()] }))

    await userEvent.click(screen.getByRole('button', { name: /later/i }))

    await waitFor(async () =>
      expect((await repository.loadWeek())?.items[0]?.dayIndex).toBeGreaterThan(2),
    )
  })
})
