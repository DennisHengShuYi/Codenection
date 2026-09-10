import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { EnergyPoint } from '../../domain/energyHistory'
import { Sparkline } from './Sparkline'

const points = (...values: number[]): EnergyPoint[] =>
  values.map((value, index) => ({ date: `2026-09-${String(index + 1).padStart(2, '0')}`, value }))

/**
 * The brief's stress tracker: how the student has actually felt, over time. The week grid
 * shows the load the app is planning; this shows what they reported living through, which
 * is the question the brief actually asks and the one nothing in the app answered.
 */
describe('Sparkline', () => {
  it('draws a point for every day reported', () => {
    render(<Sparkline points={points(30, 50, 70, 40)} />)

    expect(screen.getByTestId('sparkline').getAttribute('points')?.split(' ')).toHaveLength(4)
  })

  /** §0: no cold start, and nothing drawn is better than an empty axis implying data that
   *  does not exist. */
  it('renders nothing at all with no history', () => {
    render(<Sparkline points={[]} />)

    expect(screen.queryByTestId('sparkline')).not.toBeInTheDocument()
  })

  /**
   * §1.5: the picture never carries the meaning alone, and the words stay in the document
   * for everyone rather than being hidden behind assistive technology -- the same choice
   * `CapacityDial` makes for the gauge.
   */
  it('says in words what the line shows', () => {
    render(<Sparkline points={points(30, 40, 70)} />)

    expect(screen.getByTestId('sparkline-text')).toHaveTextContent(/going up/i)
  })

  /**
   * A flat run must not collapse to a divide-by-zero or draw off-canvas. Every reported day
   * identical is an ordinary week, not an edge case.
   */
  it('draws a flat run without breaking', () => {
    render(<Sparkline points={points(50, 50, 50)} />)

    const drawn = screen.getByTestId('sparkline').getAttribute('points') ?? ''

    expect(drawn).not.toMatch(/NaN|Infinity/)
    expect(drawn.split(' ')).toHaveLength(3)
  })

  /** The scale is the reserve scale, fixed at 0-100, not fitted to the data. A chart that
   *  rescaled itself would draw a calm week and a crisis identically. */
  it('plots against the reserve scale rather than the range it happens to hold', () => {
    render(<Sparkline points={points(40, 50, 60)} />)
    const narrow = screen.getByTestId('sparkline').getAttribute('points') ?? ''

    render(<Sparkline points={points(0, 50, 100)} />)
    const wide = screen.getAllByTestId('sparkline')[1]?.getAttribute('points') ?? ''

    expect(narrow).not.toBe(wide)
  })
})
