import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
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

/** The room, with nothing opened on top of it. */
const renderRoom = async (schedule = week()) => {
  counter += 1
  const repository = createLocalRepository(`micro-screen-${counter}`)
  await repository.clear()
  await repository.saveWeek(schedule)

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

  return repository
}

const renderHome = async (schedule = week()) => {
  const repository = await renderRoom(schedule)

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

  it('opens the ladder for the stuck task, not a dead end', async () => {
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

    // Ruling: the card offers rung one, so "I'll do that" lands on the chain that continues
    // it rather than on the block sheet, which was one hop short of the thing being offered.
    expect(await screen.findByTestId('rung-action')).toBeVisible()
    expect(window.location.pathname).toMatch(/\/start$/)
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

/**
 * The page itself, driven through the real route rather than rendered with props: the
 * question at this level is whether a student can reach it, and from where.
 */
describe('the micro-start page', () => {
  /** The week, then the day the block sits on, then the block. What a student does. */
  const openTheOnlyBlock = async () => {
    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(await screen.findByTestId('day-2'))
    await userEvent.click(await screen.findByTestId('block-laundry'))
  }

  it('is reachable from a block', async () => {
    await renderRoom()
    await openTheOnlyBlock()

    await userEvent.click(screen.getByTestId('micro-start'))

    expect(await screen.findByTestId('rung-action')).toBeVisible()
    expect(window.location.pathname).toMatch(/\/start$/)
  })

  // "Every block, no exceptions". Protected rest used to be one of the exceptions, and it
  // is safe now because of what the rest chain says, not because the button is missing.
  it('is reachable from a protected rest block', async () => {
    await renderRoom(week({ items: [item({ id: 'laundry', title: 'Laundry', protectedRest: true })] }))
    await openTheOnlyBlock()

    expect(screen.getByTestId('micro-start')).toBeVisible()
  })

  it('opens straight onto the page from a typed address', async () => {
    window.history.replaceState(null, '', '/week/block/laundry/start')
    await renderRoom()

    expect(await screen.findByTestId('rung-action')).toBeVisible()
  })

  // A block removed since the address was written. The shell lands somewhere real rather
  // than drawing a page about nothing -- the week, exactly as a stale edit address does.
  it('falls back to the week for a block that is gone', async () => {
    window.history.replaceState(null, '', '/week/block/no-such-block/start')
    await renderRoom()

    await waitFor(() => expect(window.location.pathname).toBe('/week'))
    expect(screen.queryByTestId('rung-action')).toBeNull()
  })

  it('goes back to the block it was opened from', async () => {
    await renderRoom()
    await openTheOnlyBlock()
    await userEvent.click(screen.getByTestId('micro-start'))
    await screen.findByTestId('rung-action')

    await userEvent.click(screen.getByRole('button', { name: /^back$/i }))

    expect(await screen.findByTestId('block-when')).toBeVisible()
  })

  it('resumes where the student left off after a remount', async () => {
    const repository = await renderRoom()
    await openTheOnlyBlock()
    await userEvent.click(screen.getByTestId('micro-start'))
    await screen.findByTestId('rung-action')
    await userEvent.click(screen.getByRole('button', { name: /next step/i }))
    await waitFor(() => expect(screen.getByTestId('ladder-progress')).toHaveTextContent('Step 2'))
    await waitFor(async () => expect((await repository.loadSettings()).ladders).toHaveLength(1))

    cleanup()
    window.history.replaceState(null, '', '/week/block/laundry/start')
    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)

    expect(await screen.findByTestId('ladder-progress')).toHaveTextContent('Step 2')
  })

  /**
   * The race a real browser found and the remount test above did not.
   *
   * Stored ladders arrive from storage asynchronously, and on a cold open of
   * `/week/block/:id/start` the page mounted before they landed. With nothing to resume it
   * generated a fresh chain and wrote it over the stored one -- so a reload silently threw
   * away everything the student had done, which is the exact failure persistence exists to
   * prevent. Reproduced here by holding the settings read open until after the first render.
   */
  it('waits for stored ladders rather than overwriting them on a cold open', async () => {
    counter += 1
    const repository = createLocalRepository(`micro-race-${counter}`)
    await repository.clear()
    await repository.saveWeek(week())
    await repository.saveSettings({
      lowEnergyOverride: 'auto',
      ladders: [
        {
          blockId: 'laundry',
          rungs: [
            { action: 'Rung one.', minutes: 2 },
            { action: 'Rung two.', minutes: 3 },
            { action: 'Rung three.', minutes: 4 },
          ],
          done: 2,
        },
      ],
    })

    const realLoad = repository.loadSettings.bind(repository)
    let release = () => undefined as void
    const held = new Promise<void>((resolve) => {
      release = () => resolve()
    })
    const slow = { ...repository, loadSettings: async () => held.then(realLoad) }

    window.history.replaceState(null, '', '/week/block/laundry/start')
    render(<RoomShell repository={slow} blockLog={[]} onAnswerBlock={vi.fn()} />)

    // The page is on screen before storage has answered. It must not decide anything yet.
    await waitFor(() => expect(screen.getByTestId('ladder-working')).toBeVisible())
    release()

    expect(await screen.findByText('Rung three.')).toBeVisible()
    expect(screen.getByTestId('ladder-progress')).toHaveTextContent('Step 3 of 3')
    expect((await repository.loadSettings()).ladders?.[0]?.done).toBe(2)
  })

  // Walking the whole chain and taking the offer at the end: the block leaves the week and
  // its stored chain goes with it, because a record must not outlive what it describes.
  it('finishes the block from the end of the chain and drops the ladder', async () => {
    const repository = await renderRoom()
    await openTheOnlyBlock()
    await userEvent.click(screen.getByTestId('micro-start'))
    await screen.findByTestId('rung-action')

    // The errands chain is three rungs. Walk to the end of whatever it is.
    while (screen.queryByRole('button', { name: /next step/i }) !== null) {
      await userEvent.click(screen.getByRole('button', { name: /next step/i }))
    }

    await userEvent.click(await screen.findByTestId('finish-block'))

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(0))
    expect((await repository.loadSettings()).ladders).toHaveLength(0)
  })

  // A stored chain must not outlive the block it describes.
  it('drops the ladder when its block is removed', async () => {
    const repository = await renderRoom()
    await openTheOnlyBlock()
    await userEvent.click(screen.getByTestId('micro-start'))
    await screen.findByTestId('rung-action')
    await waitFor(async () => expect((await repository.loadSettings()).ladders).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: /stop here/i }))
    await userEvent.click(await screen.findByTestId('remove-block'))
    await userEvent.click(screen.getByTestId('confirm-remove-yes'))

    await waitFor(async () => expect((await repository.loadSettings()).ladders).toHaveLength(0))
  })
})
