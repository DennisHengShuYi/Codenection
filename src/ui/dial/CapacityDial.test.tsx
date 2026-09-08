import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PARAMS,
  HORIZON_DAYS,
  project,
  type DayInput,
  type Reserves,
} from '../../engine'
import { CapacityDial } from './CapacityDial'
import { domainBars } from './domainBars'

const healthy: Reserves = { mental: 80, physical: 80, social: 80, errands: 80 }

const days = (): DayInput[] =>
  Array.from({ length: HORIZON_DAYS }, (_, dayIndex) => ({
    dayIndex,
    activities: [],
    sleepHours: 7,
    venueChanges: 0,
    daysToNearestDeadline: null,
    checkedIn: true,
  }))

const renderDial = (capacity: number, reserves: Reserves = healthy) => {
  const projection = project(reserves, days(), DEFAULT_PARAMS)

  return render(
    <CapacityDial
      capacity={capacity}
      bars={domainBars(reserves, projection, days())}
      projection={projection}
    />,
  )
}

describe('CapacityDial', () => {
  it('shows the headline percentage in the centre', () => {
    renderDial(90)

    expect(screen.getByTestId('capacity-value')).toHaveTextContent('90%')
  })

  // A percentage with decimals invites precision the model does not have.
  it('rounds rather than showing a long decimal', () => {
    renderDial(90.4)

    expect(screen.getByTestId('capacity-value')).toHaveTextContent('90%')
  })

  it('renders all five domain bars', () => {
    renderDial(90)

    expect(screen.getAllByRole('meter')).toHaveLength(5)
  })

  // §10: a viewBox and no fixed width is the whole argument for hand-rolling the gauge
  // rather than using canvas or an image -- it scales at every breakpoint without a
  // single media query.
  it('scales with its container rather than fixing a pixel width', () => {
    renderDial(90)
    const svg = screen.getByTestId('dial-gauge')

    expect(svg).toHaveAttribute('viewBox')
    expect(svg).not.toHaveAttribute('width')
  })

  it('states everything it draws in words as well', () => {
    renderDial(90)

    expect(screen.getByTestId('reserve-text-equivalent')).toHaveTextContent(/90% capacity/i)
  })

  // The completely drained student is precisely the one most likely to open the app.
  it('renders with everything at zero rather than throwing', () => {
    const flat: Reserves = { mental: 0, physical: 0, social: 0, errands: 0 }

    expect(() => renderDial(0, flat)).not.toThrow()
  })
})
