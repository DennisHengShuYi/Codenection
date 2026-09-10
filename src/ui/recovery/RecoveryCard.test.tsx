import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Prescription as PrescriptionData } from '../../domain/prescribe'
import { RecoveryCard } from './RecoveryCard'

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
  render(<RecoveryCard {...props} />)
  return props
}

/**
 * §7's fix: one title, one sentence, two buttons -- no menu underneath, and "Not today" is a
 * way out rather than a second thing to decide.
 */
describe('RecoveryCard', () => {
  it('shows the one action as its title', () => {
    setup()

    expect(screen.getByTestId('recovery-card')).toHaveTextContent(/message someone/i)
  })

  // Sized to the real gap, so the student can tell whether they have time for it.
  it('says how long it would take, in one sentence', () => {
    setup()

    expect(screen.getByTestId('recovery-card').textContent).toMatch(/2\s*h|2 hours/i)
  })

  it('says "1 hour" rather than "1 hours" for a single hour', () => {
    setup(prescription({ hours: 1 }))

    expect(screen.getByTestId('recovery-card').textContent).toMatch(/1 hour(?!s)/i)
  })

  it('formats a fractional gap in hours rather than rounding it away', () => {
    setup(prescription({ hours: 1.5 }))

    expect(screen.getByTestId('recovery-card').textContent).toMatch(/1\.5\s*h/i)
  })

  it('hands the prescription back when accepted', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /put it in my week/i }))

    expect(props.onAccept).toHaveBeenCalledOnce()
    expect(props.onAccept).toHaveBeenCalledWith(prescription())
  })

  /**
   * "Not today" is a way out, not a report. It no longer needs a reason and no longer feeds
   * anything durable -- that is the point of this task.
   */
  it('dismisses for the day when "Not today" is pressed', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /not today/i }))

    expect(props.onDismiss).toHaveBeenCalledOnce()
  })

  it('renders nothing when there is nothing to suggest', () => {
    const { container } = render(
      <RecoveryCard prescription={null} onAccept={vi.fn()} onDismiss={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('has exactly one title and two buttons -- no menu underneath', () => {
    setup()

    expect(screen.getAllByRole('heading')).toHaveLength(1)
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  /**
   * The contradiction this task exists to remove: a card whose premise is "never a menu"
   * must not itself contain one.
   */
  it('offers no list of options', () => {
    setup()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })
})
