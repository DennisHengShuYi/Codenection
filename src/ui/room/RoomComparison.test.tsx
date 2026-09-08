import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RoomComparison } from './RoomComparison'
import type { RoomState } from './roomState'

const state = (character: RoomState['character']): RoomState => ({
  ceilingPressure: 0.2,
  paperHeight: 0.2,
  clutter: [],
  plantHealth: 0.8,
  sleepDebt: 0,
  weather: 'clear',
  lightLevel: 0.8,
  doorLit: false,
  character,
})

describe('RoomComparison', () => {
  it('shows one room when there is nothing to compare', () => {
    render(<RoomComparison now={state('steady')} />)

    expect(screen.getAllByTestId('room-scene')).toHaveLength(1)
  })

  /**
   * §1.3 wants "now" beside "if you accept" in the decision flow. Nothing drives that
   * yet — the request box is §2.3, in the next plan — so this is a layout tested ahead
   * of its caller, deliberately, so the room does not need reshaping when it arrives.
   */
  it('shows two rooms when there is', () => {
    render(<RoomComparison now={state('steady')} ifAccepted={state('runningLow')} />)

    expect(screen.getAllByTestId('room-scene')).toHaveLength(2)
  })

  it('labels which room is which', () => {
    render(<RoomComparison now={state('steady')} ifAccepted={state('runningLow')} />)

    expect(screen.getByText(/^now$/i)).toBeVisible()
    expect(screen.getByText(/if you accept/i)).toBeVisible()
  })

  // §10 is firm: never two rooms side by side on a phone.
  it('stacks rather than pairing on a narrow screen', () => {
    render(<RoomComparison now={state('steady')} ifAccepted={state('runningLow')} />)
    const layout = screen.getByTestId('room-comparison')

    expect(layout.className).toMatch(/grid-cols-1/)
    expect(layout.className).toMatch(/md:grid-cols-2/)
  })
})
