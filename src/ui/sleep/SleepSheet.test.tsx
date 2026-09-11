import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SleepSheet } from './SleepSheet'

const props = (over: Partial<Parameters<typeof SleepSheet>[0]> = {}) => ({
  targetHours: 8,
  tonightHours: 8,
  realityLine: null,
  forecasts: [],
  onSetTarget: vi.fn(),
  onSetTonight: vi.fn(),
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

/**
 * Two fields, and that is the whole design.
 *
 * It offered four -- a target and the next three nights -- and the three were asking for
 * something a student cannot answer. Nobody knows on Saturday what they will sleep on Monday.
 * Those nights matter enormously to the model, which projects three weeks from them, but the
 * answer belongs to the student's own history rather than to a form. What the page owes them
 * instead is the ASSUMPTION the app is making, which was invisible.
 */
describe('SleepSheet', () => {
  it('asks what the student is aiming for, and what tonight is', () => {
    render(<SleepSheet {...props({ targetHours: 9, tonightHours: 6 })} />)

    expect(screen.getByTestId('sleep-target')).toHaveValue(9)
    expect(screen.getByTestId('sleep-tonight')).toHaveValue(6)
  })

  it('asks nothing about the nights after tonight', () => {
    render(<SleepSheet {...props()} />)

    expect(screen.queryAllByRole('spinbutton')).toHaveLength(2)
  })

  it('reports a typed target', async () => {
    const onSetTarget = vi.fn()
    render(<SleepSheet {...props({ onSetTarget })} />)

    await retype('sleep-target', '6')

    expect(onSetTarget).toHaveBeenLastCalledWith(6)
  })

  it('reports tonight on its own, without touching the target', async () => {
    const onSetTonight = vi.fn()
    const onSetTarget = vi.fn()
    render(<SleepSheet {...props({ onSetTonight, onSetTarget })} />)

    await retype('sleep-tonight', '5.5')

    expect(onSetTonight).toHaveBeenLastCalledWith(5.5)
    expect(onSetTarget).not.toHaveBeenCalled()
  })

  describe('a figure it cannot use', () => {
    it('says nothing upward when a field is emptied', async () => {
      const onSetTonight = vi.fn()
      render(<SleepSheet {...props({ onSetTonight })} />)

      await retype('sleep-tonight', '')

      expect(onSetTonight).not.toHaveBeenCalled()
      expect(screen.getByTestId('sleep-tonight-error')).toBeInTheDocument()
    })

    it('refuses a night longer than a day', async () => {
      const onSetTarget = vi.fn()
      render(<SleepSheet {...props({ onSetTarget })} />)

      await retype('sleep-target', '30')

      expect(onSetTarget).not.toHaveBeenCalled()
      expect(screen.getByTestId('sleep-target-error')).toBeInTheDocument()
    })

    /** Zero is a real night -- an all-nighter -- and must not be lumped in with nonsense. */
    it('accepts none at all, which is a night a student really has', async () => {
      const onSetTonight = vi.fn()
      render(<SleepSheet {...props({ onSetTonight })} />)

      await retype('sleep-tonight', '0')

      expect(onSetTonight).toHaveBeenLastCalledWith(0)
      expect(screen.queryByTestId('sleep-tonight-error')).toBeNull()
    })
  })

  it('shows what the app is assuming, when it differs from the plan', () => {
    render(
      <SleepSheet {...props({ realityLine: 'You plan 8 hours and average about 6.' })} />,
    )

    expect(screen.getByTestId('sleep-reality')).toHaveTextContent('average about 6')
  })

  /** Checked by absence, not by empty text: an element rendered with nothing in it still
   *  takes up space and is still announced by a screen reader. */
  it('renders no assumption element when there is nothing measured to say', () => {
    render(<SleepSheet {...props({ realityLine: null })} />)

    expect(screen.queryByTestId('sleep-reality')).toBeNull()
  })

  it('lists the days that will cost a night, each naming its own day', () => {
    render(
      <SleepSheet
        {...props({
          forecasts: [
            "Today's deadline will cost you about 4 hours of sleep.",
            'Tomorrow asks for about 2 hours more than the day has.',
          ],
        })}
      />,
    )

    const warnings = screen.getAllByTestId('sleep-forecast')

    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toHaveTextContent('about 4 hours')
    expect(warnings[1]).toHaveTextContent('Tomorrow')
  })

  it('renders no forecast element at all when no day costs a night', () => {
    render(<SleepSheet {...props({ forecasts: [] })} />)

    expect(screen.queryByTestId('sleep-forecast')).toBeNull()
  })
})
