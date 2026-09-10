import { useState, type ComponentProps } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { AddSheet } from './AddSheet'
import type { AddWay } from './room/view'

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

/**
 * Since Ruling 57 the chosen way is not `AddSheet`'s own state -- it is part of the view,
 * so that `/add/photo` can be an address. `RoomShell` holds it in the real app; this
 * harness stands in for that here, which keeps every assertion below about what the sheet
 * DOES rather than about where the value happens to live.
 */
function Harness(props: Omit<ComponentProps<typeof AddSheet>, 'way' | 'onWay'>) {
  const [way, setWay] = useState<AddWay | null>(null)

  return <AddSheet {...props} way={way} onWay={setWay} />
}

const setup = () => {
  const props = {
    schedule: emptySchedule(),
    params: DEFAULT_PARAMS,
    today: 0,
    blockLog: [],
    predictions: [],
    onAcceptItems: vi.fn(),
    onAcceptRequest: vi.fn(),
    onClose: vi.fn(),
  }
  render(<Harness {...props} />)
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
  /**
   * Ruling 58. The three ways in were centred labels and nothing else, so "Someone asked me
   * for something" had to carry the whole idea -- that the request gets PRICED against the
   * week before you answer -- in six words. Each row now says what it does underneath.
   */
  it.each([
    ['add-photo', /timetable/i],
    ['add-type', /own words/i],
    ['add-request', /before you answer/i],
  ])('says what %s actually does, under its label', (testid, description) => {
    setup()

    expect(within(screen.getByTestId(testid)).getByText(description)).toBeVisible()
  })
})
