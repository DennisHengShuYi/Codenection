import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, type CalibrationProfile } from '../../domain/calibration'
import { HowYouWork } from './HowYouWork'

const profile = (over: Partial<CalibrationProfile> = {}): CalibrationProfile => ({
  ...DEFAULT_PROFILE,
  ...over,
})

const overran = (count: number) =>
  Array.from({ length: count }, () => ({
    type: 'mental' as const,
    plannedHours: 2,
    actualHours: 4,
  }))

/**
 * §7.6, and the rule that makes it worth anything: every line is only shown when it is
 * actually true of this student. A screen claiming a measurement nobody made is worse than a
 * screen with fewer lines.
 */
describe('HowYouWork', () => {
  it('says plainly that nothing is measured yet, rather than inventing lines', () => {
    render(<HowYouWork profile={DEFAULT_PROFILE} />)

    expect(screen.getByTestId('how-you-work')).toHaveTextContent(/nothing measured yet/i)
  })

  // §7.7: the meter makes an empty screen read as progress rather than as emptiness.
  it('shows how far tuned it is', () => {
    render(<HowYouWork profile={DEFAULT_PROFILE} />)

    expect(screen.getByTestId('how-you-work').textContent).toMatch(/\d+% tuned/i)
  })

  it('says how long you focus once the mode has been chosen', () => {
    render(<HowYouWork profile={profile({ modeChosen: true })} />)

    expect(screen.getByTestId('how-you-work').textContent).toMatch(/focus for about \d+ minutes/i)
  })

  it('names your best hours once they have been painted', () => {
    render(<HowYouWork profile={profile({ painted: true, peakStartHour: 9 })} />)

    expect(screen.getByTestId('how-you-work').textContent).toMatch(/best hours start around 9/i)
  })

  it('does not claim best hours that were never measured', () => {
    render(<HowYouWork profile={profile({ modeChosen: true, peakStartHour: null })} />)

    expect(screen.getByTestId('how-you-work').textContent).not.toMatch(/best hours/i)
  })

  // §2.4's second surface, and the line §7.6 quotes almost verbatim.
  it('names an estimate bias once there is enough history to mean it', () => {
    render(<HowYouWork profile={profile({ confirmations: overran(5) })} />)

    expect(screen.getByTestId('how-you-work').textContent).toMatch(/underestimate.*pad/i)
  })

  it('claims no bias from a single block', () => {
    render(<HowYouWork profile={profile({ confirmations: overran(1) })} />)

    expect(screen.getByTestId('how-you-work').textContent).not.toMatch(/underestimate/i)
  })

  it('grows as more is known', () => {
    render(<HowYouWork profile={profile({ modeChosen: true, painted: true, peakStartHour: 9, confirmations: overran(5) })} />)

    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(2)
  })
})
