import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyGrid } from '../../domain/painter'
import { Painter } from './Painter'

const setup = (grid = emptyGrid()) => {
  const props = { grid, onChange: vi.fn() }
  render(<Painter {...props} />)
  return props
}

/** §7.2: three days, tap only what is wrong, roughly twenty seconds. */
describe('Painter', () => {
  it('shows three days of twenty-four hours', () => {
    setup()

    expect(screen.getAllByTestId(/^cell-/)).toHaveLength(72)
  })

  it('names the three days §7.2 asks for rather than abstract ones', () => {
    setup()

    expect(screen.getByTestId('painter').textContent).toMatch(/yesterday/i)
    expect(screen.getByTestId('painter').textContent).toMatch(/weekend/i)
  })

  it('advances a cell when it is tapped', async () => {
    const props = setup()

    await userEvent.click(screen.getByTestId('cell-0-9'))

    expect(props.onChange).toHaveBeenCalledOnce()
  })

  it('tells the student what a tap will do, so nothing has to be guessed', () => {
    setup()

    expect(screen.getByTestId('painter').textContent).toMatch(/free.*study.*work/i)
  })

  /**
   * The densest control in the app. A grid of unlabelled coloured squares is unusable to
   * anybody not looking at it, and §1.5 already holds the room to this standard.
   */
  it('gives every cell a name saying its day, hour and state', () => {
    setup()

    expect(screen.getByTestId('cell-0-9')).toHaveAccessibleName(/yesterday.*9:00.*free/i)
  })

  it('every cell is a real button rather than a coloured div', () => {
    setup()

    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(72)
  })

  // §10: wide content scrolls inside its own container, never the page.
  it('keeps its own overflow rather than pushing the page sideways', () => {
    setup()

    expect(screen.getByTestId('painter').className).toMatch(/overflow-x-auto/)
  })
})
