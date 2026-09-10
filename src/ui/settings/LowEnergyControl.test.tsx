import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LowEnergyControl } from './LowEnergyControl'

/**
 * §1.5's manual override, at last given somewhere to be said.
 *
 * Three states rather than a toggle, and that is the load-bearing decision: with only
 * on/off, a student who touches the control is stranded away from inferred behaviour with
 * no way back to it -- the setting would silently become permanent the first time it was
 * used, which is a worse version of the problem it exists to solve.
 */
describe('LowEnergyControl', () => {
  it('offers all three states, not a two-way toggle', () => {
    render(<LowEnergyControl value="auto" onChange={vi.fn()} />)

    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /decide for me/i })).toBeVisible()
    expect(screen.getByRole('radio', { name: /simplified interface/i })).toBeVisible()
    expect(screen.getByRole('radio', { name: /full interface/i })).toBeVisible()
  })

  it('shows which state is in force', () => {
    render(<LowEnergyControl value="off" onChange={vi.fn()} />)

    expect(screen.getByRole('radio', { name: /full interface/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /decide for me/i })).not.toBeChecked()
  })

  it('reports the state chosen', async () => {
    const onChange = vi.fn()
    render(<LowEnergyControl value="auto" onChange={onChange} />)

    await userEvent.click(screen.getByRole('radio', { name: /simplified interface/i }))

    expect(onChange).toHaveBeenCalledWith('on')
  })

  // The way back. Chosen deliberately as its own case: it is the one an on/off toggle
  // cannot express, and the one whose absence would not fail any of the others.
  it('offers a way back to the inferred setting', async () => {
    const onChange = vi.fn()
    render(<LowEnergyControl value="on" onChange={onChange} />)

    await userEvent.click(screen.getByRole('radio', { name: /decide for me/i }))

    expect(onChange).toHaveBeenCalledWith('auto')
  })

  // One group, named. Three loose radios read out as three unrelated yes/no questions to a
  // screen reader, which is exactly the wrong shape for a choice of one from three.
  it('is one named group rather than three loose controls', () => {
    render(<LowEnergyControl value="auto" onChange={vi.fn()} />)

    expect(screen.getByRole('group', { name: /how much to show/i })).toBeVisible()
  })
  /**
   * Ruling 58. These were three bare browser radios with the explanation beside them as
   * loose text, so the only thing you could press was the 8px dot. Each option is now a
   * row: the whole thing, its explanation included, selects that option.
   */
  it('selects the option when its explanation is pressed, not only the dot', async () => {
    const onChange = vi.fn()
    render(<LowEnergyControl value="auto" onChange={onChange} />)

    await userEvent.click(screen.getByText(/one number and one action/i))

    expect(onChange).toHaveBeenCalledWith('on')
  })

  it('marks the chosen row as chosen, so the selection reads without hunting for the dot', () => {
    render(<LowEnergyControl value="on" onChange={vi.fn()} />)

    expect(screen.getByTestId('low-energy-option-on')).toHaveAttribute('data-selected', 'true')
    expect(screen.getByTestId('low-energy-option-off')).toHaveAttribute('data-selected', 'false')
  })
})
