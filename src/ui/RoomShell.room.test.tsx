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
 * `AccuracyNote`, the live cards, then `The week` and `+`. §1.1's compact readout is the
 * room's corner gauge and nothing else (Ruling 53): the five-bar breakdown that Ruling 28
 * correctly rescued from orphanhood was parked here by mistake, giving the room two
 * capacity readings, and it now lives on the week screen. What this file proves: that the
 * room leads, that it reads capacity exactly once, that the breakdown is still reachable
 * from it, and that acting on a block reaches the *stored* week through the week screen and
 * the block sheet rather than a tap on the room itself.
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
   * Ruling 53. `CapacityDial` was bolted onto the room screen beneath the two permanent
   * controls, which gave the room two capacity readings: the compact corner gauge §1.1
   * asked for, and a five-bar dashboard the room screen's design never contained (the doc
   * mentions `CapacityDial` once, in a §11 footnote about a colour token). The breakdown
   * moved to the week screen; the room keeps one reading.
   *
   * The behavioural RED: every part of the loud second reading must be absent from the
   * room, and this fails against the screen that shipped.
   */
  it('reads capacity once on the room screen, as the corner gauge alone', async () => {
    await renderWithErrand()

    expect(screen.getByTestId('room-gauge')).toHaveTextContent(/^\d{1,3}%$/)
    expect(screen.queryAllByRole('meter')).toHaveLength(0)
    expect(screen.queryByTestId('dial-gauge')).toBeNull()
    expect(screen.queryByTestId('reserve-text-equivalent')).toBeNull()
  })

  /**
   * The other half of the move, and the half that matters most: Ruling 28 found this
   * content orphaned once and it must not be orphaned again. Reachability is asserted by
   * walking there the way a student does -- one tap on `The week` -- rather than by
   * rendering `CapacityDial` in isolation and assuming somebody links to it.
   */
  it('reaches the five domain bars and the spoken summary through the week screen', async () => {
    await renderWithErrand()

    expect(screen.queryAllByRole('meter')).toHaveLength(0)

    await userEvent.click(screen.getByTestId('open-week'))

    expect(await screen.findAllByRole('meter')).toHaveLength(5)
    expect(screen.getByTestId('reserve-text-equivalent')).toBeVisible()
  })

  /**
   * The low-social warning is the single clearest evidence the model understands burnout
   * rather than summing hours -- a tracker reads a quiet week as healthy. It has already
   * been lost once (Ruling 28), so the move gets its own test rather than riding on the
   * meters above.
   */
  it('still flags a low social reserve as a warning, one tap into the week', async () => {
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

    await userEvent.click(screen.getByTestId('open-week'))

    expect(await screen.findByTestId('warning-social')).toHaveTextContent(
      /spending a lot of time alone/i,
    )
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
