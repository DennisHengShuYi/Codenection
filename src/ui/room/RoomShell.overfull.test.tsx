import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository, type Repository } from '../../data'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { RoomShell } from './RoomShell'

/**
 * A fortnight that is too big rather than badly arranged.
 *
 * Every day fixed and full to the brim, which is what it takes to be genuinely unfixable:
 * with lighter days the rebalancer clears the deficit by inserting rest into the gaps, and
 * this card correctly stays silent when it can. Fixed work alone is not enough -- the
 * optimizer may not move it, but it may still schedule around it.
 */
const daysAgo = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0] as string

const heavy = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'b1',
  title: 'block',
  type: 'mental',
  kind: 'studyBlock',
  hours: 15,
  intensity: 1,
  dayIndex: 0,
  startHour: 8,
  fixed: true,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const overfullWeek = (): Schedule => ({
  items: [
    ...Array.from({ length: HORIZON_DAYS }, (_, dayIndex) =>
      heavy({ id: `heavy-${dayIndex}`, title: `heavy ${dayIndex}`, dayIndex }),
    ),
    heavy({ id: 'gym', title: 'Gym', hours: 1, dayIndex: 3, startHour: 23, type: 'physical', kind: 'hardExercise' }),
  ],
  // 70 rather than lower, deliberately: a fortnight this heavy drives the student under
  // §1.5's threshold within days, and below it the whole waiting sheet collapses to a single
  // card with no `Waiting` button at all. This is the realistic shape of the case anyway --
  // today is survivable, and the wall is a few days out.
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  startedOn: daysAgo(1),
})

/**
 * Which day this fixture fails on first, asserted by the test below rather than assumed: the
 * card only ever lists the named day's blocks, so a promise anywhere else is unreachable.
 */
const FIRST_FAILING_DAY = 3

/**
 * The same fortnight, with the first failing day carrying a provisional yes.
 *
 * `promised` is light enough that dropping it takes that day out of deficit, which is what
 * moves the card on to the next failing day -- the sequence the withdrawal message used to
 * leak across.
 */
const promisedWeek = (): Schedule => {
  const base = overfullWeek()

  return {
    ...base,
    items: [
      ...base.items.filter((one) => one.dayIndex !== FIRST_FAILING_DAY),
      heavy({ id: 'promised', title: 'Committee meeting', dayIndex: FIRST_FAILING_DAY }),
    ],
    commitments: [{ id: 'c1', title: 'Committee meeting', reviewDay: 0, itemId: 'promised' }],
  }
}

const calmWeek = (): Schedule => ({
  items: [heavy({ id: 'one', title: 'One easy thing', hours: 2, fixed: false, dayIndex: 3 })],
  start: { mental: 75, physical: 75, social: 75, errands: 75 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 8),
  startedOn: daysAgo(1),
})

let counter = 0

const renderShell = async (schedule: Schedule): Promise<Repository> => {
  counter += 1
  const repository = createLocalRepository(`overfull-${counter}`)
  await repository.clear()
  await repository.saveWeek(schedule)

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

  // Ruling 61: the live cards wait behind the `Waiting` button, so opening it is part of
  // arriving at one.
  await userEvent.click(screen.getByTestId('open-notices'))

  return repository
}

beforeEach(() => window.history.replaceState(null, '', '/'))

/**
 * The card that asks a student to give something up.
 *
 * It is the last thing the app has to say about a fortnight, and it only ever appears once
 * the rebalancer has been run and disbelieved -- otherwise it would be telling somebody to
 * delete work they could simply have moved. What it never does is choose for them.
 */
describe('the overfull day in the waiting sheet', () => {
  it('raises the card for a fortnight past what rearranging can fix', async () => {
    await renderShell(overfullWeek())

    expect(await screen.findByTestId('overfull')).toBeInTheDocument()
  })

  it('raises nothing for a week that fits', async () => {
    await renderShell(calmWeek())

    expect(screen.queryByTestId('overfull')).toBeNull()
  })

  it('lists what is standing on the day it names', async () => {
    await renderShell(overfullWeek())

    const card = await screen.findByTestId('overfull')

    // Whatever day it picked, the blocks listed are that day's -- and every fixture day
    // carries a `heavy N` block, so one of them is always present.
    expect(within(card).getAllByText(/heavy \d+/).length).toBeGreaterThan(0)
  })

  /** The point of the card. What is dropped leaves the week, not just the card. */
  it('takes the block out of the week when one is dropped', async () => {
    await renderShell(overfullWeek())

    const card = await screen.findByTestId('overfull')
    const first = within(card).getAllByTestId(/^drop-/)[0] as HTMLElement
    const droppedId = (first.getAttribute('data-testid') ?? '').replace('drop-', '')

    await userEvent.click(first)

    await waitFor(() => expect(screen.queryByTestId(`drop-${droppedId}`)).toBeNull())
  })

  /**
   * On screen is not the same fact as saved. A block that vanished from the card and came
   * back on the next open would be the exact silent-write bug this project's error rule
   * exists to stop.
   */
  it('keeps it out after a remount', async () => {
    const repository = await renderShell(overfullWeek())

    const card = await screen.findByTestId('overfull')
    const first = within(card).getAllByTestId(/^drop-/)[0] as HTMLElement
    const droppedId = (first.getAttribute('data-testid') ?? '').replace('drop-', '')

    await userEvent.click(first)
    await waitFor(() => expect(screen.queryByTestId(`drop-${droppedId}`)).toBeNull())

    await waitFor(async () => {
      const saved = await repository.loadWeek()
      expect(saved?.items.some((one) => one.id === droppedId)).toBe(false)
    })

    cleanup()
    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-notices'))

    expect(screen.queryByTestId(`drop-${droppedId}`)).toBeNull()
  })

  /** Keeping the week exactly as it is has to be a real answer, not only a way to close
   *  something. Nothing leaves the week when it is taken. */
  it('leaves the week alone when the student keeps them all', async () => {
    const repository = await renderShell(overfullWeek())
    const before = (await repository.loadWeek())?.items.length

    await userEvent.click(await screen.findByTestId('overfull-dismiss'))

    expect(screen.queryByTestId('overfull')).toBeNull()
    expect((await repository.loadWeek())?.items.length).toBe(before)
  })

  /**
   * The withdrawal belongs to the day it was written for.
   *
   * `droppedTitle` was held as a bare string, so it outlived the card: drop a provisional yes
   * off Thursday, watch Thursday come good, and the next day to fail inherited a withdrawal
   * message for something dropped days earlier and already dealt with. Offering somebody a
   * fresh apology to send for a thing they have already withdrawn from is worse than offering
   * none.
   */
  it('does not carry a withdrawal message over to the next day that fails', async () => {
    await renderShell(promisedWeek())

    const card = await screen.findByTestId('overfull')
    // The promised block is the one on the first failing day; dropping it both raises the
    // withdrawal and clears that day, which is exactly the sequence that used to leak.
    await userEvent.click(within(card).getByTestId('drop-promised'))

    await waitFor(() => expect(screen.queryByTestId('drop-promised')).toBeNull())

    // A later day is still overfull, so the card is still up -- with nothing to withdraw from.
    expect(screen.getByTestId('overfull')).toBeInTheDocument()
    expect(screen.queryByTestId('withdrawal')).toBeNull()
  })

  it('counts towards what is waiting', async () => {
    await renderShell(overfullWeek())

    expect(Number(screen.getByTestId('notices-count').textContent)).toBeGreaterThan(0)
  })
})
