import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RoomComparison } from './RoomComparison'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'
import { roomModel } from './roomModel'

/** The comparison takes models, because the room does. Built from a real week rather than
 *  a hand-written state, so the derivation is exercised too. */
const modelOf = (over: Partial<Schedule> = {}) =>
  roomModel({
    schedule: {
      items: [],
      start: { mental: 70, physical: 70, social: 70, errands: 70 },
      horizonDays: HORIZON_DAYS,
      sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
      ...over,
    },
    today: 0,
    // Nothing answered, said rather than assumed (Ruling 51): these fixtures are about the
    // side-by-side layout, not about calibration.
    blockLog: [],
    predictions: [],
  })

describe('RoomComparison', () => {
  it('shows one room when there is nothing to compare', () => {
    render(<RoomComparison now={modelOf()} />)

    expect(screen.getAllByTestId('room-scene')).toHaveLength(1)
  })

  /**
   * §1.3 wants "now" beside "if you accept" in the decision flow. Nothing drives that
   * yet — the request box is §2.3, in the next plan — so this is a layout tested ahead
   * of its caller, deliberately, so the room does not need reshaping when it arrives.
   */
  it('shows two rooms when there is', () => {
    render(<RoomComparison now={modelOf()} ifAccepted={modelOf({ start: { mental: 25, physical: 25, social: 25, errands: 25 } })} />)

    expect(screen.getAllByTestId('room-scene')).toHaveLength(2)
  })

  it('labels which room is which', () => {
    render(<RoomComparison now={modelOf()} ifAccepted={modelOf({ start: { mental: 25, physical: 25, social: 25, errands: 25 } })} />)

    expect(screen.getByText(/^now$/i)).toBeVisible()
    expect(screen.getByText(/if you accept/i)).toBeVisible()
  })

  // §10 is firm: never two rooms side by side on a phone.
  it('stacks rather than pairing on a narrow screen', () => {
    render(<RoomComparison now={modelOf()} ifAccepted={modelOf({ start: { mental: 25, physical: 25, social: 25, errands: 25 } })} />)
    const layout = screen.getByTestId('room-comparison')

    expect(layout.className).toMatch(/grid-cols-1/)
    expect(layout.className).toMatch(/md:grid-cols-2/)
  })
})
