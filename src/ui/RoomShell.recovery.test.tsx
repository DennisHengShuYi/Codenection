import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { RoomShell } from './room/RoomShell'

/**
 * §5, wired into the screen. §3's card precedence makes recovery a single live card that
 * needs no tap to appear -- there is no `door` or `phone` object left to carry it. Two of
 * the old file's cases (the door's own "outings" menu) tested a feature the design spec
 * marked for deletion (§7, §10's deleted list: `outings.ts`, `DoorPanel.tsx`); that menu
 * contradicted the "never a menu" premise the card itself already got right, so it was not
 * relocated -- it was dropped, same as any other reachability this redesign intentionally
 * removes.
 *
 * §7 also retired the permanent failed-recovery log `recordAttempt` used to write. "Not
 * today" is a same-day dismissal the room screen holds itself now, which is what the last
 * two cases in this file exist to prove: it hides the card, but it writes nothing durable
 * and does not survive past this session.
 *
 * What this covers that `RecoveryCard`'s own tests cannot: that accepting reaches the
 * *stored* week as protected rest, and that dismissing is genuinely temporary rather than a
 * permanent suppression.
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

  const view = render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

  // Ruling 61: the live cards wait behind the `Waiting` button now, so opening it is part
  // of arriving at one -- the press a student makes.
  await userEvent.click(screen.getByTestId('open-notices'))

  return { repository, ...view }
}

describe('RoomShell with recovery', () => {
  it('suggests one thing when a reserve is low', async () => {
    await renderHome(socialLow())

    expect(screen.getByTestId('recovery-card')).toBeVisible()
  })

  // Advice offered to somebody who is fine is advice ignored when they are not.
  it('suggests nothing when nothing is low', async () => {
    await renderHome(week())

    expect(screen.queryByTestId('recovery-card')).toBeNull()
  })

  // Beside the room rather than instead of it: the card offers, the room stays.
  it('sits beside the room rather than instead of it', async () => {
    await renderHome(socialLow())

    expect(screen.getByTestId('recovery-card')).toBeVisible()
    expect(screen.getByTestId('room-scene')).toBeVisible()
  })

  /**
   * The point of the unit. Checked against storage rather than the screen, because
   * everything downstream draws from stored state. §5.1's guarantee end to end: this is the
   * only path in the app that creates protected rest, and it must land both flags, not one.
   */
  it('accepting puts protected, fixed rest in the saved week', async () => {
    const { repository } = await renderHome(socialLow())

    await userEvent.click(screen.getByRole('button', { name: /put it in my week/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(1))
    const [saved] = (await repository.loadWeek())?.items ?? []
    expect(saved?.protectedRest).toBe(true)
    expect(saved?.fixed).toBe(true)
  })

  it('"not today" hides the card immediately', async () => {
    await renderHome(socialLow())

    await userEvent.click(screen.getByRole('button', { name: /not today/i }))

    await waitFor(() => expect(screen.queryByTestId('recovery-card')).toBeNull())
  })

  /**
   * §7's fix, asserted at the screen. The old dismissal called `recordAttempt`, which wrote
   * a permanent entry the stored week carried forever. This is what replaced it: nothing is
   * written to storage at all, so the schedule dismissing left behind is indistinguishable
   * from one nobody ever touched.
   */
  it('"not today" writes nothing durable -- the stored week is untouched', async () => {
    const { repository } = await renderHome(socialLow())
    const before = await repository.loadWeek()

    await userEvent.click(screen.getByRole('button', { name: /not today/i }))
    await waitFor(() => expect(screen.queryByTestId('recovery-card')).toBeNull())

    expect(await repository.loadWeek()).toEqual(before)
  })

  /**
   * The behavioural proof that this is not the old permanent suppression wearing a new
   * label: reopening the app -- a fresh mount over the same stored week, standing in for a
   * later day, since dismissal here is session state rather than anything persisted -- must
   * offer the same advice again. An implementation that instead persisted the dismissal
   * (writing it into the week, or keeping it in a module-level variable) would fail this.
   */
  it('offers the same advice again once the app is reopened', async () => {
    const { repository } = await renderHome(socialLow())

    await userEvent.click(screen.getByRole('button', { name: /not today/i }))
    await waitFor(() => expect(screen.queryByTestId('recovery-card')).toBeNull())

    cleanup()

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('recovery-card')).toBeVisible())
  })
})
