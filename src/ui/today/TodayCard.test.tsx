import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TodayCard } from './TodayCard'


const setup = (overrides: Partial<Parameters<typeof TodayCard>[0]> = {}) => {
  const props = {
    askEnergy: true,
    askSleep: true,
    onEnergy: vi.fn(),
    onSleep: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  }
  const view = render(<TodayCard {...props} />)
  return { props, view }
}

/**
 * §8: one card, three taps, once a day. Replaces the design that asked two questions about
 * every block -- four blocks meant eight taps, which is why it would never have happened.
 */
describe('TodayCard', () => {
  it('offers the five energy bands, reporting §8.1s fixed values', async () => {
    const { props } = setup()

    expect(screen.getByTestId('energy-10')).toBeInTheDocument()
    expect(screen.getByTestId('energy-30')).toBeInTheDocument()
    expect(screen.getByTestId('energy-50')).toBeInTheDocument()
    expect(screen.getByTestId('energy-70')).toBeInTheDocument()
    expect(screen.getByTestId('energy-90')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('energy-30'))
    expect(props.onEnergy).toHaveBeenCalledWith(30)
  })

  /** Five since Ruling 67. A short night costs reserve now, so the top bucket could not stop
   *  at 8.5: the recovery night after a bad week is the one most worth recording, and there
   *  was no way to report it. */
  it('offers the five sleep buckets, reporting the bucket key', async () => {
    const { props } = setup()

    expect(screen.getByTestId('sleep-under5')).toHaveTextContent(/under 5/i)
    expect(screen.getByTestId('sleep-six')).toHaveTextContent('6')
    expect(screen.getByTestId('sleep-seven')).toHaveTextContent('7')
    expect(screen.getByTestId('sleep-eightPlus')).toHaveTextContent('8')
    expect(screen.getByTestId('sleep-tenPlus')).toHaveTextContent(/10\+/)

    await userEvent.click(screen.getByTestId('sleep-seven'))
    expect(props.onSleep).toHaveBeenCalledWith('seven')
  })




  // Brief's "the copy never scolds" item. Kept as a real check rather than a tautology: this
  // regex would genuinely fail against copy like "you should have started this".
  it('never scolds or blames', () => {
    setup()

    const card = screen.getByRole('region')
    expect(card.textContent).not.toMatch(/should have|failed|you didn'?t|you missed/i)
  })



  it('returns null once every row is answered', () => {
    const { view } = setup({ askEnergy: false, askSleep: false })

    expect(view.container).toBeEmptyDOMElement()
  })

  // §7.9: a prompt nobody can escape is one they learn to dread.
  it('can be dismissed with a quiet "Not now"', async () => {
    const { props } = setup()

    const dismiss = screen.getByRole('button', { name: /not now/i })
    expect(dismiss.getAttribute('data-variant')).toBe('quiet')

    await userEvent.click(dismiss)
    expect(props.onDismiss).toHaveBeenCalledOnce()
  })
})


/**
 * §7.6's Reality Check line moved with the question it annotates.
 *
 * It read "you underestimate study and writing by 1.7x" beside the block being asked about,
 * and there is no block being asked about here any more -- the waiting list asks, and the
 * line is drawn under the answers there. A bias quoted beside a question about last night's
 * sleep would be a claim about something else entirely.
 */

/**
 * §7.6's Reality Check, for sleep.
 *
 * Beside the question it is about, which is why it lives here as well as on the sleep page:
 * a student answering "how much sleep last night?" is the one moment they are thinking about
 * the gap between what they aim for and what they get.
 */
describe('TodayCard and the sleep reality line', () => {
  it('shows the line when there is something measured to say', () => {
    render(
      <TodayCard
        askEnergy={false}
        askSleep
        sleepRealityLine="You plan 8 hours and average about 6."
        onEnergy={vi.fn()}
        onSleep={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByTestId('sleep-reality-line')).toHaveTextContent('average about 6')
  })

  /** Absence, not empty text: an element rendered with nothing in it still takes up space
   *  and is still announced. */
  it('renders no element at all when there is nothing measured', () => {
    render(
      <TodayCard
        askEnergy={false}
        askSleep
        onEnergy={vi.fn()}
        onSleep={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('sleep-reality-line')).toBeNull()
  })

  /**
   * Under the four buckets, never above them.
   *
   * The same rule the estimate-bias line follows, and for its stated reason: Ruling 22 keeps
   * the answer buttons visually equal so the card does not steer the answer, and a line about
   * the student's own shortfall sitting above them would undo exactly that.
   */
  it('sits below the buckets rather than above them', () => {
    const { container } = render(
      <TodayCard
        askEnergy={false}
        askSleep
        sleepRealityLine="You plan 8 hours and average about 6."
        onEnergy={vi.fn()}
        onSleep={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    const html = container.innerHTML

    expect(html.indexOf('sleep-eightPlus')).toBeLessThan(html.indexOf('sleep-reality-line'))
  })
})

/**
 * A confirmation, not a bare question.
 *
 * It asked "how much sleep last night?" with nothing behind it. Naming what was planned makes
 * the answer worth more: §7.6's Reality Check compares plan against outcome, and a figure with
 * no plan beside it is only half of that comparison. It also puts the two numbers in front of
 * the student at the moment they are thinking about the gap.
 */
describe('TodayCard and confirming last night', () => {
  const card = (over: Record<string, unknown> = {}) =>
    render(
      <TodayCard
        askEnergy={false}
        askSleep
        onEnergy={vi.fn()}
        onSleep={vi.fn()}
        onDismiss={vi.fn()}
        {...over}
      />,
    )

  it('names what was planned for the night it is asking about', () => {
    card({ plannedLastNight: 8 })

    expect(screen.getByTestId('sleep-question')).toHaveTextContent('8')
    expect(screen.getByTestId('sleep-question')).toHaveTextContent(/last night/i)
  })

  /**
   * Falls back to the plain question where there is no plan to name -- the fortnight's first
   * morning, whose night began before the week the app holds. Asking about it is still worth
   * doing, because `domain/sleepLog` can record it; claiming a plan for it is not.
   */
  it('still asks plainly when there was no plan for that night', () => {
    card({ plannedLastNight: null })

    expect(screen.getByTestId('sleep-question')).toHaveTextContent(/last night/i)
    expect(screen.getByTestId('sleep-question')).not.toHaveTextContent(/planned/i)
  })

  /** §8.2: the copy states and never scolds. This is the line most likely to drift, because
   *  it sits beside a number the student has probably missed. */
  it('does not reproach the student for missing it', () => {
    card({ plannedLastNight: 8 })

    const asked = screen.getByTestId('sleep-question').textContent?.toLowerCase() ?? ''

    for (const word of ['should', 'need to', 'must', 'try to', 'only', 'fail']) {
      expect(asked).not.toContain(word)
    }
  })
})
