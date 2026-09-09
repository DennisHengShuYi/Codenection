import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EnergyCheckIn } from './EnergyCheckIn'

const setup = () => {
  const props = { onReport: vi.fn(), onDismiss: vi.fn() }
  render(<EnergyCheckIn {...props} />)
  return props
}

/**
 * The one question §8.1 depends on. Without it, predictions are made and never resolved, and
 * the published accuracy reads "not enough data" forever.
 */
describe('EnergyCheckIn', () => {
  it('asks one question', () => {
    setup()

    expect(screen.getByTestId('energy-check-in')).toHaveTextContent(/how is your energy/i)
  })

  // §7.5: ask relative, not absolute. Nobody knows their energy as a number.
  it('offers bands rather than asking for a number', () => {
    setup()

    expect(screen.getAllByTestId(/^energy-\d/).length).toBeGreaterThan(2)
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('slider')).toBeNull()
  })

  it('reports a figure the model can use', async () => {
    const props = setup()

    await userEvent.click(screen.getByTestId('energy-30'))

    expect(props.onReport).toHaveBeenCalledWith(30)
  })

  it('reports in one tap', async () => {
    const props = setup()

    await userEvent.click(screen.getByTestId('energy-70'))

    expect(props.onReport).toHaveBeenCalledOnce()
  })

  // §7.9's rule applies here too: a prompt nobody can escape is one they learn to dread.
  it('can be ignored', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /not now/i }))

    expect(props.onDismiss).toHaveBeenCalledOnce()
    expect(props.onReport).not.toHaveBeenCalled()
  })

  it('says why it is asking, rather than demanding data for nothing', () => {
    setup()

    expect(screen.getByTestId('energy-check-in').textContent).toMatch(/predictions|any good/i)
  })
})
