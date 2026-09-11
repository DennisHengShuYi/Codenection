import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../../data'
import { DISTRESS_RUN } from '../../domain/distress'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'
import { RoomShell } from './RoomShell'

const week = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

let counter = 0

const openWith = async (reported: number[]) => {
  counter += 1
  const repository = createLocalRepository(`distress-${counter}`)
  await repository.clear()
  await repository.saveWeek(week())

  const settings = await repository.loadSettings()
  await repository.saveSettings({
    ...settings,
    calibration: {
      ...(settings.calibration ?? { predictions: [] }),
      predictions: reported.map((value, index) => ({
        forDate: `2026-08-${String(index + 1).padStart(2, '0')}`,
        predicted: 60,
        reported: value,
      })),
    } as NonNullable<typeof settings.calibration>,
  })

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

  // Ruling 61: the live cards wait behind the `Waiting` button now, so opening it is part
  // of arriving at one -- the press a student makes.
  await userEvent.click(screen.getByTestId('open-notices'))

  return repository
}

const bottomedOut = () => Array.from({ length: DISTRESS_RUN }, () => 10)

/**
 * §8's floor case, end to end.
 *
 * The app has no other answer for a student who is unwell rather than overloaded: every
 * other surface treats a bad fortnight as a scheduling problem, which is right for one and
 * useless for the other. Proved here rather than only at the component, because the whole
 * point is that a real reported history reaches it.
 */
describe('RoomShell when a student has been at the bottom for days', () => {
  it('stops offering to reschedule and says something else', async () => {
    await openWith(bottomedOut())

    expect(await screen.findByRole('region', { name: /a note about how you have been/i })).toBeVisible()
  })

  /** Above recovery, which otherwise leads. Offering a walk first would read as the app
   *  not having heard them. */
  it('puts it above the recovery card', async () => {
    await openWith(bottomedOut())

    const distress = await screen.findByRole('region', { name: /a note about how you have been/i })
    const recovery = screen.queryByRole('region', { name: /recovery/i })

    if (recovery !== null) {
      expect(distress.compareDocumentPosition(recovery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(distress).toBeVisible()
  })

  it('says nothing to a student having an ordinary fortnight', async () => {
    await openWith([70, 60, 70, 65, 70])

    expect(screen.queryByRole('region', { name: /a note about how you have been/i })).toBeNull()
  })

  /** One rough day is a rough day. A message this heavy arriving every few weeks is one a
   *  student learns to dismiss, which is worse than not having it at all. */
  it('says nothing about a single bad day', async () => {
    await openWith([70, 60, 10, 65, 70])

    expect(screen.queryByRole('region', { name: /a note about how you have been/i })).toBeNull()
  })

  /** The app noticing somebody got better matters as much as it noticing they did not. */
  it('says nothing to a student who has since recovered', async () => {
    await openWith([...bottomedOut(), 70, 70])

    expect(screen.queryByRole('region', { name: /a note about how you have been/i })).toBeNull()
  })

  /** It takes nothing away. Removing the app's use to make a point about wellbeing would
   *  just be a second thing going wrong for them. */
  it('leaves the rest of the app working', async () => {
    await openWith(bottomedOut())
    await screen.findByRole('region', { name: /a note about how you have been/i })

    expect(screen.getByTestId('room-scene')).toBeVisible()
    expect(screen.getByTestId('open-add')).toBeVisible()
  })

  it('can be put away', async () => {
    await openWith(bottomedOut())
    await screen.findByRole('region', { name: /a note about how you have been/i })

    await userEvent.click(screen.getByTestId('distress-dismiss'))

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /a note about how you have been/i })).toBeNull(),
    )
  })
})
