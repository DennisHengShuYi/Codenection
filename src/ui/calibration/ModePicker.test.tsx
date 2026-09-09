import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROFILE } from '../../domain/calibration'
import { ModePicker } from './ModePicker'

const setup = (profile = DEFAULT_PROFILE) => {
  const props = { profile, onChange: vi.fn() }
  render(<ModePicker {...props} />)
  return props
}

/**
 * §7.1: one screen, four taps, sets every prior. And §7's governing constraint -- never ask
 * the user to enter, only to correct -- so it opens with an answer already selected rather
 * than as an empty form.
 */
describe('ModePicker', () => {
  it('offers the four modes on one screen', () => {
    setup()

    expect(screen.getAllByTestId(/^mode-/)).toHaveLength(4)
  })

  it('opens with the current answer already chosen, not empty', () => {
    setup()

    expect(screen.getByTestId(`mode-${DEFAULT_PROFILE.mode}`)).toBeChecked()
  })

  it('changes the mode in one tap', async () => {
    const props = setup()

    await userEvent.click(screen.getByTestId('mode-working'))

    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'working', modeChosen: true }),
    )
  })

  // §7.1: semester break is a toggle on top of mode, not a fifth option.
  it('offers semester break as a toggle rather than a fifth mode', async () => {
    const props = setup()

    expect(screen.getAllByTestId(/^mode-/)).toHaveLength(4)

    await userEvent.click(screen.getByLabelText(/semester break/i))

    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ semesterBreak: true }))
  })

  it('keeps the mode when the break is toggled', async () => {
    const props = setup({ ...DEFAULT_PROFILE, mode: 'both' })

    await userEvent.click(screen.getByLabelText(/semester break/i))

    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ mode: 'both' }))
  })

  // §7.5: relative, not absolute. A bucket, never a typed number.
  it('asks how long before you drift, in buckets rather than hours', async () => {
    const props = setup()

    await userEvent.click(screen.getByTestId('focus-couple'))

    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ focus: 'couple' }))
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('says what each mode watches for, so the choice means something', () => {
    setup()

    expect(screen.getByTestId('calibration-modes').textContent).toMatch(/deadline|drift|collision|drain/i)
  })
})
