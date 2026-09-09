import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROFILE } from '../../domain/calibration'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { roomModel } from './roomModel'
import { RoomButtons } from './RoomButtons'

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
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
  ...over,
})

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const setup = (schedule = week(), today = 0) => {
  const onSelect = vi.fn()
  render(
    <RoomButtons
      model={roomModel({ schedule, profile: DEFAULT_PROFILE, today })}
      onSelect={onSelect}
    />,
  )
  return { onSelect }
}

/**
 * Every feature as a button, over the room.
 *
 * The room stays the backdrop and still reacts, but nothing has to be *found* by tapping
 * furniture -- which was the one real risk in the diegetic design.
 */
describe('RoomButtons', () => {
  it('gives every object a button', () => {
    setup()

    // Eleven pieces of furniture on a week with nothing to clear.
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(11)
  })

  it('says what each one does and what it currently reads', () => {
    setup()

    const plan = screen.getByTestId('button-desk')

    expect(plan.textContent).toMatch(/plan my week/i)
    expect(plan.textContent).toMatch(/\d/)
  })

  it('opens the object it belongs to', async () => {
    const { onSelect } = setup()

    await userEvent.click(screen.getByTestId('button-light'))

    expect(onSelect).toHaveBeenCalledWith('light')
  })

  it('gives a task you are avoiding its own button', () => {
    setup(week({ items: [item()] }))

    expect(screen.getByTestId('button-clutter-laundry').textContent).toMatch(/laundry/i)
  })

  /**
   * §1.5: colour alone cannot carry meaning. A badge says nothing to somebody who cannot see
   * it, so the accessible name carries it too.
   */
  it('names attention rather than only badging it', () => {
    setup(week({ start: { mental: 70, physical: 20, social: 20, errands: 70 } }))

    expect(screen.getByTestId('button-door')).toHaveAccessibleName(/needs you/i)
  })

  it('does not claim attention on a quiet object', () => {
    setup()

    expect(screen.getByTestId('button-door')).not.toHaveAccessibleName(/needs you/i)
  })

  /**
   * A number you are reading is not a thing you are doing. Giving all twelve equal weight
   * makes the handful that matter harder to find, which is the failure a wall of buttons
   * invites.
   */
  it('keeps doing and looking apart', () => {
    setup()

    expect(screen.getByTestId('button-desk').className).toContain('py-3')
    expect(screen.getByTestId('button-plant').className).toContain('py-2')
  })

  // A task being avoided must never be demoted below a reading.
  it('puts a task you are avoiding in the doing band', () => {
    setup(week({ items: [item()] }))

    expect(screen.getByTestId('button-clutter-laundry').className).toContain('py-3')
  })

  it('is reachable by keyboard in the order it is shown', async () => {
    setup()

    await userEvent.tab()

    expect(screen.getAllByRole('button')[0]).toHaveFocus()
  })
})
