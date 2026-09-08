import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createLocalRepository } from '../data'
import { HomeScreen } from './HomeScreen'

/** A real repository rather than a stand-in: several of these cases are *about* the
 *  interaction with storage, and a stand-in would only verify the test's own
 *  assumptions. Each test gets its own, so one test's saved week cannot decide another's
 *  result. */
const renderHome = () => {
  const repository = createLocalRepository()
  render(<HomeScreen repository={repository} />)
  return repository
}

describe('HomeScreen', () => {
  // §0: no cold start. The first thing a new student sees is a real week, not a blank
  // state and not a spinner that never resolves.
  it('shows a dial on first run with no saved data', async () => {
    renderHome()

    await waitFor(() => expect(screen.getByTestId('capacity-value')).toBeVisible())
    expect(screen.getAllByRole('meter')).toHaveLength(5)
  })

  it('states everything in words as well as in the graphic', async () => {
    renderHome()

    await waitFor(() =>
      expect(screen.getByTestId('reserve-text-equivalent')).toHaveTextContent(/capacity/i),
    )
  })

  it('reports what a rebalance changed, in specifics', async () => {
    renderHome()
    await waitFor(() => expect(screen.getByTestId('rebalance')).toBeEnabled())

    await userEvent.click(screen.getByTestId('rebalance'))

    const report = await screen.findByTestId('rebalance-report')
    // §2.1: never "optimised" -- a claim the app cannot justify to the person who has to
    // live with the week.
    expect(report).not.toHaveTextContent(/optimis|optimiz/i)
  })

  /**
   * Storage that cannot be reached.
   *
   * Every test above uses the local adapter, which essentially never throws -- which is
   * exactly why a missing failure path would go unnoticed. The Supabase adapter throws
   * on every error, so with it configured and the network down a student would be left
   * staring at the loading sentence forever, plus an unhandled rejection in the console.
   * Falling back to the seeded week is worse than their real data and far better than a
   * screen that never resolves.
   */
  it('still shows a week when storage cannot be read', async () => {
    const broken = {
      loadWeek: () => Promise.reject(new Error('network down')),
      saveWeek: () => Promise.reject(new Error('network down')),
      loadSettings: () => Promise.reject(new Error('network down')),
      saveSettings: () => Promise.reject(new Error('network down')),
      clear: () => Promise.reject(new Error('network down')),
    }

    render(<HomeScreen repository={broken} />)

    await waitFor(() => expect(screen.getByTestId('capacity-value')).toBeVisible())
  })

  it('does not fall over when saving fails', async () => {
    const readOnly = {
      loadWeek: () => Promise.resolve(null),
      saveWeek: () => Promise.reject(new Error('network down')),
      loadSettings: () => Promise.resolve({ lowEnergyOverride: 'auto' as const }),
      saveSettings: () => Promise.reject(new Error('network down')),
      clear: () => Promise.resolve(),
    }

    render(<HomeScreen repository={readOnly} />)
    await waitFor(() => expect(screen.getByTestId('rebalance')).toBeEnabled())

    await userEvent.click(screen.getByTestId('rebalance'))

    // The rebalance still shows on screen even though it could not be persisted.
    expect(await screen.findByTestId('rebalance-report')).toBeVisible()
  })

  // The reason the repository exists at all: a week that resets on every visit cannot
  // hold a real student's fortnight.
  it('saves the rebalanced week so it survives a reload', async () => {
    const repository = renderHome()
    await waitFor(() => expect(screen.getByTestId('rebalance')).toBeEnabled())

    await userEvent.click(screen.getByTestId('rebalance'))

    await waitFor(async () => expect(await repository.loadWeek()).not.toBeNull())
  })
})
