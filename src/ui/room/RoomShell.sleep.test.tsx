import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createLocalRepository, DEFAULT_SETTINGS } from '../../data'
import { isoDateOf } from '../../domain/calendar'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'
import { RoomShell } from './RoomShell'

/**
 * The sleep page, wired into the room.
 *
 * What this covers that `SleepSheet`, `useSleepPlan` and the domain modules cannot between
 * them: that the door exists at all, that setting a target reaches the *stored* week, and
 * that a reported night survives a remount -- which is the defect the durable log fixes and
 * which nothing below this level can see.
 */
const daysAgo = (days: number): string => {
  const then = new Date()
  then.setUTCDate(then.getUTCDate() - days)
  return then.toISOString().split('T')[0] ?? ''
}

/**
 * Asked of the app, not re-derived.
 *
 * `toISOString()` gives a UTC date and `domain/calendar` derives the student's day LOCALLY
 * (§9 puts this app at UTC+8), so the two disagree for the first eight hours of every day --
 * and a test that re-derived it would pass or fail depending on the hour it ran. That exact
 * latent failure has already bitten `RoomShell.prediction.test.tsx` once.
 */
const today = (): string => isoDateOf(new Date())

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 60, physical: 60, social: 60, errands: 60 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 8),
  startedOn: daysAgo(3),
  ...over,
})

let counter = 0

const openRoom = async (schedule: Schedule = week()) => {
  counter += 1
  const repository = createLocalRepository(`sleep-page-${counter}`)
  await repository.clear()
  await repository.saveWeek(schedule)

  const view = render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

  return { repository, view }
}

describe('the sleep page', () => {
  it('has a door in the room, without opening anything first', async () => {
    await openRoom()

    expect(screen.getByTestId('open-sleep')).toBeVisible()
  })

  it('opens on a tap', async () => {
    await openRoom()

    await userEvent.click(screen.getByTestId('open-sleep'))

    expect(await screen.findByTestId('sleep-target')).toBeVisible()
  })

  it('moves every unedited night when the target changes', async () => {
    const { repository } = await openRoom()
    await userEvent.click(screen.getByTestId('open-sleep'))

    await userEvent.click(await screen.findByTestId('sleep-target-9'))

    await waitFor(async () => {
      const saved = await repository.loadWeek()
      expect(saved?.sleepByDay.every((hours) => hours === 9)).toBe(true)
    })
  })

  /** Setting one night is the student overruling the target for that night only, so the
   *  others must not follow it. */
  it('leaves the other nights alone when one is set', async () => {
    const { repository } = await openRoom()
    await userEvent.click(screen.getByTestId('open-sleep'))

    const rows = await screen.findAllByTestId(/^sleep-night-\d+$/)
    const second = rows[1]?.getAttribute('data-testid')?.split('-').pop() ?? '1'
    await userEvent.click(screen.getByTestId(`sleep-night-${second}-6`))

    await waitFor(async () => {
      const saved = await repository.loadWeek()
      expect(saved?.sleepByDay[Number(second)]).toBe(6)
      expect(saved?.sleepByDay.filter((hours) => hours === 6)).toHaveLength(1)
    })
  })

  /**
   * The live defect the durable log fixes.
   *
   * Whether a night had been answered lived only in React state, so the app re-asked after
   * every reload -- §8 wants one card a day, not one per page load. Asserted through a
   * remount, because that is what a reload is from the component's point of view.
   */
  it('stops asking about a night it has already been told about', async () => {
    counter += 1
    const repository = createLocalRepository(`sleep-reask-${counter}`)
    await repository.clear()
    await repository.saveWeek(week())
    await repository.saveSettings({
      ...DEFAULT_SETTINGS,
      sleepNights: [{ isoDate: today(), hours: 6, answeredAt: 1 }],
    })

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-notices'))

    await waitFor(() => expect(screen.queryByTestId('sleep-six')).toBeNull())
  })
})
