import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Character } from './Character'
import type { CharacterState } from './characterState'
import { CHARACTER_BOTTOM, FLOOR_Y } from './scene/palette'

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

/**
 * How far down the scene the drawing actually reaches, measured rather than assumed.
 *
 * Every shape in the character group is reduced to its own lowest edge, shifted by the
 * translate of each ancestor up to the group itself, and widened by half its stroke -- a
 * 3.5-unit stroke hangs 1.75 units past the path it follows, which is exactly the margin
 * `CHARACTER_BOTTOM` was rounded up to cover.
 *
 * Generic on purpose. A test that read the arm path alone would go on passing if somebody
 * added a foot, a bag or a longer shadow.
 */
const translateYOf = (element: Element): number => {
  const match = /translate\(\s*-?[\d.]+[\s,]+(-?[\d.]+)\s*\)/.exec(
    element.getAttribute('transform') ?? '',
  )
  return match ? Number(match[1]) : 0
}

const lowestPointOf = (state: CharacterState): number => {
  const { container } = draw(state)
  const scope = container.querySelector('[data-testid="room-character"]')
  if (scope === null) throw new Error('no character was drawn')

  let lowest = Number.NEGATIVE_INFINITY

  for (const element of Array.from(scope.querySelectorAll('*'))) {
    const number = (name: string) => Number(element.getAttribute(name) ?? 0)

    let own: number
    switch (element.tagName.toLowerCase()) {
      case 'rect':
        own = number('y') + number('height')
        break
      case 'circle':
        own = number('cy') + number('r')
        break
      case 'ellipse':
        own = number('cy') + number('ry')
        break
      case 'path': {
        // Only M, L and Q appear here and all three take plain (x, y) pairs, so every
        // second number is a y. A command with a different arity would need its own case.
        const numbers = (element.getAttribute('d') ?? '').match(/-?[\d.]+/g) ?? []
        own = Math.max(...numbers.filter((_, index) => index % 2 === 1).map(Number))
        break
      }
      default:
        continue
    }

    own += number('stroke-width') / 2

    // Every translate between this shape and the character group -- the body sits inside a
    // `translate(150 FLOOR_Y)`, the mouth inside a second one of its own.
    for (let node: Element | null = element; node !== null && node !== scope; node = node.parentElement) {
      own += translateYOf(node)
    }

    lowest = Math.max(lowest, own)
  }

  return lowest
}

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

  /**
   * Ruling 57's companion nit, and the reason it is worth a test rather than a comment: the
   * band on the room screen is capped at the space below this line, and the cap is written
   * as a Tailwind arbitrary value that cannot read a constant. So the binding has to run the
   * other way -- the artwork is measured against the number the cap was derived from.
   *
   * `room.spec.ts` already catches drift at four viewports, but it surfaces there as an
   * unexplained geometric failure in a browser run. This fails at the file that has to
   * change.
   */
  it.each(STATES)('reaches no lower than the band was told to expect, when %s', (state) => {
    expect(lowestPointOf(state)).toBeLessThanOrEqual(CHARACTER_BOTTOM)
  })

  /**
   * The other side of it. Without this, `CHARACTER_BOTTOM = 250` would satisfy the test
   * above while throwing away most of the band -- a constant that cannot be wrong is not a
   * measurement.
   */
  it('is the posture that reaches lowest that the constant was cut to', () => {
    const deepest = Math.max(...STATES.map(lowestPointOf))

    expect(deepest).toBeLessThanOrEqual(CHARACTER_BOTTOM)
    expect(deepest).toBeGreaterThan(CHARACTER_BOTTOM - 2)
    // And that it is measured from the floor the character stands on, not from the top of
    // some other coordinate system.
    expect(deepest).toBeGreaterThan(FLOOR_Y)
  })

  it('reflects the state it was given', () => {
    const { container } = draw('flattened')

    expect(container.querySelector('[data-testid="room-character"]')).toHaveAttribute(
      'data-state',
      'flattened',
    )
  })
})
