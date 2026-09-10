import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DistressCard } from './DistressCard'

/**
 * The copy is the deliverable here as much as the code, so it is what gets asserted.
 *
 * These read like content tests because the failure mode is a content failure: a card that
 * diagnoses, alarms, or points at a phone number nobody verified does more harm than the
 * card not existing.
 */
describe('DistressCard', () => {
  it('reflects what the student said rather than interpreting it', () => {
    render(<DistressCard onDismiss={vi.fn()} />)

    expect(screen.getByText(/you have said you are running low/i)).toBeVisible()
  })

  /**
   * A scheduling tool knows what somebody tapped into a five-button check-in. It does not
   * know what is wrong with them, and naming a condition it cannot observe would be both
   * false and harmful.
   */
  it('names no condition and makes no diagnosis', () => {
    const { container } = render(<DistressCard onDismiss={vi.fn()} />)

    expect(container.textContent).not.toMatch(
      /depress|anxiet|anxious|mental illness|disorder|crisis|breakdown|burnout|suicid/i,
    )
  })

  /** It has to be honest that the app's usual answer is the wrong kind of help here --
   *  that is the entire reason the card exists rather than another prescription. */
  it('says plainly that rescheduling is not the answer to this', () => {
    render(<DistressCard onDismiss={vi.fn()} />)

    expect(screen.getByText(/not the thing that helps/i)).toBeVisible()
  })

  it('points to a real place to talk to somebody', () => {
    render(<DistressCard onDismiss={vi.fn()} />)

    expect(screen.getByText(/counselling service/i)).toBeVisible()
  })

  /**
   * A wrong number in a card like this is worse than no number. Until a deployment supplies
   * its own campus contact, the card points at an institution the student can find rather
   * than at digits nobody verified.
   */
  it('invents no phone number, and no service it cannot vouch for', () => {
    const { container } = render(<DistressCard onDismiss={vi.fn()} />)

    expect(container.textContent).not.toMatch(/\d{3,}/)
    expect(container.textContent).not.toMatch(/hotline|helpline/i)
  })

  /** No warning colour, no icon, no urgency: the message is that this is ordinary and
   *  there is an ordinary thing to do, and an emergency framing works against that. */
  it('does not dress itself as an emergency', () => {
    const { container } = render(<DistressCard onDismiss={vi.fn()} />)

    expect(container.querySelector('[data-tone="critical"]')).toBeNull()
    expect(container.textContent).not.toMatch(/urgent|immediately|right now|warning/i)
  })

  it('can be put away, and says so gently', () => {
    const onDismiss = vi.fn()
    render(<DistressCard onDismiss={onDismiss} />)

    expect(screen.getByTestId('distress-dismiss')).toHaveTextContent(/not now/i)
  })

  it('dismisses when asked', async () => {
    const onDismiss = vi.fn()
    render(<DistressCard onDismiss={onDismiss} />)

    await userEvent.click(screen.getByTestId('distress-dismiss'))

    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
