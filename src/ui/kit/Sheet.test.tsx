import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../../data'
import { HORIZON_DAYS, DEFAULT_PARAMS } from '../../engine'
import type { Schedule } from '../../optimizer'
import { AddSheet } from '../AddSheet'
import { PhotoImportScreen } from '../planner/PhotoImportScreen'
import { PlannerScreen } from '../planner/PlannerScreen'
import { RequestBoxScreen } from '../request/RequestBoxScreen'
import { RoomShell } from '../room/RoomShell'
import type { BlockSheetModel } from '../week/blockActions'
import { BlockSheet } from '../week/BlockSheet'
import { Button } from './Button'
import { Sheet } from './Sheet'

// Only the settings-sheet coverage below needs this: `LinkTelegram` calls out to Supabase on
// mount, and a real network round trip has no place in this suite. `vi.mock` is hoisted, so
// it applies module-wide rather than only within that one test -- harmless, since nothing
// else here touches `../../data`.
vi.mock('../../data', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasTelegramLink: () => Promise.resolve(false),
}))

// Same reason, for the calendar row beside it: `CalendarConnection` asks the database on
// mount whether a grant exists. Answering "yes" here is what makes the withdrawal control
// render at all, which is the thing the settings-sheet test below is checking is wired in.
vi.mock('../../google/connection', () => ({
  hasCalendarConnected: () => Promise.resolve(true),
}))

const setup = (actions?: React.ReactNode) => {
  const onClose = vi.fn()
  render(
    <Sheet title="FYP meeting" onClose={onClose} actions={actions}>
      <p>14:00–16:00</p>
    </Sheet>,
  )
  return { onClose }
}

describe('Sheet', () => {
  it('is a modal dialog named by its title', () => {
    setup()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('FYP meeting')
  })

  it('takes focus on open, so a keyboard user is not left at the top of the document', () => {
    setup()

    expect(screen.getByRole('dialog')).toHaveFocus()
  })

  it('closes on Escape', async () => {
    const { onClose } = setup()

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ignores keys other than Escape', async () => {
    const { onClose } = setup()

    await userEvent.keyboard('{Enter}')

    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes from the close control', async () => {
    const { onClose } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders actions into the pinned bar rather than into the body', () => {
    setup(<Button>Done</Button>)

    const bar = screen.getByTestId('sheet-actions')
    expect(bar).toContainElement(screen.getByRole('button', { name: 'Done' }))
  })

  it('has no action bar when it is given no actions', () => {
    setup()

    expect(screen.queryByTestId('sheet-actions')).not.toBeInTheDocument()
  })

  it('does not steal focus from a control inside the body when the title changes while mounted', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Sheet title="0 words" onClose={onClose}>
        <input aria-label="notes" />
      </Sheet>,
    )

    screen.getByLabelText('notes').focus()

    // A title that is merely a display string -- e.g. a live word count -- is not a signal
    // that a new sheet has opened. Re-running the focus effect whenever it happens to change
    // would yank focus away from whatever the user is doing inside the body.
    rerender(
      <Sheet title="3 words" onClose={onClose}>
        <input aria-label="notes" />
      </Sheet>,
    )

    expect(screen.getByLabelText('notes')).toHaveFocus()
  })

  it('still moves focus to the panel on a forced remount, even when the title repeats', () => {
    const onClose = vi.fn()
    const outside = document.createElement('button')
    document.body.appendChild(outside)

    // Two different opens can legitimately share a title ("Note", "Note"). A consumer that
    // keeps Sheet in the same JSX position signals a genuinely new open with `key`, not with
    // title -- so a remount via key must still take focus regardless of what title reads.
    const { rerender } = render(
      <Sheet key="a" title="Note" onClose={onClose}>
        <p>first</p>
      </Sheet>,
    )
    outside.focus()

    rerender(
      <Sheet key="b" title="Note" onClose={onClose}>
        <p>second</p>
      </Sheet>,
    )

    expect(screen.getByRole('dialog')).toHaveFocus()
    document.body.removeChild(outside)
  })
})

/**
 * §0.2 requires primary actions in the lower half on mobile, which is why `Sheet` pins an
 * action bar at all -- before it existed, panels scattered their own buttons wherever they
 * fell: mid-screen in one, after a paragraph in another, under a textarea in a third. That
 * rule is only actually enforced if every sheet the app renders threads its buttons through
 * `actions` rather than dropping them into the scrolling body, and nothing checked that.
 *
 * This covers all six: `AddSheet`'s own choice screen and the three screens it opens
 * (`PhotoImportScreen`, `PlannerScreen`, `RequestBoxScreen`), `BlockSheet`, and the settings
 * sheet `RoomShell` renders inline. A structural assertion is enough -- each primary button
 * is inside `sheet-actions`, not merely present somewhere on screen.
 */
describe('every sheet in the app puts its actions in the pinned bar', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no endpoint'))))
  afterEach(() => vi.unstubAllGlobals())

  const emptySchedule = (): Schedule => ({
    items: [],
    start: { mental: 70, physical: 70, social: 70, errands: 70 },
    horizonDays: HORIZON_DAYS,
    sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  })

  const actionBar = () => screen.getByTestId('sheet-actions')

  /**
   * Ruling 60 removed `Cancel` from the chooser: it opens straight from the room, so the
   * close control is the only way out and there is nothing above it to go back to. With no
   * actions of its own left, it has no bar at all.
   */
  it('AddSheet: no bar at all, since Cancel went and nothing replaced it', () => {
    render(
      <AddSheet
        schedule={emptySchedule()}
        params={DEFAULT_PARAMS}
        today={0}
        blockLog={[]}
        predictions={[]}
        onAcceptItems={vi.fn()}
        onAcceptRequest={vi.fn()}
        onClose={vi.fn()}
        way={null}
        onWay={vi.fn()}
        onBack={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('sheet-actions')).toBeNull()
  })

  it('PhotoImportScreen: Back is in the bar', () => {
    render(
      <PhotoImportScreen
        onAccept={vi.fn()}
        onBack={vi.fn()}
        onClose={vi.fn()}
        dayLabels={['Today, Mon 8 Sep', 'Tue 9 Sep', 'Wed 10 Sep', 'Thu 11 Sep', 'Fri 12 Sep']}
        calendar={{ today: 0, startWeekday: 5, todayLabel: '11 September 2026' }}
      />,
    )

    expect(within(actionBar()).getByTestId('sheet-back')).toBeVisible()
  })

  it('PlannerScreen: Back and Read this are in the bar', () => {
    render(
      <PlannerScreen onAccept={vi.fn()} onBack={vi.fn()} onClose={vi.fn()} dayLabels={['Today, Mon 8 Sep', 'Tue 9 Sep', 'Wed 10 Sep', 'Thu 11 Sep', 'Fri 12 Sep']}
        calendar={{ today: 0, startWeekday: 5, todayLabel: '11 September 2026' }} />,
    )

    expect(within(actionBar()).getByTestId('sheet-back')).toBeVisible()
    expect(within(actionBar()).getByRole('button', { name: /read this/i })).toBeVisible()
  })

  it('RequestBoxScreen: Back and the pricing action are in the bar', () => {
    render(
      <RequestBoxScreen
        schedule={emptySchedule()}
        params={DEFAULT_PARAMS}
        today={0}
        blockLog={[]}
        predictions={[]}
        onAccept={vi.fn()}
        onBack={vi.fn()}
        onClose={vi.fn()}
        dayLabels={['Today, Mon 8 Sep', 'Tue 9 Sep', 'Wed 10 Sep', 'Thu 11 Sep', 'Fri 12 Sep']}
        calendar={{ today: 0, startWeekday: 5, todayLabel: '11 September 2026' }}
      />,
    )

    expect(within(actionBar()).getByTestId('sheet-back')).toBeVisible()
    expect(within(actionBar()).getByRole('button', { name: /what would this cost/i })).toBeVisible()
  })

  it('BlockSheet: Done is in the bar', () => {
    const model: BlockSheetModel = {
      item: {
        id: 'essay',
        title: 'Essay draft',
        type: 'mental',
        kind: 'studyBlock',
        hours: 3,
        intensity: 1,
        dayIndex: 5,
        startHour: 20,
        fixed: false,
        deadlineDay: null,
        protectedRest: false,
      },
      actions: ['done', 'later', 'cantStart'],
      microStart: null,
      recordedAnswer: null,
    }

    render(
      <BlockSheet
        model={model}
        onClose={vi.fn()}
        onBack={vi.fn()}
        onDone={vi.fn()}
        onLater={vi.fn()}
        onConfirm={vi.fn()}
        onRested={vi.fn()}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expect(within(actionBar()).getByRole('button', { name: 'Done' })).toBeVisible()
  })

  it('the settings sheet: Sign out is in the bar, not loose in the body', async () => {
    const repository = createLocalRepository()
    render(
      <RoomShell
        repository={repository}
        session={{ userId: 'u1', email: 'ada@um.edu.my' }}
        blockLog={[]}
        onAnswerBlock={vi.fn()}
      />,
    )

    await waitFor(() => expect(screen.getByTestId('open-settings')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-settings'))
    await screen.findByRole('dialog', { name: /settings/i })

    expect(within(actionBar()).getByRole('button', { name: /sign out/i })).toBeVisible()
  })

  /**
   * The way out of the calendar grant lives here, beside the Telegram unlink.
   *
   * This is the wiring assertion rather than the component's own: `CalendarConnection` is
   * tested in full in its own file, and what is checked here is that a student who wants
   * their calendar permission back can actually reach it -- a control nothing renders is
   * the same as no control at all.
   */
  it('the settings sheet: the calendar can be disconnected from here', async () => {
    const repository = createLocalRepository()
    render(
      <RoomShell
        repository={repository}
        session={{ userId: 'u1', email: 'ada@um.edu.my' }}
        blockLog={[]}
        onAnswerBlock={vi.fn()}
      />,
    )

    await waitFor(() => expect(screen.getByTestId('open-settings')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-settings'))
    await screen.findByRole('dialog', { name: /settings/i })

    expect(await screen.findByTestId('calendar-disconnect')).toBeVisible()
  })
})
