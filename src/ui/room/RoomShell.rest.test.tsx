import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../../data'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { RoomShell } from './RoomShell'

/**
 * §5's Rest button, wired into the room.
 *
 * What this covers that `planRest` and `RestPreview` cannot between them: that the control
 * is reachable at all, that it is reachable by the student §1.5 strips the interface for,
 * and that approving reaches *stored* state as protected rest.
 */
const daysAgo = (days: number): string => {
  const then = new Date()
  then.setUTCDate(then.getUTCDate() - days)
  return then.toISOString().split('T')[0] ?? ''
}

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'essay',
  title: 'Ethics essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 3,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 60, physical: 60, social: 60, errands: 60 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  startedOn: daysAgo(3),
  ...over,
})

let counter = 0

const openRoom = async (schedule: Schedule = week()) => {
  counter += 1
  const repository = createLocalRepository(`rest-button-${counter}`)
  await repository.clear()
  await repository.saveWeek(schedule)

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

  return repository
}

describe('the Rest button', () => {
  it('is in the room, without opening anything first', async () => {
    await openRoom()

    expect(screen.getByTestId('open-rest')).toBeVisible()
  })

  it('opens a preview rather than changing the week', async () => {
    const repository = await openRoom()
    const before = await repository.loadWeek()

    await userEvent.click(screen.getByTestId('open-rest'))

    expect(await screen.findByTestId('rest-summary')).toBeVisible()
    expect(await repository.loadWeek()).toEqual(before)
  })

  it('puts protected, fixed rest in the stored week once approved', async () => {
    const repository = await openRoom()

    await userEvent.click(screen.getByTestId('open-rest'))
    await userEvent.click(await screen.findByTestId('approve-rest'))

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(1))
    const [saved] = (await repository.loadWeek())?.items ?? []

    // §5.1: rest the optimizer can move to fit work in is not protected at all, so both
    // flags have to land, not one.
    expect(saved?.protectedRest).toBe(true)
    expect(saved?.fixed).toBe(true)
    expect(saved?.kind).toBe('rest')
  })

  it('writes nothing when the student backs out', async () => {
    const repository = await openRoom()
    const before = await repository.loadWeek()

    await userEvent.click(screen.getByTestId('open-rest'))
    await userEvent.click(await screen.findByTestId('discard-rest'))

    await waitFor(() => expect(screen.queryByTestId('rest-summary')).toBeNull())
    expect(await repository.loadWeek()).toEqual(before)
  })

  /**
   * §1.5 strips the interface exactly when a student is flat, which is exactly when this
   * button is the one thing worth reaching. `The week` and `Waiting` are both withheld in
   * that state; withholding Rest as well would remove the one control the reduced view
   * exists to serve.
   */
  it('survives the low-energy screen, where the other controls do not', async () => {
    await openRoom(
      week({
        start: { mental: 8, physical: 9, social: 7, errands: 10 },
        items: [item({ dayIndex: 3, startHour: 9, hours: 3 })],
      }),
    )

    expect(screen.queryByTestId('open-week')).toBeNull()
    expect(screen.getByTestId('open-rest')).toBeVisible()
  })

  it('has an address of its own, so the preview is a place rather than a mode', async () => {
    await openRoom()

    await userEvent.click(screen.getByTestId('open-rest'))
    await screen.findByTestId('rest-summary')

    expect(window.location.pathname).toBe('/rest')
  })
})
