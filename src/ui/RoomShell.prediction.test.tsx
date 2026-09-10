import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { RoomShell } from './room/RoomShell'

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

let counter = 0

const renderHome = async (schedule = week()) => {
  counter += 1
  const repository = createLocalRepository(`prediction-screen-${counter}`)
  await repository.clear()
  await repository.saveWeek(schedule)

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

  return repository
}

/**
 * §8.1 end to end, and the reason this file exists: the scoring machinery was built,
 * tested and never called. A module with passing tests that nothing invokes is not a
 * feature. §3 moves the energy question off the `character` object -- there is no tap
 * target left to carry it -- and onto the today card, which is on screen whenever there is
 * something to ask.
 */
describe('RoomShell scoring its own predictions', () => {
  /**
   * A week saved before anchoring existed has no real dates, so nothing it recorded could
   * ever be checked. Anchoring on first open is what makes every later claim resolvable.
   */
  it('anchors an unanchored week to a real date', async () => {
    const repository = await renderHome()

    await waitFor(async () => expect((await repository.loadWeek())?.startedOn).toBeTruthy())
  })

  it('makes a prediction about a real day, not a day index', async () => {
    const repository = await renderHome()

    await waitFor(async () => {
      const saved = (await repository.loadSettings()).calibration?.predictions ?? []
      expect(saved.length).toBeGreaterThan(0)
      expect(saved[0]?.forDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  // §8b: `umProfile` seeds predictions that are already resolved, so the accuracy line has
  // a real number to publish from the first render.
  it('carries the seeded prediction already scored, rather than a placeholder', async () => {
    const repository = await renderHome()

    await waitFor(async () => {
      const saved = (await repository.loadSettings()).calibration?.predictions ?? []
      expect(saved[0]?.reported).toBe(50)
    })
  })

  // Nothing is asked on a day the app made no claim about.
  it('does not ask about energy when there is nothing to score', async () => {
    await renderHome()

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    expect(screen.queryByTestId('energy-70')).toBeNull()
  })

  /**
   * The whole loop, in one test: a claim made about today, a student answering, and the
   * claim scored. Before this existed, the accuracy note read "not enough data" forever no
   * matter how long the app was used.
   */
  it('scores a prediction once the student reports on the today card', async () => {
    counter += 1
    const repository = createLocalRepository(`prediction-loop-${counter}`)
    await repository.clear()

    // A week anchored today, carrying a claim about today that is still unscored.
    const today = new Date().toISOString().split('T')[0] ?? ''
    await repository.saveWeek({ ...week(), startedOn: today })
    const settings = await repository.loadSettings()
    await repository.saveSettings({
      ...settings,
      calibration: {
        ...(settings.calibration ?? { predictions: [] }),
        predictions: [{ forDate: today, predicted: 64, reported: null }],
      } as NonNullable<typeof settings.calibration>,
    })

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
    const card = await screen.findByRole('region', { name: /today's check-in/i })

    await userEvent.click(within(card).getByTestId('energy-70'))

    await waitFor(async () => {
      const saved = (await repository.loadSettings()).calibration?.predictions ?? []
      const scored = saved.find((prediction) => prediction.forDate === today)
      expect(scored?.reported).toBe(70)
    })
  })

  it('publishes the error once something has been scored', async () => {
    counter += 1
    const repository = createLocalRepository(`prediction-scored-${counter}`)
    await repository.clear()

    const today = new Date().toISOString().split('T')[0] ?? ''
    await repository.saveWeek({ ...week(), startedOn: today })
    const settings = await repository.loadSettings()
    await repository.saveSettings({
      ...settings,
      calibration: {
        ...(settings.calibration ?? { predictions: [] }),
        predictions: [{ forDate: '2020-01-01', predicted: 60, reported: 50 }],
      } as NonNullable<typeof settings.calibration>,
    })

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('accuracy-measured')).toBeVisible())
    expect(screen.getByTestId('accuracy-measured').textContent).toMatch(/off by about 10/i)
  })
})

/**
 * The brief asks for a stress tracker that logs how you feel over time. Every energy answer
 * has always been stored and dated on the profile; the only thing that ever read it was the
 * accuracy figure, which reduces the whole history to one mean error.
 *
 * Proved here rather than only at the component, because the defect was never that a chart
 * could not be drawn -- it was that the stored history reached nothing.
 */
describe('RoomShell showing reported energy over time', () => {
  const seedReported = async (repository: Awaited<ReturnType<typeof renderHome>>, values: number[]) => {
    const settings = await repository.loadSettings()
    await repository.saveSettings({
      ...settings,
      calibration: {
        ...(settings.calibration ?? { predictions: [] }),
        predictions: values.map((reported, index) => ({
          forDate: `2026-08-${String(index + 1).padStart(2, '0')}`,
          predicted: 60,
          reported,
        })),
      } as NonNullable<typeof settings.calibration>,
    })
  }

  /**
   * On the week screen, not the room. The trend travelled with the gauge when Ruling 53
   * moved the five-domain breakdown off the room -- the room reads capacity once, and the
   * history of a number belongs beside the number.
   */
  it('plots the days the student has reported on', async () => {
    counter += 1
    const repository = createLocalRepository(`prediction-trend-${counter}`)
    await repository.clear()
    await repository.saveWeek(week())
    await seedReported(repository, [30, 50, 70, 90])

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())
    await userEvent.click(screen.getByTestId('room-gauge'))

    await waitFor(() => expect(screen.getByTestId('sparkline')).toBeInTheDocument())
    expect(screen.getByTestId('sparkline').getAttribute('points')?.split(' ')).toHaveLength(4)
    expect(screen.getByTestId('sparkline-text')).toHaveTextContent(/going up/i)
  })

  /**
   * §0's no cold start: a student who has answered nothing sees a room, not an empty axis
   * implying data that does not exist.
   *
   * Seeded explicitly empty rather than just left alone, because the preview profile ships
   * with demo history -- which is the point of the fixture, and would make "fresh" mean the
   * opposite of what this test is about.
   */
  it('draws nothing for a student who has never answered', async () => {
    counter += 1
    const repository = createLocalRepository(`prediction-notrend-${counter}`)
    await repository.clear()
    await repository.saveWeek(week())
    await seedReported(repository, [])

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-week'))

    // Checked on the screen that would draw it, so this cannot pass merely because the
    // trend lives somewhere else now.
    await waitFor(() => expect(screen.getByTestId('rebalance')).toBeVisible())
    expect(screen.queryByTestId('sparkline')).not.toBeInTheDocument()
  })

  /** Two dots are not a trend, and a line through them asserts a direction nobody
   *  measured. The floor is enforced in the domain and must survive the wiring. */
  it('draws nothing until there is enough to be a trend', async () => {
    counter += 1
    const repository = createLocalRepository(`prediction-tooshort-${counter}`)
    await repository.clear()
    await repository.saveWeek(week())
    await seedReported(repository, [40, 60])

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-week'))

    // Checked on the screen that would draw it, so this cannot pass merely because the
    // trend lives somewhere else now.
    await waitFor(() => expect(screen.getByTestId('rebalance')).toBeVisible())
    expect(screen.queryByTestId('sparkline')).not.toBeInTheDocument()
  })
})
