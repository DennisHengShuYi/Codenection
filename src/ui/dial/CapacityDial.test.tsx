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

const renderDial = (capacity: number, reserves: Reserves = healthy, compact = false) => {
  const projection = project(reserves, days(), DEFAULT_PARAMS)

  return render(
    <CapacityDial
      capacity={capacity}
      bars={domainBars(reserves, projection, days(), 0)}
      projection={projection}
      compact={compact}
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

  /**
   * The number is reserve remaining, and now says so. It read "90% capacity", which inverts
   * the sense: `overallReserve` is what the student has *left*, and `tick` clamps it to 100 --
   * so a perfectly rested student was told they were at 100% capacity. `RequestBoxScreen` had
   * already recorded that load-against-capacity is "a metric this app does not have".
   */
  it('states everything it draws in words as well', () => {
    renderDial(90)

    const spoken = screen.getByTestId('reserve-text-equivalent')

    expect(spoken).toHaveTextContent(/90% of your reserve left/i)
    expect(spoken).not.toHaveTextContent(/% capacity/i)
  })

  /**
   * §1.1: once the room is the surface, the dial sits in one corner as a compact
   * readout. It carries its own test id so two dials on one page never collide.
   */
  it('drops the bars and the summary in its compact form', () => {
    renderDial(90, healthy, true)

    expect(screen.queryAllByRole('meter')).toHaveLength(0)
    expect(screen.queryByTestId('reserve-text-equivalent')).toBeNull()
    expect(screen.getByTestId('capacity-value-compact')).toHaveTextContent('90%')
  })

  // The completely drained student is precisely the one most likely to open the app.
  it('renders with everything at zero rather than throwing', () => {
    const flat: Reserves = { mental: 0, physical: 0, social: 0, errands: 0 }

    expect(() => renderDial(0, flat)).not.toThrow()
  })
})

/**
 * The headline row: a bounded readout beside the number it reads, rather than a needle the
 * size of the panel with the answer somewhere beneath it.
 */
describe('the gauge as a readout', () => {
  it('says what the number is a percentage of', () => {
    renderDial(43)

    // The text equivalent says the same thing in its own sentence, which is the point --
    // so this matches the caption's own wording rather than the phrase they share.
    expect(screen.getByText(/of your reserve left, as today began/i)).toBeVisible()
  })

  /** The compact readout is one figure in a corner; a sentence beside it is a second thing
   *  to read, which is the whole reason §1.1 has a compact form at all. */
  it('leaves the compact readout as a bare figure', () => {
    renderDial(43, healthy, true)

    expect(screen.queryByText(/of your reserve left, as today began/i)).toBeNull()
  })
})
