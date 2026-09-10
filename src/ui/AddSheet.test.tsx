import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { AddSheet } from './AddSheet'

/**
 * §6's `+` sheet, the single control behind "photograph something · type it out · someone
 * asked me for something". The three screens it opens are exercised in their own test
 * files; what belongs here is that the choice actually discriminates -- the button a
 * student taps is the path that opens, not whichever one happens to run first.
 *
 * The endpoint is stubbed unreachable throughout: every screen this opens falls back to
 * its rule-based path, and nothing here needs a live model.
 */
beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no endpoint'))))
afterEach(() => vi.unstubAllGlobals())

const emptySchedule = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const setup = () => {
  const props = {
    schedule: emptySchedule(),
    onAcceptItems: vi.fn(),
    onAcceptRequest: vi.fn(),
    onClose: vi.fn(),
  }
  render(<AddSheet {...props} />)
  return props
}

describe('AddSheet', () => {
  it('opens on the choice, titled for what it asks', () => {
    setup()

    expect(screen.getByRole('dialog', { name: /what.s coming at you/i })).toBeVisible()
  })

  it('offers three large secondary ways in', () => {
    setup()

    for (const testid of ['add-photo', 'add-type', 'add-request']) {
      const button = screen.getByTestId(testid)
      expect(button).toHaveAttribute('data-variant', 'secondary')
      expect(button).toHaveAttribute('data-size', 'lg')
    }
  })

  // The discriminator: each button must open its own path, not whichever the handler was
  // last wired to. Wiring all three to one fixed value passes the first assertion below
  // and fails the second two.
  it('reports which of the three paths was chosen, rather than one fixed answer', async () => {
    setup()

    await userEvent.click(screen.getByTestId('add-photo'))
    expect(screen.getByTestId('photo-input')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await userEvent.click(screen.getByTestId('add-type'))
    expect(screen.getByLabelText(/on your mind/i)).toBeVisible()
    expect(screen.queryByTestId('photo-input')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await userEvent.click(screen.getByTestId('add-request'))
    expect(screen.getByLabelText(/what.*asked/i)).toBeVisible()
    expect(screen.queryByLabelText(/on your mind/i)).toBeNull()
  })

  it('returns to the choice when a path is cancelled, rather than closing outright', async () => {
    const props = setup()

    await userEvent.click(screen.getByTestId('add-type'))
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.getByTestId('add-type')).toBeVisible()
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('closes on Cancel from the choice screen itself', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(props.onClose).toHaveBeenCalledOnce()
  })

  it('reaches onAcceptItems when the typed path is accepted', async () => {
    const props = setup()

    await userEvent.click(screen.getByTestId('add-type'))
    await userEvent.type(screen.getByLabelText(/on your mind/i), 'gym')
    await userEvent.click(screen.getByRole('button', { name: /read this/i }))
    await screen.findByTestId(/^chip-/)
    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    expect(props.onAcceptItems).toHaveBeenCalledOnce()
    expect(props.onClose).toHaveBeenCalledOnce()
  })
})
