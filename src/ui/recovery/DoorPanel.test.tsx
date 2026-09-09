import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DoorPanel } from './DoorPanel'

const setup = (gapHours = 3) => {
  const props = { gapHours, onChoose: vi.fn(), onClose: vi.fn() }
  render(<DoorPanel {...props} />)
  return props
}

/**
 * §5.3: three taps from feeling bad to having a plan. Tap the lit door, get three options
 * filtered by the gap you have, tap one, it is scheduled and protected.
 */
describe('DoorPanel', () => {
  it('shows three options', () => {
    setup()

    expect(screen.getAllByTestId(/^outing-/)).toHaveLength(3)
  })

  // Without the time and the cost the choice is not a real one.
  it('says how long each takes and what it costs', () => {
    setup()

    for (const option of screen.getAllByTestId(/^outing-/)) {
      expect(option.textContent).toMatch(/\d/)
    }
  })

  it('hands back the one that was chosen', async () => {
    const props = setup()

    await userEvent.click(screen.getAllByTestId(/^outing-/)[0]!)

    expect(props.onChoose).toHaveBeenCalledOnce()
  })

  it('can be closed', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /close|not now/i }))

    expect(props.onClose).toHaveBeenCalledOnce()
    expect(props.onChoose).not.toHaveBeenCalled()
  })

  it('says so when the gap is too small for anything, rather than showing an empty box', () => {
    setup(0)

    expect(screen.getByTestId('door-panel')).toHaveTextContent(/no time|not enough/i)
    expect(screen.queryAllByTestId(/^outing-/)).toHaveLength(0)
  })

  it('offers fewer when only fewer fit', () => {
    setup(0.5)

    expect(screen.getAllByTestId(/^outing-/).length).toBeLessThan(3)
  })

  /**
   * This is the flow a student uses when they are at their worst. A mouse-only path is one
   * more obstacle at exactly the wrong moment, so every option has to be a real button
   * rather than a clickable div.
   */
  it('makes every option reachable by keyboard', async () => {
    const props = setup()

    screen.getAllByTestId(/^outing-/)[0]!.focus()
    await userEvent.keyboard('{Enter}')

    expect(props.onChoose).toHaveBeenCalledOnce()
  })
})
