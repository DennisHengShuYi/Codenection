import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { RoomShell } from './room/RoomShell'

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

  render(<RoomShell repository={repository} />)
  await waitFor(() => expect(screen.getByTestId('object-mirror')).toBeVisible())

  return repository
}

describe('RoomShell with calibration', () => {
  /**
   * §7.7: no cold start. The room works before anybody has calibrated anything, and
   * calibration is a screen you choose to open rather than a wall in front of the app.
   */
  it('shows the room without any calibration at all', async () => {
    await renderHome()

    expect(screen.getByTestId('room-scene')).toBeVisible()
  })

  it('offers a way into calibration', async () => {
    await renderHome()

    expect(screen.getByTestId('object-mirror')).toHaveAccessibleName(/how i work/i)
  })

  it('can be opened and left without changing anything', async () => {
    await renderHome()

    await userEvent.click(screen.getByTestId('object-mirror'))
    expect(screen.getByTestId('calibration-modes')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: /^done$/i }))

    await waitFor(() => expect(screen.queryByTestId('zoom-mirror')).toBeNull())
    expect(screen.getByTestId('room-scene')).toBeVisible()
  })

  it('remembers a mode that was chosen', async () => {
    const repository = await renderHome()

    await userEvent.click(screen.getByTestId('object-mirror'))
    await userEvent.click(screen.getByTestId('mode-working'))

    await waitFor(async () =>
      expect((await repository.loadSettings()).calibration?.mode).toBe('working'),
    )
  })

  // §7.6 is the payoff, and it has to be reachable from where the work happens.
  it('shows the how-you-work screen alongside the tuning', async () => {
    await renderHome()

    await userEvent.click(screen.getByTestId('object-mirror'))

    expect(screen.getByTestId('how-you-work')).toBeVisible()
  })

  // §7.9's prompt, and its whole point: two taps that feed three parameters.
  it('asks whether a scheduled block happened', async () => {
    await renderHome(week({ items: [item()] }))

    // The prompt lives on the papers now: they are marked, and it is what you find there.
    expect(screen.getByTestId('object-papers')).toHaveAttribute('data-attention', 'true')

    await userEvent.click(screen.getByTestId('object-papers'))
    expect(screen.getByTestId('block-confirm')).toHaveTextContent('WIA3001 essay')
  })

  it('records the answer and stops asking about the same block', async () => {
    const repository = await renderHome(week({ items: [item()] }))

    await userEvent.click(screen.getByTestId('object-papers'))
    await userEvent.click(screen.getByTestId('happened-yes'))
    await userEvent.click(screen.getByTestId('difficulty-harder'))

    await waitFor(async () =>
      expect((await repository.loadSettings()).calibration?.confirmations).toHaveLength(1),
    )
    await waitFor(() =>
      expect(screen.getByTestId('object-papers')).toHaveAttribute('data-attention', 'false'),
    )
  })

  /**
   * §7.9: "no" is a neutral answer that feeds the model, not a failure. It must be recorded
   * rather than discarded -- a student who did not do the thing is exactly the one whose
   * data is most needed.
   */
  it('records a no as data rather than throwing it away', async () => {
    const repository = await renderHome(week({ items: [item()] }))

    await userEvent.click(screen.getByTestId('object-papers'))
    await userEvent.click(screen.getByTestId('happened-no'))
    await userEvent.click(screen.getByTestId('difficulty-expected'))

    await waitFor(async () =>
      expect((await repository.loadSettings()).calibration?.confirmations).toHaveLength(1),
    )
  })

  it('asks about nothing when there is nothing scheduled today', async () => {
    await renderHome()

    expect(screen.getByTestId('object-papers')).toHaveAttribute('data-attention', 'false')
  })

  /**
   * §7.9: a prompt nobody can escape is one they learn to dread. Walking away closes it --
   * and the papers keep asking, because dismissing is not answering. Asserting the mark
   * cleared would be asserting that the app forgot something it should not.
   */
  it('can be dismissed without answering, and keeps asking', async () => {
    await renderHome(week({ items: [item()] }))

    await userEvent.click(screen.getByTestId('object-papers'))
    await userEvent.click(screen.getByRole('button', { name: /not now/i }))

    await waitFor(() => expect(screen.queryByTestId('zoom-papers')).toBeNull())
    expect(screen.getByTestId('object-papers')).toHaveAttribute('data-attention', 'true')
  })
})
