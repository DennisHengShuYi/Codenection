import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createLocalRepository } from '../data'
import { RoomShell } from './room/RoomShell'

/** A real repository rather than a stand-in: several of these cases are *about* the
 *  interaction with storage, and a stand-in would only verify the test's own
 *  assumptions. Each test gets its own, so one test's saved week cannot decide another's
 *  result. */
const renderHome = () => {
  const repository = createLocalRepository()
  render(<RoomShell repository={repository} />)
  return repository
}

describe('RoomShell', () => {
  // §0: no cold start. The first thing a new student sees is a real week, not a blank
  // state and not a spinner that never resolves.
  it('shows a dial on first run with no saved data', async () => {
    renderHome()

    await waitFor(() => expect(screen.getByTestId('object-light')).toBeVisible())
    await userEvent.click(screen.getByTestId('object-light'))
    expect(screen.getByTestId('capacity-value')).toBeVisible()
    expect(screen.getAllByRole('meter')).toHaveLength(5)
  })

  /**
   * §1.5's words are the sidebar now, and they say more than they used to: the sidebar
   * states the room *and* lets you operate it. The dial keeps its own equivalent behind the
   * light, which is where the dial itself lives.
   */
  it('states everything in words as well as in the graphic', async () => {
    renderHome()

    await waitFor(() => expect(screen.getByTestId('room-text-equivalent')).toBeVisible())

    await userEvent.click(screen.getByTestId('object-light'))
    expect(screen.getByTestId('reserve-text-equivalent')).toHaveTextContent(/capacity/i)
  })

  /**
   * The solve is genuinely slow -- over a second on a laptop and several on CI, which is
   * roughly phone-class hardware. §2.1's 100ms budget is not met, and until it is, the
   * screen has to be honest about the wait rather than looking frozen.
   *
   * The button must therefore go into a working state that the browser has actually
   * painted before the solver takes the main thread. Without a yield first, React never
   * gets to render it and the student taps a dead button.
   */
  it('shows it is working before the solver takes the main thread', async () => {
    renderHome()
    await waitFor(() => expect(screen.getByTestId('object-ceiling')).toBeVisible())

    // fireEvent rather than userEvent, deliberately. userEvent awaits and flushes the
    // pending timer, so the whole solve finishes before it returns and the working state
    // has already been cleared. fireEvent dispatches synchronously and stops at the
    // handler's first await -- which is precisely the moment being asserted.
    fireEvent.click(screen.getByTestId('object-ceiling'))
    fireEvent.click(screen.getByTestId('rebalance'))

    expect(screen.getByTestId('rebalance')).toBeDisabled()
    expect(screen.getByTestId('rebalance')).toHaveTextContent(/working out/i)

    await screen.findByTestId('rebalance-report', undefined, { timeout: 20_000 })
    expect(screen.getByTestId('rebalance')).toBeEnabled()
  }, 30_000)

  it('reports what a rebalance changed, in specifics', async () => {
    renderHome()
    await waitFor(() => expect(screen.getByTestId('object-ceiling')).toBeVisible())

    await userEvent.click(screen.getByTestId('object-ceiling'))
    await userEvent.click(screen.getByTestId('rebalance'))

    const report = await screen.findByTestId('rebalance-report')
    // §2.1: never "optimised" -- a claim the app cannot justify to the person who has to
    // live with the week.
    expect(report).not.toHaveTextContent(/optimis|optimiz/i)
    // 30s because this drives the real solver, which takes over a second on a laptop and
    // several times that on a CI runner. The assertion is unchanged; only the budget for
    // a genuinely slow computation is. See the §2.1 note above.
  }, 30_000)

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
      loadBlockLog: () => Promise.reject(new Error('network down')),
      recordBlockAnswer: () => Promise.reject(new Error('network down')),
      clear: () => Promise.reject(new Error('network down')),
    }

    render(<RoomShell repository={broken} />)

    await waitFor(() => expect(screen.getByTestId('object-light')).toBeVisible())
    await userEvent.click(screen.getByTestId('object-light'))
    expect(screen.getByTestId('capacity-value')).toBeVisible()
  })

  it('does not fall over when saving fails', async () => {
    const readOnly = {
      loadWeek: () => Promise.resolve(null),
      saveWeek: () => Promise.reject(new Error('network down')),
      loadSettings: () => Promise.resolve({ lowEnergyOverride: 'auto' as const }),
      saveSettings: () => Promise.reject(new Error('network down')),
      loadBlockLog: () => Promise.resolve([]),
      recordBlockAnswer: () => Promise.reject(new Error('network down')),
      clear: () => Promise.resolve(),
    }

    render(<RoomShell repository={readOnly} />)
    await waitFor(() => expect(screen.getByTestId('object-ceiling')).toBeVisible())

    await userEvent.click(screen.getByTestId('object-ceiling'))
    await userEvent.click(screen.getByTestId('rebalance'))

    // The rebalance still shows on screen even though it could not be persisted.
    expect(await screen.findByTestId('rebalance-report')).toBeVisible()
  }, 30_000)

  // The reason the repository exists at all: a week that resets on every visit cannot
  // hold a real student's fortnight.
  it('saves the rebalanced week so it survives a reload', async () => {
    const repository = renderHome()
    await waitFor(() => expect(screen.getByTestId('object-ceiling')).toBeVisible())

    await userEvent.click(screen.getByTestId('object-ceiling'))
    await userEvent.click(screen.getByTestId('rebalance'))

    await waitFor(async () => expect(await repository.loadWeek()).not.toBeNull())
  }, 30_000)
})
