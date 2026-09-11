import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SleepSheet, type PlannedNight } from './SleepSheet'

const night = (over: Partial<PlannedNight> = {}): PlannedNight => ({
  dayIndex: 0,
  label: 'Today',
  hours: 8,
  forecast: null,
  ...over,
})

const props = (over: Partial<Parameters<typeof SleepSheet>[0]> = {}) => ({
  targetHours: 8,
  nights: [night()],
  realityLine: null,
  onSetTarget: vi.fn(),
  onSetNight: vi.fn(),
  onClose: vi.fn(),
  ...over,
})

/**
 * Retype a field and leave it, which is what a student does to a number.
 *
 * The blur matters: a half-typed number is a whole valid one, so nothing is committed until
 * the field is left. Typing "30" passes through "3" on the way, and committing per keystroke
 * would write a three-hour night the student never meant.
 */
const retype = async (testId: string, text: string) => {
  const field = screen.getByTestId(testId)
  await userEvent.clear(field)
  if (text !== '') await userEvent.type(field, text)
  await userEvent.tab()
}

describe('SleepSheet', () => {
  it('shows the target the student is aiming for', () => {
    render(<SleepSheet {...props({ targetHours: 9 })} />)

    expect(screen.getByTestId('sleep-target')).toHaveValue(9)
  })

  it('reports a typed target', async () => {
    const onSetTarget = vi.fn()
    render(<SleepSheet {...props({ onSetTarget })} />)

    await retype('sleep-target', '6')

    expect(onSetTarget).toHaveBeenLastCalledWith(6)
  })

  /** The whole point of typing rather than choosing: a figure the four buttons never offered. */
  it('reports a figure no fixed choice would have offered', async () => {
    const onSetTarget = vi.fn()
    render(<SleepSheet {...props({ onSetTarget })} />)

    await retype('sleep-target', '6.5')

    expect(onSetTarget).toHaveBeenLastCalledWith(6.5)
  })

  it('reports which night was set, and to what', async () => {
    const onSetNight = vi.fn()
    render(
      <SleepSheet
        {...props({
          nights: [night({ dayIndex: 0 }), night({ dayIndex: 3, label: 'Friday' })],
          onSetNight,
        })}
      />,
    )

    await retype('sleep-night-3-hours', '5.5')

    expect(onSetNight).toHaveBeenLastCalledWith(3, 5.5)
  })

  describe('a figure it cannot use', () => {
    /**
     * Nothing is reported and the student is told why. Committing an empty field would write
     * a zero-hour night on the way to typing "10", and `Number('')` is 0 rather than NaN --
     * so emptiness has to be caught deliberately rather than left to the numeric check.
     */
    it('says nothing upward when the field is emptied', async () => {
      const onSetTarget = vi.fn()
      render(<SleepSheet {...props({ onSetTarget })} />)

      await retype('sleep-target', '')

      expect(onSetTarget).not.toHaveBeenCalled()
      expect(screen.getByTestId('sleep-target-error')).toBeVisible()
    })

    it('refuses a night longer than a day', async () => {
      const onSetTarget = vi.fn()
      render(<SleepSheet {...props({ onSetTarget })} />)

      await retype('sleep-target', '30')

      expect(onSetTarget).not.toHaveBeenCalled()
      expect(screen.getByTestId('sleep-target-error')).toBeVisible()
    })

    it('refuses a negative night', async () => {
      const onSetTarget = vi.fn()
      render(<SleepSheet {...props({ onSetTarget })} />)

      await retype('sleep-target', '-3')

      expect(onSetTarget).not.toHaveBeenCalled()
    })

    /** Zero is a real night -- an all-nighter -- and must not be lumped in with nonsense. */
    it('accepts none at all, which is a night a student really has', async () => {
      const onSetTarget = vi.fn()
      render(<SleepSheet {...props({ onSetTarget })} />)

      await retype('sleep-target', '0')

      expect(onSetTarget).toHaveBeenLastCalledWith(0)
      expect(screen.queryByTestId('sleep-target-error')).toBeNull()
    })

    it('reports nothing for a night it cannot use either', async () => {
      const onSetNight = vi.fn()
      render(<SleepSheet {...props({ nights: [night({ dayIndex: 2 })], onSetNight })} />)

      await retype('sleep-night-2-hours', '99')

      expect(onSetNight).not.toHaveBeenCalled()
      expect(screen.getByTestId('sleep-night-2-error')).toBeVisible()
    })
  })

  it('lists a row per night, with its own label', () => {
    render(
      <SleepSheet
        {...props({
          nights: [
            night({ dayIndex: 0, label: 'Today', hours: 8 }),
            night({ dayIndex: 1, label: 'Tomorrow', hours: 5.5 }),
          ],
        })}
      />,
    )

    expect(screen.getByTestId('sleep-night-0')).toHaveTextContent('Today')
    expect(screen.getByTestId('sleep-night-1')).toHaveTextContent('Tomorrow')
    expect(screen.getByTestId('sleep-night-1-hours')).toHaveValue(5.5)
  })

  it('shows the forecast on the night that has one', () => {
    render(
      <SleepSheet
        {...props({
          nights: [
            night({
              dayIndex: 2,
              forecast: "Today's deadline will cost you about 2 hours of sleep.",
            }),
          ],
        })}
      />,
    )

    expect(screen.getByTestId('sleep-forecast-2')).toHaveTextContent('about 2 hours')
  })

  /**
   * Checked by absence, not by empty text. The assertion most likely to pass by accident: a
   * test looking for an empty string would also pass against an element rendered with nothing
   * in it, which still takes up space and is still announced by a screen reader.
   */
  it('renders no forecast element at all for a night without one', () => {
    render(<SleepSheet {...props({ nights: [night({ dayIndex: 2, forecast: null })] })} />)

    expect(screen.queryByTestId('sleep-forecast-2')).toBeNull()
  })

  it('shows the reality line when there is one', () => {
    render(<SleepSheet {...props({ realityLine: 'You plan 8 hours and average about 6.' })} />)

    expect(screen.getByTestId('sleep-reality')).toHaveTextContent('average about 6')
  })

  it('renders no reality element at all when there is nothing measured to say', () => {
    render(<SleepSheet {...props({ realityLine: null })} />)

    expect(screen.queryByTestId('sleep-reality')).toBeNull()
  })
})
