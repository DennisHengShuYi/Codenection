import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { RoomShell } from './room/RoomShell'

/**
 * §5 wired into the screen. What this covers that the component tests cannot: that accepting
 * a prescription reaches the *stored* week as protected rest, and that the lit door now
 * opens somewhere to go rather than a sentence.
 *
 * Nothing here touches a network -- there is no model in this feature at all.
 */
const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

/** Low enough to prescribe, high enough that §1.5's low-energy view does not take over at
 *  20 -- otherwise the test would exercise that branch instead of this one. */
const socialLow = () => week({ start: { mental: 70, physical: 70, social: 25, errands: 70 } })

/** Both below the door's threshold of 25, which is what lights it. */
const doorLit = () => week({ start: { mental: 70, physical: 22, social: 22, errands: 70 } })

let counter = 0

const renderHome = async (schedule: Schedule) => {
  counter += 1
  const repository = createLocalRepository(`recovery-screen-${counter}`)
  await repository.clear()
  await repository.saveWeek(schedule)

  render(<RoomShell repository={repository} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

  return repository
}

describe('RoomShell with recovery', () => {
  it('suggests one thing when a reserve is low', async () => {
    await renderHome(socialLow())

    /**
     * §5.2 matches the advice to the depleted type, so the *furniture* matches it too. A
     * social prescription marks the phone, because that is where reaching somebody starts --
     * marking the bed would tell a lonely student to go to sleep, which is the failure the
     * engine already refuses to make.
     */
    expect(screen.getByTestId('object-phone')).toHaveAttribute('data-attention', 'true')

    await userEvent.click(screen.getByTestId('object-phone'))
    expect(screen.getByTestId('prescription')).toBeVisible()
  })

  // Advice offered to somebody who is fine is advice ignored when they are not.
  it('suggests nothing when nothing is low', async () => {
    await renderHome(week())

    expect(screen.getByTestId('object-phone')).toHaveAttribute('data-attention', 'false')
  })

  // Replacing the room with advice would take away the thing the student came to look at.
  it('sits beside the room rather than instead of it', async () => {
    await renderHome(socialLow())

    // Beside the room rather than instead of it: the object asks, the room stays.
    expect(screen.getByTestId('object-phone')).toHaveAttribute('data-attention', 'true')
    expect(screen.getByTestId('room-scene')).toBeVisible()
  })

  /**
   * The point of the unit. Checked against storage rather than the screen, because
   * everything downstream draws from stored state.
   */
  it('accepting puts protected rest in the saved week', async () => {
    const repository = await renderHome(socialLow())

    await userEvent.click(screen.getByTestId('object-phone'))
    await userEvent.click(screen.getByRole('button', { name: /put it in my week/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(1))

    // protectedRest is what makes the optimizer unable to move it to fit work in. That
    // refusal is already proven by the optimizer's own tests; this asserts the flag is set.
    expect((await repository.loadWeek())?.items[0]?.protectedRest).toBe(true)
  })

  it('dismissing records it and stops offering the same thing', async () => {
    const repository = await renderHome(socialLow())

    await userEvent.click(screen.getByTestId('object-phone'))
    await userEvent.click(screen.getByRole('button', { name: /does not help/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.recoveryLog).toHaveLength(1))
    await waitFor(() =>
      expect(screen.getByTestId('object-phone')).toHaveAttribute('data-attention', 'false'),
    )
  })

  // §5.3: the door already lit. This is the part that was missing.
  it('tapping the lit door offers somewhere to go', async () => {
    await renderHome(doorLit())

    await userEvent.click(screen.getByTestId('object-door'))

    expect(await screen.findByTestId('door-panel')).toBeVisible()
    expect(screen.getAllByTestId(/^outing-/).length).toBeGreaterThan(0)
  })

  it('choosing an outing puts it in the saved week as protected rest', async () => {
    const repository = await renderHome(doorLit())

    await userEvent.click(screen.getByTestId('object-door'))
    await userEvent.click((await screen.findAllByTestId(/^outing-/))[0]!)

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(1))
    expect((await repository.loadWeek())?.items[0]?.protectedRest).toBe(true)
  })

  // A quiet door still explains itself, exactly as it did before.
  it('leaves the unlit door saying what it said before', async () => {
    await renderHome(week())

    await userEvent.click(screen.getByTestId('object-door'))

    // A quiet door still explains itself -- it reads its state rather than doing nothing.
    expect(await screen.findByTestId('zoom-door')).toBeInTheDocument()
  })
})
