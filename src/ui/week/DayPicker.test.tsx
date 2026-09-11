import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'
import { DayPicker } from './DayPicker'

/**
 * Picking a day, as a calendar rather than as twenty-one lines.
 *
 * The form offered a `<select>` of every day in the horizon, which on a phone is a scrolling
 * column of dates and on a laptop is a popup taller than the sheet it came from. Nobody
 * reads a date that way -- they look for it on a calendar.
 *
 * A native `<input type="date">` rather than a drawn grid. The browser brings a real
 * calendar, keyboard support, a screen-reader-announced field and a proper phone picker,
 * none of which a hand-rolled month view gets for free -- and `min`/`max` fence it to the
 * horizon so an unreachable day cannot be chosen.
 *
 * The fallback matters as much as the picker. A week with no `startedOn` has no dates at
 * all -- the seeded fortnight has never been anchored -- so there is nothing to show a
 * calendar of, and the day numbers come back instead.
 */
const anchored = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  startedOn: '2026-09-12',
  ...over,
})

const setup = (over: Partial<Parameters<typeof DayPicker>[0]> = {}) => {
  const onChange = vi.fn()

  render(
    <DayPicker
      schedule={anchored()}
      today={0}
      value={2}
      label="Day"
      onChange={onChange}
      {...over}
    />,
  )

  return { onChange }
}

describe('DayPicker', () => {
  it('offers a calendar field rather than a list of days', () => {
    setup()

    expect(screen.getByLabelText('Day')).toHaveAttribute('type', 'date')
  })

  it('shows the day it was given, as a date', () => {
    setup({ value: 2 })

    expect(screen.getByLabelText('Day')).toHaveValue('2026-09-14')
  })

  /** One change event rather than typed keystrokes: a date field fires on every character,
   *  and the intermediate values are not dates. */
  it('reports the day index for the date that was picked', () => {
    const { onChange } = setup({ value: 0 })

    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-09-15' } })

    expect(onChange).toHaveBeenLastCalledWith(3)
  })

  /** The horizon is the only range the model can hold, and a date outside it has no day
   *  index to become. Fenced in the field rather than refused after the fact. */
  it('fences the calendar to the fortnight', () => {
    setup()

    const field = screen.getByLabelText('Day')

    expect(field).toHaveAttribute('min', '2026-09-12')
    expect(field).toHaveAttribute('max', '2026-10-02')
  })

  it('falls back to a list when the week has no dates at all', () => {
    setup({ schedule: anchored({ startedOn: undefined }) })

    expect(screen.getByLabelText('Day').tagName).toBe('SELECT')
  })

  describe('when a day is optional', () => {
    it('reports nothing chosen when the field is cleared', () => {
      const { onChange } = setup({ value: 2, optional: true })

      fireEvent.change(screen.getByLabelText('Day'), { target: { value: '' } })

      expect(onChange).toHaveBeenLastCalledWith(null)
    })

    it('shows an empty field when nothing is set', () => {
      setup({ value: null, optional: true })

      expect(screen.getByLabelText('Day')).toHaveValue('')
    })

    /** Without a day there is no date to show, and a required field cannot be left empty --
     *  so the list keeps its "Not set" line where the calendar would have nothing. */
    it('keeps a way to say nothing on the fallback list', () => {
      setup({ schedule: anchored({ startedOn: undefined }), value: null, optional: true })

      expect(screen.getByLabelText('Day')).toHaveValue('')
    })
  })
})
