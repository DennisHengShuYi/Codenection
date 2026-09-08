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

  // The reason the repository exists at all: a week that resets on every visit cannot
  // hold a real student's fortnight.
  it('saves the rebalanced week so it survives a reload', async () => {
    const repository = renderHome()
    await waitFor(() => expect(screen.getByTestId('rebalance')).toBeEnabled())

    await userEvent.click(screen.getByTestId('rebalance'))

    await waitFor(async () => expect(await repository.loadWeek()).not.toBeNull())
  })
})
