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
