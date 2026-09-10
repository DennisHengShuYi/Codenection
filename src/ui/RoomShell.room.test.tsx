import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { RoomShell } from './room/RoomShell'

/**
 * The room screen itself, rather than the components in isolation.
 *
 * §3 gives it a fixed shape: `<h1>`, `PreviewBanner`, `Room`, the `describeRoom` paragraph,
 * `AccuracyNote`, the live cards, then `The week` and `+`. §1.1's dial moved permanently
 * into the room's own corner gauge once the drawing became display-only (Task 12) -- there
 * is no remaining tap target to carry a separate dial screen, so that half of the old file
 * (the five domain bars behind `light`) has no home to move to and is not relocated; it is
 * a real, reported reduction in reachability rather than a silent one -- see the task
 * report. What this file keeps proving: that the room leads, and that acting on a block now
 * reaches the *stored* week through the week screen and the block sheet, not a tap on the
 * room itself.
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

const renderWithErrand = async () => {
  counter += 1
  const repository = createLocalRepository(`room-screen-${counter}`)
  await repository.clear()
  await repository.saveWeek(weekWithErrand())

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

  return repository
}

describe('RoomShell with the room', () => {
  // §1.1: the room is the surface, the gauge a compact readout inside it -- no tap
  // required for either.
  it('leads with the room and carries the gauge in its own corner', async () => {
    await renderWithErrand()

    expect(screen.getByTestId('room-scene')).toBeVisible()
    expect(screen.getByTestId('room-gauge')).toHaveTextContent(/^\d{1,3}%$/)
  })

  // §1.5's text equivalent stays on screen permanently now, not behind a tap.
  it('states the room in words too, and publishes the accuracy line beside it', async () => {
    await renderWithErrand()

    expect(screen.getByTestId('room-text-equivalent')).toBeVisible()
    expect(screen.getByTestId('accuracy-note')).toBeVisible()
  })

  /**
   * Coordinator review (combined 12+13): `CapacityDial` -- the semicircular gauge, the five
   * domain bars each against its own ceiling, and the low-social-flagged-as-warning logic
   * that is the app's actual differentiator -- had zero production consumers once `Room`'s
   * tap targets went. §1.1 says it "sits in one corner as a compact readout, no tap
   * required", not that it is deleted. This is the behavioural RED: a state with a low
   * social reserve must show the warning without any interaction, and it fails against the
   * bare-percentage-only room screen.
   */
  it('shows the low-social warning with no tap required', async () => {
    counter += 1
    const repository = createLocalRepository(`room-dial-${counter}`)
    await repository.clear()
    await repository.saveWeek({
      items: [],
      start: { mental: 70, physical: 70, social: 20, errands: 70 },
      horizonDays: HORIZON_DAYS,
      sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
    })

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    expect(screen.getByTestId('warning-social')).toHaveTextContent(/spending a lot of time alone/i)
  })

  it('still carries the five domain bars and the dial\'s own spoken summary', async () => {
    await renderWithErrand()

    expect(screen.getAllByRole('meter')).toHaveLength(5)
    expect(screen.getByTestId('reserve-text-equivalent')).toBeVisible()
  })

  /**
   * Flagged by Task 12: the room drawing's `aria-label` is already the full, uncapped text
   * equivalent (`describeRoomFully`). The visible paragraph beneath it repeats a subset of
   * the same sentences (character and weather, always, verbatim) for sighted readers.
   * Without `aria-hidden` a screen reader would announce both back to back -- the full
   * version, then a partial repeat. This is the guard against that regressing silently.
   */
  it('does not double-announce the room to a screen reader', async () => {
    await renderWithErrand()

    const scene = screen.getByTestId('room-scene')
    const paragraph = screen.getByTestId('room-text-equivalent')

    expect(scene.getAttribute('aria-label')).toBeTruthy()
    expect(paragraph).toHaveAttribute('aria-hidden', 'true')
    // Still there for a sighted reader who does not use a screen reader.
    expect(paragraph).toBeVisible()
  })

  it('offers the week and the add sheet as the two permanent controls', async () => {
    await renderWithErrand()

    expect(screen.getByTestId('open-week')).toBeVisible()
    expect(screen.getByTestId('open-add')).toBeVisible()
  })

  // The point of the whole unit: acting on a block has real model consequences.
  it('completing an errand through the week screen removes it from the saved week', async () => {
    const repository = await renderWithErrand()

    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(await screen.findByTestId('day-2'))
    await userEvent.click(await screen.findByTestId('block-laundry'))
    await userEvent.click(await screen.findByRole('button', { name: /^done$/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(0))
  })

  it('deferring an errand moves it later in the saved week', async () => {
    const repository = await renderWithErrand()

    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(await screen.findByTestId('day-2'))
    await userEvent.click(await screen.findByTestId('block-laundry'))
    await userEvent.click(await screen.findByRole('button', { name: /^later$/i }))

    await waitFor(async () =>
      expect((await repository.loadWeek())?.items[0]?.dayIndex).toBeGreaterThan(2),
    )
  })

  /**
   * Coordinator review: "Move" offered no real picker and was indistinguishable in effect
   * from "Later" -- a silent stub. Dropped from `blockActions.ts` rather than left half-real
   * (see its doc comment). This is the regression guard: a movable block's sheet must not
   * offer it.
   */
  it('does not offer Move -- there is no picker behind it', async () => {
    await renderWithErrand()

    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(await screen.findByTestId('day-2'))
    await userEvent.click(await screen.findByTestId('block-laundry'))

    expect(screen.queryByRole('button', { name: /move/i })).toBeNull()
    expect(screen.getByRole('button', { name: /^later$/i })).toBeVisible()
  })

  // A protected-rest block asks a binary question rather than the four-way duration one.
  it('answering whether a protected rest block actually happened records it in the block log', async () => {
    const onAnswerBlock = vi.fn()
    counter += 1
    const repository = createLocalRepository(`room-rest-${counter}`)
    await repository.clear()
    await repository.saveWeek({
      items: [
        {
          id: 'nap',
          title: 'Rest',
          type: 'physical',
          kind: 'rest',
          hours: 1,
          intensity: 1,
          dayIndex: 3,
          startHour: 16,
          fixed: true,
          deadlineDay: null,
          protectedRest: true,
        },
      ],
      start: { mental: 70, physical: 70, social: 70, errands: 70 },
      horizonDays: HORIZON_DAYS,
      sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
    })

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={onAnswerBlock} />)
    await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())

    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(await screen.findByTestId('day-3'))
    await userEvent.click(await screen.findByTestId('block-nap'))
    await userEvent.click(await screen.findByTestId('rested-yes'))

    expect(onAnswerBlock).toHaveBeenCalledWith(expect.objectContaining({ blockId: 'nap', answer: 'right' }))
  })

  /**
   * Coordinator review: `Repository.recordBlockAnswer` only upserts, so an "Undo" button on
   * an already-answered past block would produce no visible change -- a second silent stub.
   * Replaced with stating what was actually recorded (`blockActions.ts`'s `recordedAnswer`,
   * rendered by `BlockSheet`). This proves `RoomShell` really threads a real answer from the
   * block log through to that text, not just that `BlockSheet` can render one in isolation.
   */
  it('an already-answered block states what was recorded, with no Undo button', async () => {
    const onAnswerBlock = vi.fn()
    counter += 1
    const repository = createLocalRepository(`room-undo-${counter}`)
    await repository.clear()
    const startedOn = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    await repository.saveWeek({
      items: [
        {
          id: 'answered',
          title: 'Answered essay',
          type: 'mental',
          kind: 'studyBlock',
          hours: 2,
          intensity: 1,
          dayIndex: 0,
          startHour: 10,
          fixed: false,
          deadlineDay: null,
          protectedRest: false,
        },
      ],
      start: { mental: 70, physical: 70, social: 70, errands: 70 },
      horizonDays: HORIZON_DAYS,
      sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
      startedOn,
    })
    const answered = [
      {
        blockId: 'answered',
        type: 'mental' as const,
        plannedHours: 2,
        dayIndex: 0,
        answer: 'right' as const,
        answeredAt: 0,
      },
    ]

    render(<RoomShell repository={repository} blockLog={answered} onAnswerBlock={onAnswerBlock} />)
    await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())

    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(await screen.findByTestId('day-0'))
    await userEvent.click(await screen.findByTestId('block-answered'))

    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull()
    expect(await screen.findByTestId('recorded-answer')).toHaveTextContent('You said: About right')
    expect(onAnswerBlock).not.toHaveBeenCalled()
  })
})
