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
/**
 * Local, like the app.
 *
 * `toISOString()` gives a UTC date while `domain/calendar` derives the student's day locally
 * (§9 puts this app at UTC+8), so a UTC-derived anchor makes "three days ago" land on day 4
 * for the first eight hours of every day -- and any test asserting a day index then fails on
 * the clock rather than on the code. This suite has now been bitten by that twice.
 */
const daysAgo = (days: number): string =>
  isoDateOf(new Date(Date.now() - days * 24 * 60 * 60 * 1000))

/**
 * Asked of the app, not re-derived.
 *
 * `toISOString()` gives a UTC date and `domain/calendar` derives the student's day LOCALLY
 * (§9 puts this app at UTC+8), so the two disagree for the first eight hours of every day --
 * and a test that re-derived it would pass or fail depending on the hour it ran. That exact
 * latent failure has already bitten `RoomShell.prediction.test.tsx` once.
 */
const today = (): string => daysAgo(0)

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

  /** The reason the fixed choices went: a student who sleeps five and a half hours had no way
   *  to say so, and no set of buttons narrow enough for this sheet ever would. */
  it('takes a figure no fixed set of choices would have offered', async () => {
    const { repository } = await openRoom()
    await userEvent.click(screen.getByTestId('open-sleep'))

    const target = await screen.findByTestId('sleep-target')
    await userEvent.clear(target)
    await userEvent.type(target, '6.5')
    await userEvent.tab()

    await waitFor(async () => {
      const saved = await repository.loadWeek()
      expect(saved?.sleepByDay.every((hours) => hours === 6.5)).toBe(true)
    })
  })

  /** Validated at the boundary as well as in the field: `withSleepHours` refuses it too, so
   *  no writer can put a figure in the week that the recovery equation cannot hold. */
  it('does not write a night the model could not use', async () => {
    const { repository } = await openRoom()
    const before = await repository.loadWeek()
    await userEvent.click(screen.getByTestId('open-sleep'))

    const target = await screen.findByTestId('sleep-target')
    await userEvent.clear(target)
    await userEvent.type(target, '99')
    await userEvent.tab()

    expect(await screen.findByTestId('sleep-target-error')).toBeInTheDocument()
    expect(await repository.loadWeek()).toEqual(before)
  })

  it('moves every unedited night when the target changes', async () => {
    const { repository } = await openRoom()
    await userEvent.click(screen.getByTestId('open-sleep'))

    const target = await screen.findByTestId('sleep-target')
    await userEvent.clear(target)
    await userEvent.type(target, '9')
    // Committed on leaving the field: a half-typed number is a whole valid one, so "1" on the
    // way to "12" must never reach the week.
    await userEvent.tab()

    await waitFor(async () => {
      const saved = await repository.loadWeek()
      expect(saved?.sleepByDay.every((hours) => hours === 9)).toBe(true)
    })
  })

  /**
   * Tonight is the one night the page still asks about, and it is the student overruling the
   * target for that night only -- so the rest of the fortnight must not follow it.
   *
   * The next three nights used to be typed too. They asked for something nobody can answer:
   * on Saturday you do not know what you will sleep on Monday. Those nights still matter to
   * the projection, which is why the page now SAYS what it assumes instead of asking.
   */
  it('sets tonight without moving the rest of the fortnight', async () => {
    const { repository } = await openRoom()
    await userEvent.click(screen.getByTestId('open-sleep'))

    const tonight = await screen.findByTestId('sleep-tonight')
    await userEvent.clear(tonight)
    await userEvent.type(tonight, '6')
    await userEvent.tab()

    await waitFor(async () => {
      const saved = await repository.loadWeek()
      // Anchored three days back, so today is day 3.
      expect(saved?.sleepByDay[3]).toBe(6)
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

/**
 * The night a student reports this morning is the night that ended this morning.
 *
 * `sleepByDay[d]` is the night at the END of day d, because §6.1 puts sleep in `recovery[d]`
 * and `recovery[d]` produces `reserve[d+1]`. So "last night" is `today - 1`. The card wrote
 * it to `today` -- tonight -- so the figure never reached the day it explained and tonight's
 * plan was overwritten by a night already past.
 */
describe('reporting last night', () => {
  const answerSleep = async () => {
    await userEvent.click(screen.getByTestId('open-notices'))
    await userEvent.click(await screen.findByTestId('sleep-six'))
  }

  it('writes it to the night that ended this morning, not to tonight', async () => {
    // Anchored three days ago, so today is day 3 and there is a day before it.
    const { repository } = await openRoom()

    await answerSleep()

    await waitFor(async () => {
      const saved = await repository.loadWeek()
      expect(saved?.sleepByDay[2]).toBe(6)
    })
    // Tonight is still the plan, not a copy of a night already gone.
    expect((await repository.loadWeek())?.sleepByDay[3]).toBe(8)
  })

  /** Day 0 has no night before it inside the fortnight, so there is nothing to write -- but
   *  the log is keyed by date and holds it anyway, which is what keeps the average honest. */
  it('still records the night on day zero, where there is no week entry to write', async () => {
    counter += 1
    const repository = createLocalRepository(`sleep-day-zero-${counter}`)
    await repository.clear()
    await repository.saveWeek(week({ startedOn: today() }))
    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

    await answerSleep()

    await waitFor(async () => {
      const settings = await repository.loadSettings()
      expect(settings.sleepNights).toHaveLength(1)
    })
    const saved = await repository.loadWeek()
    expect(saved?.sleepByDay.every((hours) => hours === 8)).toBe(true)
  })
})
