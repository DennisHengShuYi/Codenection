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
   * "Move" has no target-picking UI yet (noted in `RoomShell.tsx` and the task report), so
   * it shares `deferItem` with "Later" for now. This proves that stand-in actually moves
   * the block rather than silently doing nothing -- the honest-gap choice, exercised.
   */
  it('moving a block (the stand-in for a mover not yet built) still changes the saved week', async () => {
    const repository = await renderWithErrand()

    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(await screen.findByTestId('day-2'))
    await userEvent.click(await screen.findByTestId('block-laundry'))
    await userEvent.click(await screen.findByRole('button', { name: /^move$/i }))

    await waitFor(async () =>
      expect((await repository.loadWeek())?.items[0]?.dayIndex).toBeGreaterThan(2),
    )
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
   * The repository has no operation to retract a recorded answer (`recordBlockAnswer` only
   * upserts), so Undo -- offered on an already-answered past block -- closes rather than
   * pretending to do something real. Proven rather than assumed: nothing is recorded, and
   * the saved week is untouched.
   */
  it('undoing an already-answered block closes the sheet without recording anything new', async () => {
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
    await userEvent.click(await screen.findByRole('button', { name: /^undo$/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onAnswerBlock).not.toHaveBeenCalled()
  })
})
