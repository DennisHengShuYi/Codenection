import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { RoomShell } from './room/RoomShell'

/**
 * §5, wired into the screen. §3's card precedence makes recovery a single live card that
 * needs no tap to appear -- there is no `door` or `phone` object left to carry it. Two of
 * the old file's cases (the door's own "outings" menu) test a feature the design spec
 * marks for deletion (§7, §10's deleted list: `outings.ts`, `DoorPanel.tsx`) once Task 16
 * simplifies recovery; that menu contradicts the "never a menu" premise the card's own
 * component (`Prescription`) already gets right, so it is not relocated -- it is dropped,
 * same as any other reachability this redesign intentionally removes.
 *
 * What this covers that `Prescription`'s own tests cannot: that accepting reaches the
 * *stored* week as protected rest, and that dismissing genuinely stops offering the same
 * thing (via `recordAttempt`, which this level is the only one exercising through the real
 * screen).
 */
const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

/** Low enough to prescribe, high enough that §1.5's low-energy screen does not take over --
 *  otherwise the test would exercise the one-card cap instead of this one. */
const socialLow = () => week({ start: { mental: 70, physical: 70, social: 25, errands: 70 } })

let counter = 0

const renderHome = async (schedule: Schedule) => {
  counter += 1
  const repository = createLocalRepository(`recovery-screen-${counter}`)
  await repository.clear()
  await repository.saveWeek(schedule)

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

  return repository
}

describe('RoomShell with recovery', () => {
  it('suggests one thing when a reserve is low', async () => {
    await renderHome(socialLow())

    expect(screen.getByTestId('prescription')).toBeVisible()
  })

  // Advice offered to somebody who is fine is advice ignored when they are not.
  it('suggests nothing when nothing is low', async () => {
    await renderHome(week())

    expect(screen.queryByTestId('prescription')).toBeNull()
  })

  // Beside the room rather than instead of it: the card offers, the room stays.
  it('sits beside the room rather than instead of it', async () => {
    await renderHome(socialLow())

    expect(screen.getByTestId('prescription')).toBeVisible()
    expect(screen.getByTestId('room-scene')).toBeVisible()
  })

  /**
   * The point of the unit. Checked against storage rather than the screen, because
   * everything downstream draws from stored state.
   */
  it('accepting puts protected rest in the saved week', async () => {
    const repository = await renderHome(socialLow())

    await userEvent.click(screen.getByRole('button', { name: /put it in my week/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(1))
    expect((await repository.loadWeek())?.items[0]?.protectedRest).toBe(true)
  })

  it('dismissing records it and stops offering the same thing', async () => {
    const repository = await renderHome(socialLow())

    await userEvent.click(screen.getByRole('button', { name: /does not help/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.recoveryLog).toHaveLength(1))
    await waitFor(() => expect(screen.queryByTestId('prescription')).toBeNull())
  })
})
