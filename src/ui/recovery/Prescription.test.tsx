import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Prescription as PrescriptionData } from '../../domain/prescribe'
import { Prescription } from './Prescription'

const prescription = (over: Partial<PrescriptionData> = {}): PrescriptionData => ({
  id: 'prescription-socialRestorative',
  type: 'social',
  kind: 'socialRestorative',
  title: 'Message someone you like and see them',
  hours: 2,
  dayIndex: 0,
  startHour: 16,
  ...over,
})

const setup = (data: PrescriptionData | null = prescription()) => {
  const props = { prescription: data, onAccept: vi.fn(), onDismiss: vi.fn() }
  render(<Prescription {...props} />)
  return props
}

/**
 * §5.2: one option, never a menu. A depleted person cannot choose from a list, and every
 * extra option lowers the odds of any action at all -- so this component's job is to offer
 * one thing and get out of the way.
 */
describe('Prescription', () => {
  it('shows the one action', () => {
    setup()

    expect(screen.getByTestId('prescription')).toHaveTextContent(/message someone/i)
  })

  // Sized to the real gap, so the student can tell whether they have time for it.
  it('says how long it would take', () => {
    setup()

    expect(screen.getByTestId('prescription').textContent).toMatch(/2\s*h|2 hours/i)
  })

  it('hands the prescription back when accepted', () => {
    const props = setup()

    return userEvent
      .click(screen.getByRole('button', { name: /put it in my week/i }))
      .then(() => expect(props.onAccept).toHaveBeenCalledOnce())
  })

  /**
   * Dismissing is what feeds the failed-recovery log. If it were silent the log would never
   * learn anything and the app would suggest the same useless thing forever -- which is
   * exactly what §5.2's last line exists to prevent.
   */
  it('reports that it did not help when dismissed', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /does not help|did not help/i }))

    expect(props.onDismiss).toHaveBeenCalledOnce()
  })

  it('renders nothing when there is nothing to suggest', () => {
    const { container } = render(
      <Prescription prescription={null} onAccept={vi.fn()} onDismiss={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  /**
   * Exactly one *action*. Dismissing is not a second thing to do -- it is a way out -- so a
   * count of the buttons that put something in the week must be one.
   */
  it('offers exactly one thing to actually do', () => {
    setup()

    expect(screen.getAllByRole('button', { name: /put it in my week/i })).toHaveLength(1)
  })
})
