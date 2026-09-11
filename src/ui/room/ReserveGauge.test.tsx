import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReserveGauge } from './ReserveGauge'

/** The drawn arc, which is the half a number cannot carry. */
const arcLength = (root: HTMLElement): number => {
  const arcs = root.querySelectorAll('circle[stroke-dasharray]')
  const arc = arcs[arcs.length - 1]
  const dash = Number(arc?.getAttribute('stroke-dasharray'))
  const offset = Number(arc?.getAttribute('stroke-dashoffset'))
  return dash - offset
}

/**
 * The corner gauge, and specifically the defect it replaced.
 *
 * The old readout was a pill with the percentage in it, so 67% and 12% drew identically --
 * the figure the room exists to surface had no visual weight behind it at all. Every case
 * here is about the drawing rather than the text, because the text was never the part that
 * was missing.
 */
describe('ReserveGauge', () => {
  it('still says the number', () => {
    render(<ReserveGauge percent={43} />)

    expect(screen.getByText('43%')).toBeVisible()
  })

  it('draws more arc for more reserve, which is what the old pill could not do', () => {
    const { container: low } = render(<ReserveGauge percent={12} />)
    const { container: high } = render(<ReserveGauge percent={67} />)

    expect(arcLength(high)).toBeGreaterThan(arcLength(low))
  })

  it('draws no arc at nothing left, and a full one at full', () => {
    const { container: empty } = render(<ReserveGauge percent={0} />)
    const { container: full } = render(<ReserveGauge percent={100} />)

    expect(arcLength(empty)).toBeCloseTo(0)
    expect(arcLength(full)).toBeCloseTo(2 * Math.PI * 18)
  })

  /**
   * A figure outside 0..100 is clamped for *drawing* and reported as given. `tick` clamps
   * reserves, so this should not arise -- but a gauge that silently rewrote a number into
   * range would be the drawing disagreeing with the reading, which is the whole class of
   * defect this component was rewritten to end.
   */
  it('clamps the arc without rewriting the number', () => {
    const { container } = render(<ReserveGauge percent={140} />)

    expect(arcLength(container)).toBeCloseTo(2 * Math.PI * 18)
    expect(screen.getByText('140%')).toBeVisible()
  })

  /** §1.5: the arc is decoration over a figure that already reads, so assistive tech is told
   *  the number and not the drawing. The label naming it as a way in lives on the button in
   *  `Room.tsx`, which is what owns the tap. */
  it('hides the drawing from assistive tech rather than describing a shape', () => {
    const { container } = render(<ReserveGauge percent={43} />)

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
