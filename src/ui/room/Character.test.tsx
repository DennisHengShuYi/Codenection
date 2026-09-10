import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Character } from './Character'
import type { CharacterState } from './characterState'
import { FLOOR_Y } from './scene/palette'

const STATES: readonly CharacterState[] = [
  'flattened',
  'runningLow',
  'holdingOn',
  'steady',
  'rested',
]

const draw = (state: CharacterState) =>
  render(
    <svg viewBox="0 0 300 200">
      <Character state={state} />
    </svg>,
  )

describe('Character', () => {
  /**
   * Once the room had a floor, the character was standing 14 units above it -- and its
   * contact shadow was being cast on the wall behind it.
   *
   * The slump used to move the whole body down, which is not how slumping works: the feet
   * stay where they are and the head comes down. Fixing the posture and fixing the floating
   * turn out to be the same change.
   */
  it.each(STATES)('stands on the floor rather than above it, when %s', (state) => {
    const { container } = draw(state)
    const shadow = container.querySelector('[data-testid="room-character"] ellipse')

    expect(Math.abs(Number(shadow?.getAttribute('cy')) - FLOOR_Y)).toBeLessThanOrEqual(2)
  })

  it.each(STATES)('keeps its feet on that line whatever the posture, when %s', (state) => {
    const { container } = draw(state)
    const body = container.querySelector('[data-testid="room-character"] rect')
    const bottom = Number(body?.getAttribute('y')) + Number(body?.getAttribute('height'))

    expect(Math.abs(bottom)).toBeLessThanOrEqual(1)
  })

  /**
   * Re-anchoring the figure to the floor moved the shoulders without moving the head, and
   * left a five-unit gap between them: at a glance, a head floating over a body.
   */
  it.each(STATES)('joins the head to the body, when %s', (state) => {
    const { container } = draw(state)
    const scope = container.querySelector('[data-testid="room-character"]')
    const head = scope?.querySelector('circle')
    const body = scope?.querySelector('rect')

    const headBottom = Number(head?.getAttribute('cy')) + Number(head?.getAttribute('r'))
    const shoulders = Number(body?.getAttribute('y'))

    expect(headBottom).toBeGreaterThanOrEqual(shoulders)
  })

  it('reflects the state it was given', () => {
    const { container } = draw('flattened')

    expect(container.querySelector('[data-testid="room-character"]')).toHaveAttribute(
      'data-state',
      'flattened',
    )
  })
})
