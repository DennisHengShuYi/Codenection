import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../../data'
import type { BlockRecord } from '../../domain/blockLog'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { RoomShell } from './RoomShell'

/**
 * This file used to cover the `mirror` and `papers` objects: the calibration screen behind
 * the mirror, and `BlockConfirm` behind the papers. §10's module table drops the whole
 * `calibration/` directory (a later task's deletion -- Task 17 -- since nothing routes to
 * it from here any more) and folds block confirmation into the block sheet and the today
 * card instead. What is left to cover at this level: that a confirmation reaches either
 * surface and lands in the durable block log, which `BlockSheet.test.tsx` and
 * `TodayCard.test.tsx` cannot prove on their own because neither is wired to storage.
 */
const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'essay',
  title: 'WIA3001 essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 0,
  startHour: 10,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

let counter = 0

const renderHome = async (schedule = week()) => {
  counter += 1
  const repository = createLocalRepository(`calibration-screen-${counter}`)
  await repository.clear()
  await repository.saveWeek(schedule)

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

  // Ruling 61: the today card and everything else the band used to hold wait behind the
  // `Waiting` button, so opening it is part of arriving at them -- the press a student
  // makes. Done here rather than in each test, since every test below is about what is
  // inside.
  await userEvent.click(screen.getByTestId('open-notices'))

  return repository
}

describe('RoomShell with a block to confirm', () => {
  // Fixed late in the day: `item()`'s default `startHour: 10, hours: 2` block is anchored
  // to "today" in these tests, and RoomShell now only asks about a same-day block once it
  // has finished (nowHour >= startHour + hours). Pinning the clock keeps these tests
  // deterministic instead of depending on the wall-clock hour the suite happens to run at.
  // `shouldAdvanceTime` keeps `waitFor` and `userEvent`'s own timers moving in real time.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2024, 5, 10, 23, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // §7.7: no cold start. The room works before anybody has answered anything.
  it('shows the room without anything to confirm', async () => {
    await renderHome()

    expect(screen.getByTestId('room-scene')).toBeVisible()
    expect(screen.queryByTestId('answer-right')).toBeNull()
  })

  // §7.9's whole point: two taps that feed the estimate correction.
  it('asks whether a scheduled block happened, on the today card', async () => {
    await renderHome(week({ items: [item({ dayIndex: 0 })] }))

    expect(screen.getByText(/wia3001 essay/i)).toBeVisible()
    expect(screen.getByTestId('answer-right')).toBeVisible()
  })

  it('records the answer to the durable block log and stops asking about the same block', async () => {
    const onAnswerBlock = vi.fn()
    counter += 1
    const repository = createLocalRepository(`calibration-record-${counter}`)
    await repository.clear()
    await repository.saveWeek(week({ items: [item({ dayIndex: 0 })] }))

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={onAnswerBlock} />)
    // Ruling 61: the cards wait behind the `Waiting` button now, so getting to one starts
    // with the press a student would make.
    await waitFor(() => expect(screen.getByTestId('open-notices')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-notices'))
    await waitFor(() => expect(screen.getByTestId('answer-longer')).toBeVisible())

    await userEvent.click(screen.getByTestId('answer-longer'))

    expect(onAnswerBlock).toHaveBeenCalledWith(
      expect.objectContaining({ blockId: 'essay', answer: 'longer', type: 'mental', plannedHours: 2 }),
    )
  })

  /**
   * §7.9: "no" is a neutral answer that feeds the model, not a failure. It must be
   * recorded rather than discarded.
   */
  it('records a no as data rather than throwing it away', async () => {
    const onAnswerBlock = vi.fn()
    counter += 1
    const repository = createLocalRepository(`calibration-no-${counter}`)
    await repository.clear()
    await repository.saveWeek(week({ items: [item({ dayIndex: 0 })] }))

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={onAnswerBlock} />)
    // Ruling 61: the cards wait behind the `Waiting` button now, so getting to one starts
    // with the press a student would make.
    await waitFor(() => expect(screen.getByTestId('open-notices')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-notices'))
    await waitFor(() => expect(screen.getByTestId('answer-didnt')).toBeVisible())

    await userEvent.click(screen.getByTestId('answer-didnt'))

    expect(onAnswerBlock).toHaveBeenCalledWith(expect.objectContaining({ answer: 'didnt' }))
  })

  it('a block already answered in the log is not asked about again', async () => {
    const answered = [
      {
        blockId: 'essay',
        type: 'mental' as const,
        plannedHours: 2,
        dayIndex: 0,
        answer: 'right' as const,
        answeredAt: 0,
      },
    ]
    counter += 1
    const repository = createLocalRepository(`calibration-answered-${counter}`)
    await repository.clear()
    await repository.saveWeek(week({ items: [item({ dayIndex: 0 })] }))

    render(<RoomShell repository={repository} blockLog={answered} onAnswerBlock={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    expect(screen.queryByTestId('answer-right')).toBeNull()
  })

  // The same question, reachable a second way: the week's own day, via the block sheet.
  // Anchored three days into the fortnight so day 0 genuinely reads as past, which is what
  // gives the sheet a `confirm` action rather than the "today or later" set.
  it('also confirms a past block from the week screen, through the block sheet', async () => {
    const onAnswerBlock = vi.fn()
    counter += 1
    const repository = createLocalRepository(`calibration-sheet-${counter}`)
    await repository.clear()
    const startedOn = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    await repository.saveWeek({
      ...week({ items: [item({ dayIndex: 0, id: 'past-essay' })] }),
      startedOn,
    })

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={onAnswerBlock} />)
    await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())

    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(await screen.findByTestId('day-0'))
    await userEvent.click(await screen.findByTestId('block-past-essay'))

    // Scoped to the sheet since Ruling 59: the block opens OVER the room now rather than
    // over a week page that had replaced it, so the room's own check-in card is still in
    // the document behind it and offers the same three answers.
    const sheet = await screen.findByRole('dialog')
    await userEvent.click(within(sheet).getByTestId('answer-right'))

    expect(onAnswerBlock).toHaveBeenCalledWith(
      expect.objectContaining({ blockId: 'past-essay', answer: 'right' }),
    )
  })

  /**
   * §8's sleep row: `schedule.sleepByDay` has never been written after a week is created
   * outside this card, and cutting the painter (§11) makes that the *only* remaining input
   * -- see `checkIn.ts`'s own doc comment. This is the level that proves `RoomShell` really
   * wires the answer through to the stored week, not just that `withSleep` itself works.
   */
  it('recording a night of sleep on the today card writes it into the saved week', async () => {
    const repository = await renderHome()
    await waitFor(() => expect(screen.getByTestId('sleep-under5')).toBeVisible())

    await userEvent.click(screen.getByTestId('sleep-under5'))

    await waitFor(async () => expect((await repository.loadWeek())?.sleepByDay[0]).toBe(4.5))
  })

  it('dismissing the today card with "Not now" hides it without answering anything', async () => {
    await renderHome()
    const card = await screen.findByRole('region', { name: /today's check-in/i })

    await userEvent.click(screen.getByRole('button', { name: /not now/i }))

    await waitFor(() => expect(screen.queryByRole('region', { name: /today's check-in/i })).toBeNull())
    expect(card).toBeTruthy()
  })

  /**
   * §7.6's Reality Check line, proved end to end rather than in isolation.
   *
   * `TodayCard.test.tsx` shows the component can render the sentence; it cannot show that
   * the durable block log actually reaches it. That wiring is the whole defect -- the
   * sentence existed and was tested for a fortnight while being rendered by nothing -- so
   * the regression that matters is this one, at the level where the log is real.
   */
  it('quotes the measured bias back to the student from their own block log', async () => {
    counter += 1
    const repository = createLocalRepository(`calibration-bias-${counter}`)
    await repository.clear()
    await repository.saveWeek(week({ items: [item({ dayIndex: 0 })] }))

    // Three overruns is exactly `MIN_SAMPLES`, and `longer` is a 1.5x factor.
    const overran: BlockRecord[] = Array.from({ length: 3 }, (_, index) => ({
      blockId: `past-${index}`,
      type: 'mental',
      plannedHours: 2,
      dayIndex: index,
      answer: 'longer',
      answeredAt: index,
    }))

    render(<RoomShell repository={repository} blockLog={overran} onAnswerBlock={vi.fn()} />)
    // Ruling 61: the cards wait behind the `Waiting` button now, so getting to one starts
    // with the press a student would make.
    await waitFor(() => expect(screen.getByTestId('open-notices')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-notices'))

    await waitFor(() =>
      expect(screen.getByTestId('bias-line')).toHaveTextContent(
        'You underestimate study and writing by about 1.5×. We pad it automatically.',
      ),
    )
  })

  /** The other half of the same wiring: an empty log must produce no claim at all. §7.6 --
   *  a screen asserting a bias nobody measured is worse than a screen without the line. */
  it('claims no bias when the block log is empty', async () => {
    await renderHome(week({ items: [item({ dayIndex: 0 })] }))

    expect(screen.getByTestId('answer-right')).toBeVisible()
    expect(screen.queryByTestId('bias-line')).toBeNull()
  })
})
