import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import { createLocalRepository } from '../data'
import { HomeScreen } from './HomeScreen'

/**
 * §1.5's low-energy mode, driven through the real screen rather than the rule in
 * isolation.
 *
 * The rule itself is unit-tested; what this covers is the wiring -- that a depleted week
 * actually reaches the stripped-back view, and that the way out of it is honoured and
 * remembered.
 */
const drainedWeek = () => ({
  items: [],
  // Below the threshold on every reserve, so the floor is unambiguously low.
  start: { mental: 8, physical: 9, social: 7, errands: 10 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 6),
})

let counter = 0

const renderDrained = async () => {
  counter += 1
  const repository = createLocalRepository(`low-energy-${counter}`)
  await repository.clear()
  await repository.saveWeek(drainedWeek())

  render(<HomeScreen repository={repository} />)
  return repository
}

describe('HomeScreen in low energy', () => {
  // §1.5: "A student at 12% reserve should not be handed a dashboard."
  it('collapses to one number and one action when the reserve is low', async () => {
    await renderDrained()

    await waitFor(() => expect(screen.getByTestId('capacity-value')).toBeVisible())
    expect(screen.queryAllByRole('meter')).toHaveLength(0)
  })

  // Never coercive: an interface a struggling student cannot dismiss is one more thing
  // being done to them.
  it('lets the student ask for the full view back', async () => {
    await renderDrained()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /show everything/i })).toBeVisible(),
    )

    await userEvent.click(screen.getByRole('button', { name: /show everything/i }))

    await waitFor(() => expect(screen.getAllByRole('meter')).toHaveLength(5))
  })

  it('remembers that choice, so it is not made again every visit', async () => {
    const repository = await renderDrained()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /show everything/i })).toBeVisible(),
    )

    await userEvent.click(screen.getByRole('button', { name: /show everything/i }))

    await waitFor(async () =>
      expect((await repository.loadSettings()).lowEnergyOverride).toBe('off'),
    )
  })
})
