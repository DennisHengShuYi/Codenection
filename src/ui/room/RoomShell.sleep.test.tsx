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

  /**
   * The target is a durable preference now, not a rewrite of the week.
   *
   * It used to move the week directly, and only nights sitting exactly at the OLD target
   * counted as untouched -- so a week that arrived from a fixture or an import never moved at
   * all, and the target looked decorative. The nights ahead are derived from it on every
   * render instead (`domain/sleepAssumed`), which is both the fix and why nothing is written
   * to the week here.
   */
  it('remembers a typed target, including one no fixed set of choices would have offered', async () => {
    const { repository } = await openRoom()
    await userEvent.click(screen.getByTestId('open-sleep'))

    const target = await screen.findByTestId('sleep-target')
    await userEvent.clear(target)
    await userEvent.type(target, '6.5')
    await userEvent.tab()

    await waitFor(async () => {
      expect((await repository.loadSettings()).sleepTargetHours).toBe(6.5)
    })
    // Tonight follows the target while the student has not spoken about tonight itself.
    await waitFor(() => expect(screen.getByTestId('sleep-tonight')).toHaveValue(6.5))
  })

  /**
   * Tonight is the student's own figure for one night, kept apart from what the app assumes.
   * The two were one field, and one field cannot be both -- the page would either show them
   * their number or let the projection reason from an honest one, never both.
   */
  it('remembers tonight on its own, without moving the target', async () => {
    const { repository } = await openRoom()
    await userEvent.click(screen.getByTestId('open-sleep'))

    const tonight = await screen.findByTestId('sleep-tonight')
    await userEvent.clear(tonight)
    await userEvent.type(tonight, '4')
    await userEvent.tab()

    await waitFor(async () => {
      const chosen = (await repository.loadSettings()).sleepChosenByDate ?? {}
      expect(Object.values(chosen)).toEqual([4])
    })
    expect(screen.getByTestId('sleep-target')).toHaveValue(8)
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

  /**
   * Learning how much sleep is enough for THIS student, and saying so.
   *
   * Needs both evidence streams at once -- reported nights beside resolved predictions -- so
   * it can only be asserted at this level. `domain/sleepEnough` proves the estimate; this
   * proves the two streams actually reach it from where they durably live, which are two
   * different places in settings.
   */
  describe('how much sleep is enough for this student', () => {
    /** A fortnight where every night above six bought this student nothing: the long nights
     *  land twelve points worse than the app claimed, the short ones land exactly on it. */
    const learnable = () => {
      const nights = []
      const predictions = []

      for (let index = 0; index < 8; index += 1) {
        const long = index % 2 === 0
        const isoDate = daysAgo(index + 1)
        nights.push({ isoDate, hours: long ? 8 : 5, answeredAt: index })
        predictions.push({ forDate: isoDate, predicted: 60, reported: long ? 48 : 60 })
      }

      return { nights, predictions }
    }

    const openWithEvidence = async (over: Partial<Schedule> = {}) => {
      counter += 1
      const repository = createLocalRepository(`sleep-enough-${counter}`)
      await repository.clear()
      await repository.saveWeek(week(over))

      const { nights, predictions } = learnable()
      const settings = await repository.loadSettings()
      await repository.saveSettings({
        ...settings,
        sleepTargetHours: 8,
        sleepNights: nights,
        calibration: {
          ...(settings.calibration ?? { predictions: [] }),
          predictions,
        } as NonNullable<typeof settings.calibration>,
      })

      render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
      await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
      await userEvent.click(screen.getByTestId('open-sleep'))

      return repository
    }

    it('says what a student own nights suggest about how much is enough', async () => {
      await openWithEvidence()

      expect(await screen.findByTestId('sleep-enough')).toHaveTextContent('Your own nights suggest')
    })

    /**
     * The load-bearing one. The decision was that the app SAYS the figure and ACTS on it --
     * acts meaning the projection credits sleep only up to the learned figure, not that the
     * student's own stated target is edited underneath them. This test is the only thing
     * keeping those apart, because the code that would do the second is one line from the
     * code that does the first.
     */
    it('does not rewrite the target the student stated', async () => {
      const repository = await openWithEvidence()

      expect(await screen.findByTestId('sleep-target')).toHaveValue(8)
      expect((await repository.loadSettings()).sleepTargetHours).toBe(8)
    })

    /**
     * §1.5: withheld in low-energy mode, while the page itself stays reachable.
     *
     * A measured statement about the student's own habits is exactly what the reduced
     * interface exists to hold back -- the same reason the reserve breakdown and the reality
     * line are withheld. The model still uses the figure; only the sentence goes.
     */
    it('withholds the sentence from a depleted student, without closing the page', async () => {
      await openWithEvidence({ start: { mental: 8, physical: 9, social: 7, errands: 10 } })

      expect(await screen.findByTestId('sleep-target')).toBeVisible()
      expect(screen.queryByTestId('sleep-enough')).toBeNull()
    })

    /** Says nothing at all for a student it has learned nothing about -- checked by absence,
     *  the same way the sheet's own test does. */
    it('says nothing before there is evidence', async () => {
      await openRoom()
      await userEvent.click(screen.getByTestId('open-sleep'))

      await screen.findByTestId('sleep-target')
      expect(screen.queryByTestId('sleep-enough')).toBeNull()
    })
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
