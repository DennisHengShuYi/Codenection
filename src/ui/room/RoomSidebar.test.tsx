import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROFILE } from '../../domain/calibration'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'
import { roomModel } from './roomModel'
import { RoomSidebar } from './RoomSidebar'

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const modelOf = (schedule = week(), profile = DEFAULT_PROFILE) =>
  roomModel({ schedule, profile, today: 0 })

/** Calibrated, so the mirror is not permanently asking. Without this there is no such thing
 *  as a week where nothing needs you, and the empty state below could never be reached. */
const calibrated = { ...DEFAULT_PROFILE, modeChosen: true, painted: true }

const setup = (schedule = week(), trimmed = false, profile = DEFAULT_PROFILE) => {
  const onSelect = vi.fn()
  render(<RoomSidebar model={modelOf(schedule, profile)} onSelect={onSelect} trimmed={trimmed} />)
  return { onSelect }
}

const litDoor = () => week({ start: { mental: 70, physical: 20, social: 20, errands: 70 } })

describe('RoomSidebar', () => {
  /**
   * §1.5's text equivalent, moved here from under the drawing.
   *
   * It is not weaker for moving: it used to describe a picture nobody could operate, and it
   * now introduces a list that does everything the picture does.
   */
  it('states the whole room in words', () => {
    setup(week({ start: { mental: 8, physical: 8, social: 8, errands: 8 } }))

    expect(screen.getByTestId('words-text-equivalent').textContent?.length).toBeGreaterThan(20)
  })

  it('lists every object as something you can act on', () => {
    setup()

    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(11)
  })

  // The reading is what makes the list useful before anything is tapped.
  it('shows each object current reading', () => {
    setup()

    expect(screen.getByTestId('row-bed').textContent).toMatch(/\d/)
  })

  it('does the same thing as touching the object', async () => {
    const { onSelect } = setup()

    await userEvent.click(screen.getByTestId('row-desk'))

    expect(onSelect).toHaveBeenCalledWith('desk')
  })

  // §1.5: colour alone cannot carry meaning, in the list as much as on the furniture.
  it('names attention in words rather than only marking it', () => {
    setup(litDoor())

    expect(screen.getByTestId('row-door').textContent).toMatch(/needs you/i)
  })

  it('says nothing of the sort for an object that is quiet', () => {
    setup()

    expect(screen.getByTestId('row-door').textContent).not.toMatch(/needs you/i)
  })

  /**
   * Fixed order, and it must not move when something starts asking. A list that reorders
   * itself has to be re-learned every visit.
   */
  it('keeps its order when attention changes', () => {
    const { container } = render(
      <RoomSidebar model={modelOf()} onSelect={vi.fn()} />,
    )
    const calm = [...container.querySelectorAll('[data-testid^="row-"]')].map((n) => n.getAttribute('data-testid'))

    const busy = render(<RoomSidebar model={modelOf(litDoor())} onSelect={vi.fn()} />)
    const lit = [...busy.container.querySelectorAll('[data-testid^="row-"]')].map((n) =>
      n.getAttribute('data-testid'),
    )

    expect(lit).toEqual(calm)
  })

  /** §1.5's low-energy mode: the same list, cut to what matters, rather than a separate
   *  screen that has to be kept in step. */
  it('trims to what needs you in low-energy mode', () => {
    setup(litDoor(), true)

    expect(screen.getAllByRole('button').length).toBeLessThanOrEqual(2)
  })

  it('says so plainly when nothing needs you at all', () => {
    setup(week({ start: { mental: 90, physical: 90, social: 90, errands: 90 } }), true, calibrated)

    expect(screen.getByTestId('room-sidebar').textContent).toMatch(/nothing needs you/i)
  })

  it('is announced as what it is', () => {
    setup()

    expect(screen.getByRole('navigation')).toHaveAccessibleName(/room/i)
  })
})
