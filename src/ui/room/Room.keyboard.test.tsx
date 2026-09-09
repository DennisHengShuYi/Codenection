import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'
import { roomModel } from './roomModel'
import { Room } from './Room'

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const modelOf = (schedule = week()) =>
  roomModel({ schedule, profile: { ...DEFAULTS }, today: 0 })

import { DEFAULT_PROFILE as DEFAULTS } from '../../domain/calibration'

const setup = (schedule = week()) => {
  const onSelect = vi.fn()
  render(<Room model={modelOf(schedule)} onSelect={onSelect} />)
  return { onSelect }
}

/**
 * The room stops being a picture and becomes the interface, so every object has to be
 * operable without a mouse. This is the test that decides how the SVG is built rather than
 * the other way round -- `<foreignObject>` misbehaves in Safari and an SVG `<a>` is not a
 * button, so whichever approach passes here is the one that ships.
 */
describe('Room, by keyboard', () => {
  /**
   * The drawing stays hidden from assistive technology and the *buttons over it* carry the
   * meaning. My first version of this test asserted the SVG was no longer aria-hidden, which
   * tested the mechanism rather than the outcome -- with controls laid over the artwork,
   * announcing the artwork as well would be noise.
   */
  it('keeps the drawing decorative and puts the meaning on the controls', () => {
    setup()

    expect(screen.getByTestId('room-scene')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('exposes every object as a button', () => {
    setup()

    // Twelve objects minus the clutter placeholder, on a week with nothing to clear.
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(11)
  })

  it('gives every object an accessible name a person would recognise', () => {
    setup()

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAccessibleName(/\w{3,}/)
    }
  })

  it('reaches the first object with one tab', async () => {
    setup()

    await userEvent.tab()

    expect(screen.getAllByRole('button')[0]).toHaveFocus()
  })

  it('activates an object with the keyboard', async () => {
    const { onSelect } = setup()

    await userEvent.tab()
    await userEvent.keyboard('{Enter}')

    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('activates with space as well as enter, as a button should', async () => {
    const { onSelect } = setup()

    await userEvent.tab()
    await userEvent.keyboard(' ')

    expect(onSelect).toHaveBeenCalledOnce()
  })

  /**
   * §1.5's stance, applied to the furniture: colour alone cannot carry meaning. An object
   * asking for attention must say so in its accessible name too, or it is invisible to
   * anybody who cannot see the glow.
   */
  it('says in words when an object is asking for attention', () => {
    setup(week({ start: { mental: 70, physical: 20, social: 20, errands: 70 } }))

    expect(screen.getByRole('button', { name: /get outside/i })).toHaveAccessibleName(
      /needs you|asking|lit/i,
    )
  })

  it('does not claim attention on an object that is quiet', () => {
    setup()

    expect(screen.getByRole('button', { name: /get outside/i })).not.toHaveAccessibleName(
      /needs you/i,
    )
  })
})
