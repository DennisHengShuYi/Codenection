import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Repository, type StoredSettings } from '../data'
import { useLowEnergy } from './useLowEnergy'

/**
 * The hook had no test file at all until Ruling 45, which is part of why its writing side
 * could be orphaned by a deletion two tasks away and nothing noticed. `lowEnergy.test.ts`
 * covers the pure rule; what only this level can prove is that the stored preference is
 * read, that changing it is applied and persisted, and -- the half that had rotted -- that
 * the current value is reported back so a control can show which state it is in.
 */
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
function Probe({ repo, floor }: { repo: Repository; floor: number }) {
  const { active, override, setOverride } = useLowEnergy(repo, floor)

  return (
    <div>
      <span data-testid="active">{String(active)}</span>
      <span data-testid="override">{override}</span>
      {(['auto', 'on', 'off'] as const).map((value) => (
        <button key={value} onClick={() => setOverride(value)}>
          {value}
        </button>
      ))}
    </div>
  )
}

const settled = async (expected: StoredSettings['lowEnergyOverride']) =>
  waitFor(() => expect(screen.getByTestId('override')).toHaveTextContent(expected))

describe('useLowEnergy', () => {
  it('infers the mode from the reserve while the setting is auto', async () => {
    render(<Probe repo={stubRepo()} floor={12} />)

    await settled('auto')
    expect(screen.getByTestId('active')).toHaveTextContent('true')
  })

  // The half Ruling 45 needed and the hook did not have: a three-state control cannot show
  // which state it is in without being told, and a control that cannot show it would have
  // to keep its own copy -- two sources of truth for one preference.
  it('reports the stored setting, not only what it resolved to', async () => {
    render(<Probe repo={stubRepo({ loadSettings: async () => ({ lowEnergyOverride: 'off' }) })} floor={12} />)

    await settled('off')
    expect(screen.getByTestId('active')).toHaveTextContent('false')
  })

  it('applies a change immediately and reports it back', async () => {
    render(<Probe repo={stubRepo()} floor={80} />)
    await settled('auto')

    await userEvent.click(screen.getByRole('button', { name: 'on' }))

    await settled('on')
    expect(screen.getByTestId('active')).toHaveTextContent('true')
  })

  it('persists the change so it survives a reload', async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined)
    render(<Probe repo={stubRepo({ saveSettings })} floor={12} />)
    await settled('auto')

    await userEvent.click(screen.getByRole('button', { name: 'off' }))

    // The whole blob, not a patch: settings are persisted as one object, so a setter that
    // wrote only its own field would silently drop the calibration profile beside it.
    await waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, lowEnergyOverride: 'off' }),
    )
  })

  // Unreachable storage falls back to inferred rather than disappearing: §1.5's mode is a
  // product behaviour, not a stored preference that stops existing when a fetch fails.
  it('keeps the defaults when the preference cannot be read', async () => {
    render(<Probe repo={stubRepo({ loadSettings: async () => { throw new Error('offline') } })} floor={12} />)

    await settled('auto')
    expect(screen.getByTestId('active')).toHaveTextContent('true')
  })

  // Applied on screen whether or not it persists. A student switching the mode off should
  // see it turn off, even if the preference cannot be saved for next time.
  it('still applies a change that could not be saved', async () => {
    render(
      <Probe repo={stubRepo({ saveSettings: async () => { throw new Error('offline') } })} floor={12} />,
    )
    await settled('auto')

    await userEvent.click(screen.getByRole('button', { name: 'off' }))

    await settled('off')
    expect(screen.getByTestId('active')).toHaveTextContent('false')
  })
})
