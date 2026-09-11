import { useState, type ComponentProps } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { AddSheet } from './AddSheet'
import type { AddWay } from './room/view'
import * as google from '../google/client'

/**
 * Stubbed, because the real ones call this app's own endpoints and there are none in a unit
 * test. What this file asks is what the sheet *does* with the answer; whether the client can
 * reach the network is `google/client.test.ts`'s question.
 */
vi.mock('../google/client', () => ({
  beginConnect: vi.fn().mockResolvedValue(undefined),
  readCalendar: vi.fn().mockResolvedValue({
    items: [
      {
        id: 'gcal-1',
        title: 'WIA3001 lecture',
        type: 'mental',
        kind: 'studyBlock',
        hours: 2,
        deadlineDay: 2,
        fixed: true,
        confident: true,
        repeat: null,
      },
    ],
    skipped: 0,
  }),
}))

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
function Harness(props: Omit<ComponentProps<typeof AddSheet>, 'way' | 'onWay' | 'onBack'>) {
  const [way, setWay] = useState<AddWay | null>(null)

  // Ruling 60: Back is one level up, which from a sub-flow is the chooser. `RoomShell`
  // walks the real history for this; here the harness stands in for it, the same way it
  // stands in for `way`.
  return <AddSheet {...props} way={way} onWay={setWay} onBack={() => setWay(null)} />
}

const setup = (over: { calendarConnected?: boolean } = {}) => {
  const props = {
    schedule: emptySchedule(),
    params: DEFAULT_PARAMS,
    today: 0,
    blockLog: [],
    predictions: [],
    onAcceptItems: vi.fn(),
    onAcceptRequest: vi.fn(),
    onClose: vi.fn(),
    ...over,
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

    await userEvent.click(screen.getByTestId('sheet-back'))
    await userEvent.click(screen.getByTestId('add-type'))
    expect(screen.getByLabelText(/on your mind/i)).toBeVisible()
    expect(screen.queryByTestId('photo-input')).toBeNull()

    await userEvent.click(screen.getByTestId('sheet-back'))
    await userEvent.click(screen.getByTestId('add-request'))
    expect(screen.getByLabelText(/what.*asked/i)).toBeVisible()
    expect(screen.queryByLabelText(/on your mind/i)).toBeNull()
  })

  /**
   * Ruling 60. `Cancel` used to do both of these and you could not tell which from the
   * button: inside a path it meant the chooser, at the chooser it meant close. Back means
   * one level up and close means done, at every depth.
   */
  it('returns to the choice when a path is stepped back from, rather than closing outright', async () => {
    const props = setup()

    await userEvent.click(screen.getByTestId('add-type'))
    await userEvent.click(screen.getByTestId('sheet-back'))

    expect(screen.getByTestId('add-type')).toBeVisible()
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('closes outright from a path, rather than dropping back to the choice', async () => {
    const props = setup()

    await userEvent.click(screen.getByTestId('add-type'))
    await userEvent.click(screen.getByRole('button', { name: /close/i }))

    expect(props.onClose).toHaveBeenCalledOnce()
  })

  /** The chooser opens straight from the room, so it has nothing above it to go back to. */
  it('offers no Back on the choice screen itself, and no Cancel anywhere', async () => {
    setup()

    expect(screen.queryByTestId('sheet-back')).toBeNull()
    expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull()

    await userEvent.click(screen.getByTestId('add-type'))
    expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull()
  })

  it('closes from the choice screen itself', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /close/i }))

    expect(props.onClose).toHaveBeenCalledOnce()
  })

  it('reaches onAcceptItems when the typed path is accepted', async () => {
    const props = setup()

    await userEvent.click(screen.getByTestId('add-type'))
    await userEvent.type(screen.getByLabelText(/on your mind/i), 'gym')
    await userEvent.click(screen.getByRole('button', { name: /read this/i }))
    await screen.findByTestId(/^chip-/)

    // §43: the week will not take an item that does not say when it happens, so the day is
    // answered on the chip first -- the same press a student makes.
    for (const select of screen.getAllByTestId(/^when-day-/)) {
      await userEvent.selectOptions(select, '2')
    }
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
    ['add-calendar', /nothing is added until you say so/i],
  ])('says what %s actually does, under its label', (testid, description) => {
    setup()

    expect(within(screen.getByTestId(testid)).getByText(description)).toBeVisible()
  })
})

/**
 * §1.4's optional calendar supplement, as a fourth way in.
 *
 * The spec asked for a decision -- "OCR primary, calendar as an additive import for those
 * who use it, never as the only path" -- and its position in this list is that decision.
 * Last, beside the others, never in front of them.
 */
describe('AddSheet and the calendar', () => {
  it('offers the calendar after the three ways that need nothing connected', () => {
    setup()

    const rows = screen.getAllByRole('button').map((button) => button.getAttribute('data-testid'))
    const ways = rows.filter((id): id is string => id !== null && id.startsWith('add-'))

    expect(ways).toEqual(['add-photo', 'add-type', 'add-request', 'add-calendar'])
  })

  it('opens the calendar screen when it is chosen', async () => {
    setup()

    await userEvent.click(screen.getByTestId('add-calendar'))

    expect(screen.getByRole('dialog', { name: /from my calendar/i })).toBeVisible()
  })

  /** Nothing has been granted yet, so the first thing it offers is the choice to grant it --
   *  with what it will do said before the button. */
  it('asks to connect before it can read anything', async () => {
    setup({ calendarConnected: false })

    await userEvent.click(screen.getByTestId('add-calendar'))

    expect(screen.getByTestId('calendar-connect')).toBeVisible()
    expect(screen.queryByTestId('calendar-read')).toBeNull()
  })

  it('offers to read once a calendar is connected', async () => {
    setup({ calendarConnected: true })

    await userEvent.click(screen.getByTestId('add-calendar'))

    expect(screen.getByTestId('calendar-read')).toBeVisible()
    expect(screen.queryByTestId('calendar-connect')).toBeNull()
  })

  it('begins the connection when asked to', async () => {
    setup({ calendarConnected: false })

    await userEvent.click(screen.getByTestId('add-calendar'))
    await userEvent.click(screen.getByTestId('calendar-connect'))

    expect(google.beginConnect).toHaveBeenCalledOnce()
  })

  /**
   * The whole path, end to end: read the calendar, see the row, accept it. What this proves
   * beyond the screen's own tests is the wiring -- that the week the sheet holds is the one
   * the calendar is read against, and that accepting reaches the caller.
   */
  it('reads the calendar and hands what was accepted to the week', async () => {
    const props = setup({ calendarConnected: true })

    await userEvent.click(screen.getByTestId('add-calendar'))
    await userEvent.click(screen.getByTestId('calendar-read'))

    await waitFor(() => expect(screen.getByTestId('calendar-accept')).toBeVisible())
    await userEvent.click(screen.getByTestId('calendar-accept'))

    expect(google.readCalendar).toHaveBeenCalledWith(props.schedule)
    expect(props.onAcceptItems).toHaveBeenCalledWith([
      expect.objectContaining({ title: 'WIA3001 lecture' }),
    ])
    expect(props.onClose).toHaveBeenCalled()
  })
})
