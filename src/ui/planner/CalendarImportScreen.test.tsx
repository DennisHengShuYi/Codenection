import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ParsedItem } from '../../ai'
import { CalendarImportScreen } from './CalendarImportScreen'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'

/**
 * A fortnight with no `startedOn`, which is the ordinary state of a seeded week.
 *
 * `DayPicker` falls back to the named days there, so these tests still drive the same
 * control they always did -- the day NAMES this file used to pass in are now derived from
 * the week rather than handed over, which is the whole point of the change.
 */
const WEEK: Schedule = {
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
}

const item = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  id: 'gcal-1',
  title: 'WIA3001 lecture',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  deadlineDay: 2,
  fixed: true,
  confident: true,
  repeat: null,
  startHour: 9,
  ...over,
})

const setup = (over: Partial<Parameters<typeof CalendarImportScreen>[0]> = {}) => {
  const props = {
    connected: true,
    onConnect: vi.fn(),
    onRead: vi.fn().mockResolvedValue({ items: [item()], skipped: 0 }),
    onAccept: vi.fn(),
    onBack: vi.fn(),
    onClose: vi.fn(),
    schedule: WEEK,
    today: 0,
    ...over,
  }

  render(<CalendarImportScreen {...props} />)

  return props
}

/**
 * §1.4: "Never import silently. Confirm screen, low-confidence rows flagged, one-tap
 * correction." That rule was written for a photographed timetable and applies with more
 * force here -- a calendar can bring in fifty rows at once, and nobody reads fifty rows
 * carefully.
 */
describe('CalendarImportScreen', () => {
  it('offers to connect when the student has not yet', () => {
    setup({ connected: false })

    expect(screen.getByTestId('calendar-connect')).toBeVisible()
  })

  /**
   * Said before the button, while declining is still free. Somebody about to hand over
   * access to their calendar should know what is being asked and what will be done with it.
   */
  it('says what it will do before asking for access', () => {
    setup({ connected: false })

    expect(screen.getByText(/nothing is added until you say so/i)).toBeVisible()
    expect(screen.getByText(/never change anything in your existing calendars/i)).toBeVisible()
  })

  it('does not read anything until the student asks it to', () => {
    const props = setup()

    expect(props.onRead).not.toHaveBeenCalled()
    expect(screen.getByTestId('calendar-read')).toBeVisible()
  })

  it('shows what it found as correctable rows', async () => {
    setup()

    await userEvent.click(screen.getByTestId('calendar-read'))

    await waitFor(() => expect(screen.getByTestId('chip-gcal-1')).toBeVisible())
    expect(screen.getByDisplayValue('WIA3001 lecture')).toBeVisible()
  })

  /** The whole point of a confirm screen: nothing enters until the button is pressed. */
  it('adds nothing to the week until the student accepts', async () => {
    const props = setup()

    await userEvent.click(screen.getByTestId('calendar-read'))
    await waitFor(() => expect(screen.getByTestId('chip-gcal-1')).toBeVisible())

    expect(props.onAccept).not.toHaveBeenCalled()

    await userEvent.click(screen.getByTestId('calendar-accept'))
    expect(props.onAccept).toHaveBeenCalledWith([expect.objectContaining({ title: 'WIA3001 lecture' })])
  })

  it('lets a row be removed before anything is added', async () => {
    const props = setup()

    await userEvent.click(screen.getByTestId('calendar-read'))
    await waitFor(() => expect(screen.getByTestId('chip-gcal-1')).toBeVisible())

    await userEvent.click(screen.getByRole('button', { name: /remove/i }))

    expect(screen.queryByTestId('calendar-accept')).toBeNull()
    expect(props.onAccept).not.toHaveBeenCalled()
  })

  /** §1.4's flag, which `ItemChip` already renders -- an all-day event's duration is a
   *  guess, and the student should see that it is. */
  it('flags a row it had to guess at', async () => {
    setup({ onRead: vi.fn().mockResolvedValue({ items: [item({ confident: false })], skipped: 0 }) })

    await userEvent.click(screen.getByTestId('calendar-read'))

    await waitFor(() => expect(screen.getByTestId('unsure-gcal-1')).toBeVisible())
  })

  /**
   * Events outside the fortnight are left out, and saying so matters: a student who sees
   * three rows from a calendar holding thirty needs to know the other twenty-seven were out
   * of range rather than misread.
   */
  it('says how many it left out for being outside the fortnight', async () => {
    setup({ onRead: vi.fn().mockResolvedValue({ items: [item()], skipped: 4 }) })

    await userEvent.click(screen.getByTestId('calendar-read'))

    await waitFor(() => expect(screen.getByTestId('calendar-skipped')).toHaveTextContent(/4 events/))
  })

  it('reads correctly for a single left-out event', async () => {
    setup({ onRead: vi.fn().mockResolvedValue({ items: [item()], skipped: 1 }) })

    await userEvent.click(screen.getByTestId('calendar-read'))

    await waitFor(() => expect(screen.getByTestId('calendar-skipped')).toHaveTextContent(/One event/))
  })

  /**
   * §1.4 again, and the reason the spec was cautious about calendar-primary: most students
   * do not keep their timetable in one, so an empty result is the expected case rather than
   * a failure -- and it must point at the paths that do work.
   */
  it('points at the other ways in when the calendar has nothing to give', async () => {
    setup({ onRead: vi.fn().mockResolvedValue({ items: [], skipped: 0 }) })

    await userEvent.click(screen.getByTestId('calendar-read'))

    await waitFor(() => expect(screen.getByTestId('calendar-empty')).toBeVisible())
    expect(screen.getByTestId('calendar-empty')).toHaveTextContent(/photograph|type it out/i)
  })

  it('says so plainly when it could not read the calendar at all', async () => {
    setup({ onRead: vi.fn().mockRejectedValue(new Error('offline')) })

    await userEvent.click(screen.getByTestId('calendar-read'))

    await waitFor(() => expect(screen.getByTestId('calendar-problem')).toBeVisible())
  })

  /** A failure describes what to do, not what went wrong inside. */
  it('does not describe the inside of the system when it fails', async () => {
    setup({ onRead: vi.fn().mockRejectedValue(new Error('offline')) })

    await userEvent.click(screen.getByTestId('calendar-read'))

    await waitFor(() =>
      expect(screen.getByTestId('calendar-problem')).not.toHaveTextContent(/token|oauth|500|error/i),
    )
  })

  /**
   * Ruling 60 split the one `Cancel` into two: Back goes up to the chooser, close is done
   * with the whole thing. Both are the container's own controls now, so both are asserted
   * here -- the screen's job is only to hand them somewhere to go.
   */
  it('can be stepped back to the chooser without accepting anything', async () => {
    const props = setup()

    await userEvent.click(screen.getByTestId('sheet-back'))

    expect(props.onBack).toHaveBeenCalledOnce()
    expect(props.onClose).not.toHaveBeenCalled()
    expect(props.onAccept).not.toHaveBeenCalled()
  })

  it('can be closed outright without accepting anything', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /close/i }))

    expect(props.onClose).toHaveBeenCalledOnce()
    expect(props.onBack).not.toHaveBeenCalled()
    expect(props.onAccept).not.toHaveBeenCalled()
  })
})

/**
 * Ruling 63: pressing Connect has to do something visible, including when it fails.
 *
 * `AddSheet` called `void beginConnect()`, so a refusal became
 * `Uncaught (in promise) Error: could not begin` in a console no student opens, and a
 * missing session became nothing happening at all. The screen already has a line for saying
 * what went wrong -- it simply was never given anything to say.
 */
describe('when connecting cannot start', () => {
  it('says why, where the student is looking', async () => {
    setup({
      connected: false,
      onConnect: vi.fn().mockResolvedValue('Sign in from Settings first.'),
    })

    await userEvent.click(screen.getByTestId('calendar-connect'))

    expect(await screen.findByTestId('calendar-problem')).toHaveTextContent(/sign in/i)
  })

  it('says nothing when the flow is starting normally', async () => {
    setup({ connected: false, onConnect: vi.fn().mockResolvedValue(null) })

    await userEvent.click(screen.getByTestId('calendar-connect'))

    expect(screen.queryByTestId('calendar-problem')).toBeNull()
  })

  /** A second attempt that works has to clear the first one's message, or the student is
   *  left reading a complaint about something that has since succeeded. */
  it('clears an old message when a later attempt gets going', async () => {
    const onConnect = vi
      .fn()
      .mockResolvedValueOnce('Something went wrong.')
      .mockResolvedValueOnce(null)
    setup({ connected: false, onConnect })

    await userEvent.click(screen.getByTestId('calendar-connect'))
    expect(await screen.findByTestId('calendar-problem')).toBeVisible()

    await userEvent.click(screen.getByTestId('calendar-connect'))

    await waitFor(() => expect(screen.queryByTestId('calendar-problem')).toBeNull())
  })
})

/**
 * A refusal the student can act on, where there is one.
 *
 * This screen turned every failed read into "I could not read your calendar just now. Try
 * again in a moment." That is right for Google being briefly unwell and wrong for the two
 * failures where trying again is not what fixes it -- a grant missing a scope, and a
 * deployment whose Calendar API was never switched on. Both reach here as the message on the
 * thrown error now, and telling somebody to wait when waiting cannot help is the specific
 * thing §8.2 calls worse than saying nothing.
 */
describe('when the calendar cannot be read', () => {
  const failing = (error: Error) => setup({ onRead: vi.fn().mockRejectedValue(error) })

  it('shows the reason it was given', async () => {
    failing(new Error('Disconnect it in Settings and connect it again.'))

    await userEvent.click(screen.getByTestId('calendar-read'))

    expect(await screen.findByTestId('calendar-problem')).toHaveTextContent(
      'Disconnect it in Settings and connect it again.',
    )
  })

  /** The internal wording is not a sentence to show anybody. Where that is all there is, the
   *  screen's own "try again in a moment" is both true and the most it can honestly say. */
  it('falls back to try again when the failure has no words for a student', async () => {
    failing(new Error('could not read calendar'))

    await userEvent.click(screen.getByTestId('calendar-read'))

    expect(await screen.findByTestId('calendar-problem')).toHaveTextContent(
      'I could not read your calendar just now. Try again in a moment.',
    )
  })

  it('says the same for a network that simply died', async () => {
    failing(new TypeError('Failed to fetch'))

    await userEvent.click(screen.getByTestId('calendar-read'))

    expect(await screen.findByTestId('calendar-problem')).toHaveTextContent(
      'I could not read your calendar just now. Try again in a moment.',
    )
  })
})
