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

describe('SleepSheet', () => {
  it('shows the target the student is aiming for', () => {
    render(<SleepSheet {...props({ targetHours: 9 })} />)

    expect(screen.getByTestId('sleep-target')).toHaveTextContent('9')
  })

  it('reports a new target when one is chosen', async () => {
    const onSetTarget = vi.fn()
    render(<SleepSheet {...props({ onSetTarget })} />)

    await userEvent.click(screen.getByTestId('sleep-target-6'))

    expect(onSetTarget).toHaveBeenCalledWith(6)
  })

  it('lists a row per night, with its own label and hours', () => {
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
    expect(screen.getByTestId('sleep-night-1')).toHaveTextContent('5.5')
  })

  /** The day index as well as the figure: a page listing several nights that reported the
   *  wrong one would look correct in every screenshot. */
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

    await userEvent.click(screen.getByTestId('sleep-night-3-6'))

    expect(onSetNight).toHaveBeenCalledWith(3, 6)
  })

  it('shows the forecast on the night that has one', () => {
    render(
      <SleepSheet
        {...props({
          nights: [
            night({
              dayIndex: 2,
              forecast: "Friday's deadline will cost you about 2 hours of sleep.",
            }),
          ],
        })}
      />,
    )

    expect(screen.getByTestId('sleep-forecast-2')).toHaveTextContent('about 2 hours')
  })

  /**
   * Checked by absence, not by empty text. This is the assertion most likely to pass by
   * accident: a test looking for an empty string would also pass against an element rendered
   * with nothing in it, which still takes up space and is still announced by a screen reader.
   */
  it('renders no forecast element at all for a night without one', () => {
    render(<SleepSheet {...props({ nights: [night({ dayIndex: 2, forecast: null })] })} />)

    expect(screen.queryByTestId('sleep-forecast-2')).toBeNull()
  })

  it('shows the reality line when there is one', () => {
    render(<SleepSheet {...props({ realityLine: 'You plan 8 hours and average about 6.' })} />)

    expect(screen.getByTestId('sleep-reality')).toHaveTextContent('average about 6')
  })

  /** Same reasoning as the forecast: nothing measured means no element, not an empty one. */
  it('renders no reality element at all when there is nothing measured to say', () => {
    render(<SleepSheet {...props({ realityLine: null })} />)

    expect(screen.queryByTestId('sleep-reality')).toBeNull()
  })
})
