import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../../data'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'
import { RoomShell } from './RoomShell'

/**
 * Ruling 61: the room is the drawing again.
 *
 * The band under it had grown to five things stacked one on another -- the preview notice,
 * the room said in words, the accuracy line, the three-week-outlook disclaimer and however
 * many live cards were firing -- over a character whose whole job is to say how the student
 * is doing. Four of those five are things to READ, and reading them is not why anyone opens
 * this app; the fifth is a card that wants a decision. All of it now waits behind one
 * button, which says how much is there.
 *
 * The exception is §1.5. A student below the threshold gets the collapsed interface -- one
 * number and one action -- and a card behind a button is not an action they have been
 * handed. At low energy the card stays where it was and there is no button at all.
 */
const weekWithErrand = (): Schedule => ({
  items: [
    {
      id: 'laundry',
      title: 'Laundry',
      type: 'errands',
      kind: 'errands',
      hours: 1,
      intensity: 1,
      dayIndex: 2,
      startHour: 17,
      fixed: false,
      deadlineDay: null,
      protectedRest: false,
    },
  ],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

let counter = 0

const renderShell = async (over?: Partial<Schedule>, onAnswerBlock = vi.fn()) => {
  counter += 1
  const repository = createLocalRepository(`notices-${counter}`)
  await repository.clear()
  await repository.saveWeek({ ...weekWithErrand(), ...over })

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={onAnswerBlock} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
}

beforeEach(() => window.history.replaceState(null, '', '/'))

describe('the room, with its band behind a button', () => {
  it('shows the drawing and its controls, and nothing stacked underneath', async () => {
    await renderShell()

    expect(screen.queryByTestId('room-band')).toBeNull()
    expect(screen.queryByTestId('room-text-equivalent')).toBeNull()
    expect(screen.queryByTestId('accuracy-note')).toBeNull()

    // What remains is the room itself and the ways out of it.
    expect(screen.getByTestId('room-scene')).toBeVisible()
    expect(screen.getByTestId('room-gauge')).toBeVisible()
    expect(screen.getByTestId('open-add')).toBeVisible()
  })

  it('opens what is waiting from the control row, at its own address', async () => {
    await renderShell()

    await userEvent.click(screen.getByTestId('open-notices'))

    const sheet = await screen.findByRole('dialog', { name: /waiting/i })
    expect(window.location.pathname).toBe('/notices')
    expect(within(sheet).getByTestId('room-text-equivalent')).toBeVisible()
    expect(within(sheet).getByTestId('accuracy-note')).toBeVisible()
  })

  it('carries the live cards, which is the part that wanted a decision', async () => {
    await renderShell()

    await userEvent.click(screen.getByTestId('open-notices'))

    const sheet = await screen.findByRole('dialog', { name: /waiting/i })
    expect(within(sheet).getByRole('region', { name: /today's check-in/i })).toBeVisible()
  })

  /**
   * A button that only ever says "waiting" gives the student no reason to press it or to
   * leave it alone. The count is what makes ignoring it safe.
   *
   * The live cards and nothing else. The paragraph and the accuracy line are always
   * present, and a badge that reads the same on a quiet week as on a bad one teaches the
   * student to ignore it; the preview notice is not counted either, because it is not
   * behind the button at all -- see below.
   */
  it('says how many things are waiting, rather than only that something is', async () => {
    await renderShell()

    expect(screen.getByTestId('notices-count')).toHaveTextContent('1')
    expect(screen.getByTestId('open-notices')).toHaveAccessibleName(/1 waiting/i)
  })

  /**
   * The one thing that does NOT go behind the button.
   *
   * "This week is not being saved" is a warning about losing work, and a warning about
   * losing work that a student has to press something to find is a warning that arrives
   * after the loss. It sits on the room itself, after the last control, where it is read
   * without being asked for.
   */
  it('keeps the preview warning on the room, after the controls, rather than behind them', async () => {
    await renderShell()

    const banner = screen.getByTestId('preview-banner')
    expect(banner).toBeVisible()
    expect(screen.getByTestId('room-stage')).toContainElement(banner)

    const add = screen.getByTestId('open-add')
    expect(
      Boolean(add.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true)
  })

  it('does not repeat the preview warning inside the sheet', async () => {
    await renderShell()

    await userEvent.click(screen.getByTestId('open-notices'))
    const sheet = await screen.findByRole('dialog', { name: /waiting/i })

    expect(within(sheet).queryByTestId('preview-banner')).toBeNull()
  })

  it('opens straight from a pasted address', async () => {
    window.history.replaceState(null, '', '/notices')
    await renderShell()

    expect(await screen.findByRole('dialog', { name: /waiting/i })).toBeVisible()
  })
})

/**
 * Everything still owed an answer, listed rather than met one at a time.
 *
 * The check-in card asks about one block a day -- §8's "one card, three taps, once a day" --
 * which is right for the card and leaves a student who went quiet for a week with no way to
 * see, or clear, what built up behind it. The list lives behind `Waiting` because that is
 * where things needing the student already are, and it counts as one notice rather than one
 * per block: a badge that reaches double figures is a badge people learn to ignore.
 *
 * Not shown at low energy. §1.5 is explicit that a student at 12% reserve should not be
 * handed a dashboard, and a backlog is the most dashboard-like thing in the app.
 */
const daysAgo = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0] as string

const lived = (): Partial<Schedule> => ({
  items: [
    {
      id: 'lab',
      title: 'WIA3001 lab',
      type: 'mental',
      kind: 'studyBlock',
      hours: 2,
      intensity: 1,
      dayIndex: 0,
      startHour: 9,
      fixed: false,
      deadlineDay: null,
      protectedRest: false,
    },
    {
      id: 'gym',
      title: 'Gym',
      type: 'physical',
      kind: 'hardExercise',
      hours: 1,
      intensity: 1,
      dayIndex: 1,
      startHour: 18,
      fixed: false,
      deadlineDay: null,
      protectedRest: false,
    },
  ],
  startedOn: daysAgo(3),
})

describe('what is still owed an answer', () => {
  /**
   * Everything owed appears exactly once. The check-in card is already asking about one of
   * these, so the list carries the rest -- a block in both places reads as a bug, and a
   * block in neither is owed and invisible.
   */
  it('lists everything owed, now that no card asks about one of them', async () => {
    await renderShell(lived())

    await userEvent.click(screen.getByTestId('open-notices'))
    const sheet = await screen.findByRole('dialog', { name: /waiting/i })

    expect(within(sheet).getByTestId('pending-gym')).toHaveTextContent('Gym')
    expect(within(sheet).getByTestId('pending-lab')).toHaveTextContent('WIA3001 lab')
  })

  it('says when each one was, so a student knows which day they are answering for', async () => {
    await renderShell(lived())

    await userEvent.click(screen.getByTestId('open-notices'))
    const sheet = await screen.findByRole('dialog', { name: /waiting/i })

    expect(within(sheet).getByTestId('pending-gym')).toHaveTextContent('18:00')
  })

  it('opens the block itself, where the answers are', async () => {
    await renderShell(lived())

    await userEvent.click(screen.getByTestId('open-notices'))
    await userEvent.click(await screen.findByTestId('pending-gym'))

    const gymRow = (await screen.findByTestId('pending-gym')).closest('li')
    expect(within(gymRow as HTMLElement).getByTestId('answer-right')).toBeVisible()
  })

  it('says nothing at all when nothing is owed', async () => {
    await renderShell()

    await userEvent.click(screen.getByTestId('open-notices'))
    const sheet = await screen.findByRole('dialog', { name: /waiting/i })

    expect(within(sheet).queryByTestId('pending-checkins')).toBeNull()
  })
})

/**
 * One surface for what is owed, not two.
 *
 * The list arrived beside the check-in card rather than instead of it, so the sheet showed
 * six things to answer and then a card asking about a seventh in a different shape -- two
 * surfaces doing one job, with nothing on screen to say why that one was singled out.
 * Excluding the card's block from the list hid the seam without removing it.
 *
 * The list answers in place now, and the card's block question is gone. §1.5 still holds at
 * the other end: below the threshold a list is a dashboard, so the same component is capped
 * to the single row the card used to be -- one question, which is what that mode is for.
 */
describe('answering from the list', () => {
  it('offers the answers on the row itself', async () => {
    await renderShell(lived())

    await userEvent.click(screen.getByTestId('open-notices'))
    const list = await screen.findByTestId('pending-checkins')

    expect(within(list).getByTestId('answer-right')).toBeVisible()
  })

  it('records what was answered, for the block on that row', async () => {
    const onAnswerBlock = vi.fn()
    await renderShell(lived(), onAnswerBlock)

    await userEvent.click(screen.getByTestId('open-notices'))
    const list = await screen.findByTestId('pending-checkins')
    await userEvent.click(within(list).getByTestId('answer-longer'))

    expect(onAnswerBlock).toHaveBeenCalledWith(
      expect.objectContaining({ blockId: 'lab', answer: 'longer' }),
    )
  })

  it('opens another row when it is tapped', async () => {
    await renderShell(lived())

    await userEvent.click(screen.getByTestId('open-notices'))
    await userEvent.click(await screen.findByTestId('pending-gym'))

    const gymRow = (await screen.findByTestId('pending-gym')).closest('li')
    expect(within(gymRow as HTMLElement).getByTestId('answer-right')).toBeVisible()
  })

  /** The duplication this replaces: no separate card asking the same question beside it. */
  it('asks nowhere else on the sheet', async () => {
    await renderShell(lived())

    await userEvent.click(screen.getByTestId('open-notices'))
    const list = await screen.findByTestId('pending-checkins')

    // Asked once, and inside the list -- the card that used to ask the same thing beside it
    // is gone rather than merely excluded from the rows.
    const asked = screen.getAllByText(/how much of it happened/i)
    expect(asked).toHaveLength(1)
    expect(list).toContainElement(asked[0] as HTMLElement)
  })
})
