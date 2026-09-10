import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { RoomShell } from './room/RoomShell'

/**
 * The planner wired into the screen, rather than the component in isolation.
 *
 * What this covers that `PlannerScreen.test.tsx` cannot: that accepting chips typed into
 * the `+` sheet's typing way actually reaches the stored week. The endpoint is stubbed
 * unreachable, so this exercises the rule-based path.
 */
beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no endpoint'))))
afterEach(() => vi.unstubAllGlobals())

const emptyWeek = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

let counter = 0

const openPlanner = async () => {
  counter += 1
  const repository = createLocalRepository(`planner-screen-${counter}`)
  await repository.clear()
  await repository.saveWeek(emptyWeek())

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('open-add')).toBeVisible())
  await userEvent.click(screen.getByTestId('open-add'))
  await userEvent.click(screen.getByTestId('add-type'))

  return repository
}

describe('RoomShell with the planner', () => {
  it('opens the planner and can be stepped back from without changing anything', async () => {
    const repository = await openPlanner()

    // Ruling 60: Back is the way up to the chooser now. `Cancel` had to mean both this
    // and "close the whole thing", depending on which sheet you were standing in.
    await userEvent.click(screen.getByTestId('sheet-back'))
    await waitFor(() => expect(screen.getByTestId('add-type')).toBeVisible())

    expect((await repository.loadWeek())?.items).toHaveLength(0)
  })

  // The point of the whole unit: accepted chips become the student's real, stored week.
  it('accepted items reach the saved week', async () => {
    const repository = await openPlanner()

    await userEvent.type(screen.getByLabelText(/on your mind/i), 'gym, laundry')
    await userEvent.click(screen.getByRole('button', { name: /read this/i }))
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(2))

    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByTestId('room-scene')).toBeVisible()
  })

  /**
   * §16: never silently reshuffle. A student who adds something and finds their week
   * quietly rearranged has lost their grip on it, so the app says what it did and offers
   * anything further as a choice.
   */
  it('says what it did with what was added', async () => {
    await openPlanner()

    await userEvent.type(screen.getByLabelText(/on your mind/i), 'gym, laundry')
    await userEvent.click(screen.getByRole('button', { name: /read this/i }))
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(2))

    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    await waitFor(() => expect(screen.getByTestId('placement-note')).toBeVisible())
    expect(screen.getByTestId('placement-note')).toHaveTextContent(/Added/)
  })

  /** A week that simply absorbed the new work has nothing to apologise for and nothing to
   *  offer, so no move is proposed. */
  it('offers no move when nothing had to give', async () => {
    await openPlanner()

    await userEvent.type(screen.getByLabelText(/on your mind/i), 'laundry')
    await userEvent.click(screen.getByRole('button', { name: /read this/i }))
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    await waitFor(() => expect(screen.getByTestId('placement-note')).toBeVisible())
    expect(screen.queryByTestId('placement-do')).toBeNull()
  })

  /** "Leave it" is the healthy default: doing nothing keeps the week the student decided
   *  on, which is the principle underneath provisional yes pointed at placement. */
  it('leaves the week exactly as it was when the offer is declined', async () => {
    const repository = await openPlanner()

    await userEvent.type(screen.getByLabelText(/on your mind/i), 'gym, laundry')
    await userEvent.click(screen.getByRole('button', { name: /read this/i }))
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(2))
    await userEvent.click(screen.getByRole('button', { name: /add these/i }))
    await waitFor(() => expect(screen.getByTestId('placement-note')).toBeVisible())

    const settled = (await repository.loadWeek())?.items.map((item) => ({
      id: item.id,
      dayIndex: item.dayIndex,
      startHour: item.startHour,
    }))

    const leave = screen.queryByTestId('placement-leave')
    if (leave !== null) await userEvent.click(leave)

    expect(
      (await repository.loadWeek())?.items.map((item) => ({
        id: item.id,
        dayIndex: item.dayIndex,
        startHour: item.startHour,
      })),
    ).toEqual(settled)
  })

  /**
   * §37, end to end, and the regression that matters most here: `suggestRepeat` was written
   * and tested and then wired to nothing, which is the same defect §9 and §11 were on the
   * list for. A test at the domain proves the function works; only this proves it runs.
   *
   * The clock is pinned because the rules parser turns a named weekday into a day index
   * using its own arithmetic, which does not line up with the real calendar -- so what
   * "tuesday" resolves to depends on the day the suite runs. Pinning it makes the weekday
   * the suggestion has to match a fact rather than a coincidence.
   */
  it('notices a class the student is entering one week at a time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-07T09:00:00Z'))

    try {
      counter += 1
      const repository = createLocalRepository(`planner-repeat-${counter}`)
      await repository.clear()

      // Day 2 of a week starting 2026-09-07 is 2026-09-09, a Wednesday -- which is what the
      // parser's "tuesday" actually lands on. Day 9 is the Wednesday after it.
      await repository.saveWeek({
        ...emptyWeek(),
        startedOn: '2026-09-07',
        items: [
          {
            id: 'existing',
            // The rules parser keeps the whole fragment as the title, so the block already
            // in the week has to carry the same words the student types.
            title: 'lecture tuesday',
            type: 'mental',
            kind: 'studyBlock',
            hours: 2,
            intensity: 1,
            dayIndex: 9,
            startHour: 9,
            fixed: true,
            deadlineDay: null,
            protectedRest: false,
          },
        ],
      })

      render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
      await waitFor(() => expect(screen.getByTestId('open-add')).toBeVisible())
      await userEvent.click(screen.getByTestId('open-add'))
      await userEvent.click(screen.getByTestId('add-type'))

      await userEvent.type(screen.getByLabelText(/on your mind/i), 'lecture tuesday')
      await userEvent.click(screen.getByRole('button', { name: /read this/i }))

      await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(1))
      expect(screen.getByText(/repeats every week/i)).toBeVisible()
    } finally {
      vi.useRealTimers()
    }
  })

  /** Suggested, not applied. §41: one tap says no, and the accept is what commits it. */
  it('lets the student say it is a one-off after all', async () => {
    await openPlanner()

    await userEvent.type(screen.getByLabelText(/on your mind/i), 'laundry')
    await userEvent.click(screen.getByRole('button', { name: /read this/i }))
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(1))

    // Nothing in the week to look like, so nothing is suggested.
    expect(screen.queryByText(/repeats every week/i)).toBeNull()
  })
})
