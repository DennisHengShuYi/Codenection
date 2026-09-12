import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Field } from '../kit/Field'
import { HourPicker } from './HourPicker'

/**
 * The hour a block starts, without scrolling a list of twenty-four.
 *
 * It was a `<select>` of every hour of the day, which is the control that reads best in
 * markup and worst on a screen: twenty-four near-identical rows, opened to change 09:00 to
 * 10:00. A clock is a thing everybody already knows how to type, and the platform has one.
 *
 * Whole hours only, because that is all the model holds -- `startHour` is an integer and the
 * grid draws on it. Minutes are floored rather than refused, and the field redraws to the
 * hour it took, so nothing is discarded behind the student's back.
 *
 * Driven with real state, because the control is controlled.
 *
 * A fixed `value` with a spy for `onChange` fights every keystroke: the field snaps back to
 * the prop between characters, and the test ends up asserting against the hour it started
 * with. This is how a consumer holds it, so it is how the test holds it.
 */
function Harness({ start = 9, onChange }: { start?: number; onChange: (hour: number) => void }) {
  const [hour, setHour] = useState(start)

  return (
    <Field label="Starts at">
      <HourPicker
        value={hour}
        onChange={(next) => {
          setHour(next)
          onChange(next)
        }}
      />
    </Field>
  )
}

const pick = (onChange = vi.fn(), start = 9) => {
  render(<Harness start={start} onChange={onChange} />)

  return { onChange, input: screen.getByLabelText('Starts at') }
}

describe('HourPicker', () => {
  it('shows the hour it was given, as a clock reads it', () => {
    const { input } = pick(vi.fn(), 9)

    expect(input).toHaveValue('09:00')
  })

  it('pads an hour before ten, so the field is never ambiguous', () => {
    const { input } = pick(vi.fn(), 0)

    expect(input).toHaveValue('00:00')
  })

  /*
   * The three below set the field's value rather than typing into it.
   *
   * A time input is segmented -- hours, then minutes -- and jsdom does not implement that
   * editing model, so `userEvent.type` puts characters somewhere no browser would. What is
   * under test here is this component's own half: what it does with a value once the field
   * has one. Typing is the platform's business, and asserting it against jsdom's stand-in
   * would prove nothing about a real browser.
   */
  it('reports the hour it was given', () => {
    const { onChange, input } = pick()

    fireEvent.change(input, { target: { value: '17:00' } })

    expect(onChange).toHaveBeenLastCalledWith(17)
  })

  /** Whole hours are all the model holds. Taking the hour and redrawing the field to it is
   *  honest; refusing the keystroke would leave somebody fighting a field that will not
   *  accept what they type. */
  it('takes the hour from a time that carries minutes', () => {
    const { onChange, input } = pick()

    fireEvent.change(input, { target: { value: '08:30' } })

    expect(onChange).toHaveBeenLastCalledWith(8)
    expect(input).toHaveValue('08:00')
  })

  /** A half-typed or cleared field is not an hour yet, and guessing one would move the block
   *  under somebody mid-keystroke. */
  it('says nothing while the field is empty', () => {
    const { onChange, input } = pick()

    fireEvent.change(input, { target: { value: '' } })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('says nothing about an hour that is not one', () => {
    const { onChange, input } = pick()

    fireEvent.change(input, { target: { value: '99:00' } })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('asks the platform for whole hours', () => {
    const { input } = pick()

    expect(input).toHaveAttribute('type', 'time')
    expect(input).toHaveAttribute('step', '3600')
  })

  /** The one thing a list of twenty-four did give: a finger-sized target. */
  it('keeps the touch target every other control in this app has', () => {
    const { input } = pick()

    expect(input.className).toMatch(/min-h-11/)
  })
})
