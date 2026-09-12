import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SleepSheet } from './SleepSheet'

const props = (over: Partial<Parameters<typeof SleepSheet>[0]> = {}) => ({
  targetHours: 8,
  tonightHours: 8,
  realityLine: null,
  enoughLine: null,
  forecasts: [],
  wakeHour: 7,
  tonightWindow: '23:00 → 07:00',
  onSetWakeHour: vi.fn(),
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

  /**
   * When the night happens, not only how long it is.
   *
   * A night is drawn on the week now, and a drawing needs a clock. Anchored on waking because
   * the morning is the fixed end of a night -- somebody gets up for a nine o'clock class
   * whatever time they got to bed -- so bedtime is what moves when a day runs long.
   *
   * A picker rather than a typed field: a clock hour is one of twenty-four, which is the same
   * question the edit form already answers with a `select`. Nothing new to validate.
   */
  describe('when the night happens', () => {
    it('offers the hour the student gets up', () => {
      render(<SleepSheet {...props({ wakeHour: 6 })} />)

      expect(screen.getByTestId('sleep-wake')).toHaveValue('6')
    })

    it('reports a new wake hour', async () => {
      const onSetWakeHour = vi.fn()
      render(<SleepSheet {...props({ onSetWakeHour })} />)

      await userEvent.selectOptions(screen.getByTestId('sleep-wake'), '9')

      expect(onSetWakeHour).toHaveBeenCalledWith(9)
    })

    /** The window itself, counted back from waking by the app rather than by this component --
     *  it is handed the words, the way every other figure on this page is. */
    it('shows the window tonight actually covers', () => {
      render(<SleepSheet {...props({ tonightWindow: '01:00 → 07:00' })} />)

      expect(screen.getByTestId('sleep-window')).toHaveTextContent('01:00 → 07:00')
    })
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

  /**
   * What this student's own nights say about how much sleep is enough for them.
   *
   * A second, separate sentence rather than more words on `realityLine`: that one compares
   * the plan with what happened, and this one is a claim about the student. Merging them
   * would make one sentence that goes quiet whenever either half has nothing to say.
   */
  describe('how much sleep is enough for this student', () => {
    it('shows the figure the app has learned', () => {
      render(
        <SleepSheet
          {...props({ enoughLine: 'Your own nights suggest about 7 hours is enough for you.' })}
        />,
      )

      expect(screen.getByTestId('sleep-enough')).toHaveTextContent('about 7 hours')
    })

    /** Absence again, and for the reason above it: an empty element still takes space and is
     *  still announced. */
    it('renders no element at all while nothing has been measured', () => {
      render(<SleepSheet {...props({ enoughLine: null })} />)

      expect(screen.queryByTestId('sleep-enough')).toBeNull()
    })

    /**
     * Under the target field, not above it. Above, it colours the figure being chosen rather
     * than informing it -- the reason `realityLine` already sits where it does, asserted here
     * rather than trusted to survive a future reshuffle of the sheet.
     */
    it('sits below the target field', () => {
      render(
        <SleepSheet {...props({ enoughLine: 'Your own nights suggest about 7 hours is enough.' })} />,
      )

      const target = screen.getByTestId('sleep-target')
      const enough = screen.getByTestId('sleep-enough')

      expect(target.compareDocumentPosition(enough)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })
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
