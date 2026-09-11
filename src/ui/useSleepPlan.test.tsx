import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Repository } from '../data'
import { DEFAULT_SLEEP_HOURS } from '../engine'
import { useSleepPlan } from './useSleepPlan'

function stubRepo(over: Partial<Repository> = {}): Repository {
  return {
    loadWeek: async () => null,
    saveWeek: async () => undefined,
    loadSettings: async () => DEFAULT_SETTINGS,
    saveSettings: async () => undefined,
    loadBlockLog: async () => [],
    recordBlockAnswer: async () => undefined,
    clear: async () => undefined,
    ...over,
  } as Repository
}

/** A window onto the hook, since a hook cannot be asserted on directly. */
function Probe({ repo }: { repo: Repository }) {
  const { targetHours, hasTarget, nights, setTarget, reportNight, problem } = useSleepPlan(repo)

  return (
    <div>
      <span data-testid="target">{targetHours}</span>
      <span data-testid="stated">{String(hasTarget)}</span>
      <span data-testid="nights">{nights.map((n) => `${n.isoDate}:${n.hours}`).join(',')}</span>
      <span data-testid="problem">{problem ?? ''}</span>
      <button onClick={() => setTarget(9)}>target 9</button>
      <button onClick={() => reportNight('2026-09-12', 'six')}>report six</button>
      <button onClick={() => reportNight('2026-09-12', 'eightPlus')}>report eight</button>
    </div>
  )
}

const target = async (expected: number) =>
  waitFor(() => expect(screen.getByTestId('target')).toHaveTextContent(String(expected)))

describe('useSleepPlan', () => {
  /**
   * Defaulted and stated are different facts, and the hook has to report which. `sleepReality`
   * compares against a stated target and the bed keeps its population norm without one, so a
   * hook that answered only "8" would make every student look as though they had set it.
   */
  it('falls back to the assumed night, and says nobody stated it', async () => {
    render(<Probe repo={stubRepo()} />)

    await target(DEFAULT_SLEEP_HOURS)
    expect(screen.getByTestId('stated')).toHaveTextContent('false')
  })

  it('loads a stated target and the nights behind it', async () => {
    const repo = stubRepo({
      loadSettings: async () => ({
        ...DEFAULT_SETTINGS,
        sleepTargetHours: 6,
        sleepNights: [{ isoDate: '2026-09-10', hours: 5, answeredAt: 1 }],
      }),
    })
    render(<Probe repo={repo} />)

    await target(6)
    expect(screen.getByTestId('stated')).toHaveTextContent('true')
    expect(screen.getByTestId('nights')).toHaveTextContent('2026-09-10:5')
  })

  it('applies a new target immediately and persists it', async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined)
    render(<Probe repo={stubRepo({ saveSettings })} />)
    await target(DEFAULT_SLEEP_HOURS)

    await userEvent.click(screen.getByRole('button', { name: 'target 9' }))

    await target(9)
    await waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ sleepTargetHours: 9 }),
      ),
    )
  })

  it('records a reported night and persists it', async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined)
    render(<Probe repo={stubRepo({ saveSettings })} />)
    await target(DEFAULT_SLEEP_HOURS)

    await userEvent.click(screen.getByRole('button', { name: 'report six' }))

    await waitFor(() =>
      expect(screen.getByTestId('nights')).toHaveTextContent('2026-09-12:6'),
    )
    await waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          sleepNights: [expect.objectContaining({ isoDate: '2026-09-12', hours: 6 })],
        }),
      ),
    )
  })

  /** End to end through the hook, not only through `recordNight`: two records for one night
   *  would double-count it in every average `sleepReality` takes. */
  it('corrects a night answered twice rather than stacking it', async () => {
    render(<Probe repo={stubRepo()} />)
    await target(DEFAULT_SLEEP_HOURS)

    await userEvent.click(screen.getByRole('button', { name: 'report six' }))
    await waitFor(() => expect(screen.getByTestId('nights')).toHaveTextContent('2026-09-12:6'))

    await userEvent.click(screen.getByRole('button', { name: 'report eight' }))

    await waitFor(() =>
      expect(screen.getByTestId('nights')).toHaveTextContent('2026-09-12:8.5'),
    )
  })

  /**
   * The convention `useSchedule`, `useBlockLog` and `useLowEnergy` all share, and the
   * project's rule that a failed write is never silently swallowed: the change stays on
   * screen, and the student is told it did not save. A change that applied and then vanished
   * later, silently, is the specific bug that rule exists to stop.
   */
  it('keeps a change that could not be saved, and says so', async () => {
    const repo = stubRepo({
      saveSettings: async () => {
        throw new Error('offline')
      },
    })
    render(<Probe repo={repo} />)
    await target(DEFAULT_SLEEP_HOURS)

    await userEvent.click(screen.getByRole('button', { name: 'target 9' }))

    await target(9)
    await waitFor(() => expect(screen.getByTestId('problem')).not.toHaveTextContent(''))
  })

  it('keeps the defaults when the preference cannot be read', async () => {
    const repo = stubRepo({
      loadSettings: async () => {
        throw new Error('offline')
      },
    })
    render(<Probe repo={repo} />)

    await target(DEFAULT_SLEEP_HOURS)
    expect(screen.getByTestId('stated')).toHaveTextContent('false')
  })
})
