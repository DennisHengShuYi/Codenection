import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository, DEFAULT_SETTINGS } from '../data'
import { DEFAULT_PROFILE } from '../domain/calibration'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { HomeScreen } from './HomeScreen'

/**
 * §2.4's silent half, end to end.
 *
 * The how-you-work line told a student they underestimate writing; this proves the app also
 * *acts* on it. Telling somebody their estimates are 2× out while still planning their week
 * at 1× leaves them to do the correction themselves, which is precisely what §2.4 says not
 * to ask of them.
 */
beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no endpoint'))))
afterEach(() => vi.unstubAllGlobals())

const week = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const overran = (count: number) =>
  Array.from({ length: count }, () => ({
    type: 'mental' as const,
    plannedHours: 2,
    actualHours: 4,
  }))

let counter = 0

const renderHome = async (confirmations: ReturnType<typeof overran>) => {
  counter += 1
  const repository = createLocalRepository(`padding-screen-${counter}`)
  await repository.clear()
  await repository.saveWeek(week())
  await repository.saveSettings({
    ...DEFAULT_SETTINGS,
    calibration: { ...DEFAULT_PROFILE, confirmations },
  })

  render(<HomeScreen repository={repository} />)
  await waitFor(() => expect(screen.getByTestId('open-planner')).toBeVisible())

  return repository
}

const addAnEssay = async () => {
  await userEvent.click(screen.getByTestId('open-planner'))
  await userEvent.type(screen.getByLabelText(/on your mind/i), 'essay 2 hours')
  await userEvent.click(screen.getByRole('button', { name: /read this/i }))
  await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(1))
  await userEvent.click(screen.getByRole('button', { name: /add these/i }))
}

describe('HomeScreen applying Reality Check', () => {
  it('plans at face value for a student with no measured bias', async () => {
    const repository = await renderHome([])

    await addAnEssay()

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(1))
    expect((await repository.loadWeek())?.items[0]?.hours).toBe(2)
  })

  // The point of the whole change: measured, so applied.
  it('pads the estimate for a student who consistently overruns', async () => {
    const repository = await renderHome(overran(5))

    await addAnEssay()

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(1))
    expect((await repository.loadWeek())?.items[0]?.hours).toBeGreaterThan(2)
  })

  // §2.4: applied silently. The student is not asked to be more realistic, and nothing on
  // screen demands they act on the correction.
  it('does not ask the student to do anything about it', async () => {
    await renderHome(overran(5))

    await addAnEssay()

    expect(document.body.textContent).not.toMatch(/be more realistic|adjust your estimate/i)
  })
})
