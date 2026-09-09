import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { EnergyPrediction } from '../../domain/predictions'
import { AccuracyNote } from './AccuracyNote'

const scored = (pairs: ReadonlyArray<[number, number]>): EnergyPrediction[] =>
  pairs.map(([predicted, reported], index) => ({
    forDate: `2026-09-${String(10 + index).padStart(2, '0')}`,
    predicted,
    reported,
  }))

describe('AccuracyNote', () => {
  /**
   * §8.1: score the two-day predictions and publish mean absolute error. That is the
   * accuracy number the app displays.
   */
  it('publishes the error once predictions have resolved', () => {
    render(<AccuracyNote predictions={scored([[70, 60], [65, 60]])} />)

    expect(screen.getByTestId('accuracy-measured').textContent).toMatch(/7\.5|8/)
  })

  // Zero resolved predictions is no measurement, not zero error.
  it('says there is not enough data rather than claiming a number', () => {
    render(<AccuracyNote predictions={[]} />)

    expect(screen.getByTestId('accuracy-measured').textContent).toMatch(/not enough data/i)
  })

  /**
   * §8.2, and the reason this test exists at all: the 21-day projection is never described
   * as validated, and that has to be said **in the product copy, not only in the pitch**.
   * A disclaimer that lives only in a slide is not a disclaimer.
   */
  it('says in the interface that the three-week outlook is not validated', () => {
    render(<AccuracyNote predictions={scored([[70, 60]])} />)

    const disclaimer = screen.getByTestId('accuracy-disclaimer').textContent ?? ''

    expect(disclaimer).toMatch(/not a validated|decision aid/i)
  })

  it('shows the disclaimer even before anything has been measured', () => {
    render(<AccuracyNote predictions={[]} />)

    expect(screen.getByTestId('accuracy-disclaimer')).toBeVisible()
  })

  // Adjacent on purpose: one claim is scored and the other is not, and separating them would
  // let the honest number lend credibility to the unproven one.
  it('keeps the measured claim and the unvalidated one together', () => {
    render(<AccuracyNote predictions={scored([[70, 60]])} />)

    const note = screen.getByTestId('accuracy-note')

    expect(note).toContainElement(screen.getByTestId('accuracy-measured'))
    expect(note).toContainElement(screen.getByTestId('accuracy-disclaimer'))
  })
})
