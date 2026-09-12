import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../../data'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { RoomShell } from './RoomShell'

/**
 * Ruling 16 at the one place it was not applied: Later.
 *
 * `deferItem` searches forward for a day with room and returns the week **unchanged** when
 * there is none -- its own comment says that is so "a caller can tell nothing happened".
 * Nothing did. The shell set the schedule and closed the sheet either way, so a student who
 * pressed Later on a block with nowhere to go watched the sheet close on a button that had
 * done nothing, exactly as if it had worked.
 *
 * At this level rather than in `placement.test.ts`, because the defect was never in the
 * sentence -- it was that nobody asked for one.
 */
const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'essay',
  title: 'Essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 3,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

/** A day nothing else will fit into. Fixed, so the search cannot displace it either. */
const wall = (dayIndex: number): ScheduledItem =>
  item({ id: `wall-${dayIndex}`, title: 'Solid', hours: 16, dayIndex, startHour: 8, fixed: true })

const week = (
  items: ScheduledItem[],
  start = { mental: 70, physical: 70, social: 70, errands: 70 },
): Schedule => ({
  items,
  start,
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

let counter = 0

const openBlock = async (schedule: Schedule) => {
  counter += 1
  const repository = createLocalRepository(`later-${counter}`)
  await repository.clear()
  await repository.saveWeek(schedule)

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

  await userEvent.click(screen.getByTestId('open-week'))
  // The grid shows one day at a time, so the day has to be opened before the block on it.
  await userEvent.click(await screen.findByTestId('day-3'))
  await userEvent.click(await screen.findByTestId('block-essay'))
  await userEvent.click(await screen.findByRole('button', { name: /^later$/i }))
}

/** Later proposes; the student decides. Everything below the proposal needs the second press. */
const openBlockAndConfirm = async (schedule: Schedule) => {
  await openBlock(schedule)
  await userEvent.click(await screen.findByTestId('confirm-later-yes'))
}

describe('pressing Later', () => {
  it('says which day it moved the block to', async () => {
    await openBlockAndConfirm(week([item()]))

    const note = await screen.findByTestId('week-note')
    expect(note.textContent).toMatch(/Essay moved to/i)
  })

  /**
   * The case the silence hid. Every day from here to the end of the horizon is full, so
   * `deferItem` hands back the identical week -- and without this the sheet simply closed.
   */
  it('says so when there was nowhere to put it', async () => {
    const walls = Array.from({ length: HORIZON_DAYS - 4 }, (_, offset) => wall(offset + 4))
    await openBlock(week([item(), ...walls]))

    // Nothing to approve, so the proposal is the whole answer -- it is said in the sheet
    // rather than on a week screen the student is never sent back to.
    const note = await screen.findByTestId('confirm-later')
    expect(note.textContent).toMatch(/no room for Essay/i)
    expect(screen.queryByTestId('confirm-later-yes')).toBeNull()
  })

  /**
   * The other half of Ruling 16, and the half the first pass left out.
   *
   * Later is no longer pure geometry -- it scores every opening and can pass over a day that
   * plainly had space. A student watching it skip an empty Wednesday cannot tell a decision
   * from a bug, because the obvious reading of the button is still the old behaviour: the
   * next day with a gap. So when it declines an opening it has to say so.
   */
  it('says which opening it passed over, and that the day it chose costs less', async () => {
    // Mental has to be the reserve setting the floor, or the objective cannot tell the days
    // apart: with four reserves level, isolation drains social past everything else.
    const heavy = item({ id: 'heavy', title: 'Lab', dayIndex: 4, hours: 8, startHour: 8, fixed: true })
    // A real deadline, far out. Without one `stampSoftDeadlines` gives the block a synthetic
    // deadline and neglect pressure (0.005 x 3 x 3) outranks the fragmentation gain (0.025 on
    // a low-structure week) -- so staying early is correct, and the test would be asserting
    // against the model rather than about it.
    await openBlockAndConfirm(
      week([item({ hours: 3, deadlineDay: 12 }), heavy], {
        mental: 40,
        physical: 90,
        social: 90,
        errands: 90,
      }),
    )

    const note = await screen.findByTestId('week-note')
    expect(note.textContent).toMatch(/had room, but/i)
    expect(note.textContent).toMatch(/costs you less/i)
  })

  /** A block that moved to the very next day needs no explanation: it did what the button
   *  says, and a reason appended to it would be noise. */
  it('gives no reason when it simply took the next day', async () => {
    await openBlockAndConfirm(week([item()]))

    const note = await screen.findByTestId('week-note')
    // The destination, dated, and nothing after it: no day was passed over, so there is
    // nothing to explain.
    expect(note.textContent).toMatch(/^Essay moved to .+\.$/)
    expect(note.textContent).not.toMatch(/room|costs you/)
  })

  /**
   * The sentence is about the act that just happened. Left standing, it reads as a claim
   * about whatever the student does next -- so opening another block, which is the usual
   * next press on this screen, clears it.
   */
  it('does not leave the sentence standing over the next block', async () => {
    await openBlockAndConfirm(week([item(), item({ id: 'gym', title: 'Gym', dayIndex: 5 })]))
    await screen.findByTestId('week-note')

    await userEvent.click(await screen.findByTestId('day-5'))
    await userEvent.click(await screen.findByTestId('block-gym'))

    expect(screen.queryByTestId('week-note')).toBeNull()
  })

  /**
   * Rebalance is the other act that speaks on this screen, and it writes directly below
   * where this renders. Asserted across the whole flow rather than at the press: a solver
   * that finds moves opens the proposal instead of writing a report, so the sentence only
   * becomes visibly stale once the student discards and lands back on the week -- which is
   * exactly where a lingering one would be read as a claim about the rebalance.
   */
  it('does not leave it standing when a rebalance comes back to the week', async () => {
    await openBlockAndConfirm(week([item()]))
    await screen.findByTestId('week-note')

    await userEvent.click(screen.getByTestId('rebalance'))
    await userEvent.click(await screen.findByTestId('discard-rebalance'))

    await waitFor(() => expect(screen.getByTestId('rebalance')).toBeVisible())
    expect(screen.queryByTestId('week-note')).toBeNull()
  })

  /**
   * The guarantee, stated on its own.
   *
   * Later is no longer guessable from its name: it scores every opening and can pass over a
   * day that plainly had room. An action a student cannot predict should not happen on the
   * press that asks about it -- so the first press proposes, and the week is untouched until
   * the second.
   */
  it('moves nothing until the student says so', async () => {
    await openBlock(week([item()]))

    expect(screen.getByTestId('confirm-later')).toBeVisible()
    // Still on the proposal, and nothing has been written: no week screen, no sentence about
    // a move, because no move has happened.
    expect(screen.queryByTestId('week-note')).toBeNull()
  })

  /** Backing out leaves the block exactly where it was. */
  it('leaves the block alone when the move is declined', async () => {
    await openBlock(week([item()]))
    await userEvent.click(screen.getByRole('button', { name: /keep it here/i }))

    expect(screen.queryByTestId('confirm-later')).toBeNull()
    expect(screen.queryByTestId('week-note')).toBeNull()
  })
})
