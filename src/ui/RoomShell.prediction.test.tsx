import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
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

  render(<RoomShell repository={repository} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

  return repository
}

/**
 * §8.1 end to end, and the reason this file exists: the scoring machinery was built, tested
 * and never called. A module with passing tests that nothing invokes is not a feature.
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

  it('leaves the prediction unscored until somebody says how the day went', async () => {
    const repository = await renderHome()

    await waitFor(async () => {
      const saved = (await repository.loadSettings()).calibration?.predictions ?? []
      expect(saved[0]?.reported).toBeNull()
    })
  })

  // Nothing is asked on a day the app made no claim about.
  it('does not ask about energy when there is nothing to score', async () => {
    await renderHome()

    expect(screen.getByTestId('object-character')).toHaveAttribute('data-attention', 'false')
  })

  /**
   * The whole loop, in one test: a claim made about today, a student answering, and the
   * claim scored. Before this existed, the accuracy note read "not enough data" forever no
   * matter how long the app was used.
   */
  it('scores a prediction once the student reports on that day', async () => {
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

    render(<RoomShell repository={repository} />)
    // The check-in lives on the character: it is a question about you.
    await waitFor(() =>
      expect(screen.getByTestId('object-character')).toHaveAttribute('data-attention', 'true'),
    )

    await userEvent.click(screen.getByTestId('object-character'))
    await userEvent.click(screen.getByTestId('energy-70'))

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

    render(<RoomShell repository={repository} />)

    await waitFor(() => expect(screen.getByTestId('object-window')).toBeVisible())
    await userEvent.click(screen.getByTestId('object-window'))

    expect(screen.getByTestId('accuracy-measured').textContent).toMatch(/off by about 10/i)
  })
})
