import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BlockOutcome } from '../../domain/calibration'
import type { ScheduledItem } from '../../optimizer'
import { TodayCard } from './TodayCard'

const block: ScheduledItem = {
  id: 'essay',
  title: 'Essay draft',
  type: 'mental',
  kind: 'studyBlock',
  hours: 3,
  intensity: 1,
  dayIndex: 0,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
}

const setup = (overrides: Partial<Parameters<typeof TodayCard>[0]> = {}) => {
  const props = {
    block,
    askEnergy: true,
    askSleep: true,
    onEnergy: vi.fn(),
    onSleep: vi.fn(),
    onBlock: vi.fn(),
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

  it('offers the four sleep buckets, reporting the bucket key', async () => {
    const { props } = setup()

    expect(screen.getByTestId('sleep-under5')).toHaveTextContent(/under 5/i)
    expect(screen.getByTestId('sleep-six')).toHaveTextContent('6')
    expect(screen.getByTestId('sleep-seven')).toHaveTextContent('7')
    expect(screen.getByTestId('sleep-eightPlus')).toHaveTextContent(/8\+/)

    await userEvent.click(screen.getByTestId('sleep-seven'))
    expect(props.onSleep).toHaveBeenCalledWith('seven')
  })

  it('names the block and its planned hours, and reports the answer', async () => {
    const { props } = setup()

    expect(screen.getByText(/essay draft/i)).toBeInTheDocument()
    expect(screen.getByText(/3h/)).toBeInTheDocument()

    expect(screen.getByTestId('answer-didnt')).toHaveTextContent(/didn't happen/i)
    expect(screen.getByTestId('answer-less')).toHaveTextContent(/took less/i)
    expect(screen.getByTestId('answer-right')).toHaveTextContent(/about right/i)
    expect(screen.getByTestId('answer-longer')).toHaveTextContent(/took longer/i)

    await userEvent.click(screen.getByTestId('answer-longer'))
    expect(props.onBlock).toHaveBeenCalledWith('essay', 'longer')
  })

  // Ruling 22: the four answers must read as equal weight -- no primary variant. They feed
  // the estimate bias the app's accuracy figure is measured against, so making one primary
  // would nudge reporting toward it and skew the measurement.
  it('gives the four block answers equal visual weight, with no primary variant', () => {
    setup()

    const answers = ['didnt', 'less', 'right', 'longer'].map((answer) =>
      screen.getByTestId(`answer-${answer}`),
    )

    for (const button of answers) {
      expect(button.getAttribute('data-variant')).not.toBe('primary')
    }

    const variants = new Set(answers.map((button) => button.getAttribute('data-variant')))
    expect(variants.size).toBe(1)
  })

  // Ruling 23/36: `blockToAsk` no longer selects an unfinished block on today, so this is
  // no longer guarding against ITS output. It guards this component's own contract instead
  // -- `block` is whatever the caller hands over, and nothing here can verify it ended.
  it('does not assert the block has finished', () => {
    setup()

    const card = screen.getByRole('region')
    expect(card.textContent).not.toMatch(/how did it go/i)
    expect(card.textContent).not.toMatch(/finished/i)
  })

  // Brief's "the copy never scolds" item. Kept as a real check rather than a tautology: this
  // regex would genuinely fail against copy like "you should have started this".
  it('never scolds or blames', () => {
    setup()

    const card = screen.getByRole('region')
    expect(card.textContent).not.toMatch(/should have|failed|you didn'?t|you missed/i)
  })

  it('does not render a row that has already been answered', () => {
    setup({ askEnergy: false })

    expect(screen.queryByTestId('energy-10')).toBeNull()
    expect(screen.getByTestId('sleep-seven')).toBeInTheDocument()
    expect(screen.getByText(/essay draft/i)).toBeInTheDocument()
  })

  it('does not render the block row when there is no block to ask about', () => {
    setup({ block: null })

    expect(screen.queryByTestId('answer-right')).toBeNull()
  })

  it('returns null once every row is answered', () => {
    const { view } = setup({ askEnergy: false, askSleep: false, block: null })

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
 * §7.6/§2.4's Reality Check line, which was written and tested and then rendered by
 * nothing at all.
 *
 * It belongs here rather than on a screen of its own: this is the moment the student is
 * being asked how long a block actually took, so it is the moment "you underestimate this
 * by 1.4x, and we already pad it" answers a question they are actually having.
 */
describe('TodayCard reality check', () => {
  const overran = (n: number): BlockOutcome[] =>
    Array.from({ length: n }, (_, index) => ({
      blockId: `mental-${index}`,
      type: 'mental' as const,
      plannedHours: 2,
      actualHours: 3,
    }))

  it('tells the student what they underestimate, beside the block it padded', () => {
    setup({ outcomes: overran(3) })

    expect(screen.getByTestId('bias-line')).toHaveTextContent(
      'You underestimate study and writing by about 1.5×. We pad it automatically.',
    )
  })

  /** §7.6: a screen claiming a bias nobody measured is worse than a screen with fewer
   *  lines. Below `MIN_SAMPLES` there is no measurement, so there is no sentence. */
  it('says nothing when there is not enough history to measure a bias', () => {
    setup({ outcomes: overran(2) })

    expect(screen.queryByTestId('bias-line')).not.toBeInTheDocument()
  })

  it('says nothing when the student estimates accurately', () => {
    const accurate: BlockOutcome[] = Array.from({ length: 4 }, (_, index) => ({
      blockId: `accurate-${index}`,
      type: 'mental',
      plannedHours: 2,
      actualHours: 2,
    }))

    setup({ outcomes: accurate })

    expect(screen.queryByTestId('bias-line')).not.toBeInTheDocument()
  })

  /** The line has to be about the block on the card, not whichever type happens to have
   *  the most history -- otherwise it reports a bias the student cannot connect to
   *  anything in front of them. */
  it('reports the bias for the block being asked about, not another load type', () => {
    const errands: BlockOutcome[] = Array.from({ length: 4 }, (_, index) => ({
      blockId: `errands-${index}`,
      type: 'errands',
      plannedHours: 1,
      actualHours: 3,
    }))

    setup({ outcomes: [...errands, ...overran(3)] })

    expect(screen.getByTestId('bias-line')).toHaveTextContent('study and writing')
  })

  /** No block on the card means nothing was padded, so there is nothing to explain. */
  it('says nothing when there is no block to ask about', () => {
    setup({ block: null, outcomes: overran(3) })

    expect(screen.queryByTestId('bias-line')).not.toBeInTheDocument()
  })

  /** §0's no-cold-start rule reaches this line too: a student on day one has no history,
   *  and the card must still render. */
  it('renders normally when no outcomes are supplied at all', () => {
    setup()

    expect(screen.queryByTestId('bias-line')).not.toBeInTheDocument()
    expect(screen.getByTestId('answer-right')).toBeInTheDocument()
  })
})

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
        block={null}
        askEnergy={false}
        askSleep
        sleepRealityLine="You plan 8 hours and average about 6."
        onEnergy={vi.fn()}
        onSleep={vi.fn()}
        onBlock={vi.fn()}
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
        block={null}
        askEnergy={false}
        askSleep
        onEnergy={vi.fn()}
        onSleep={vi.fn()}
        onBlock={vi.fn()}
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
        block={null}
        askEnergy={false}
        askSleep
        sleepRealityLine="You plan 8 hours and average about 6."
        onEnergy={vi.fn()}
        onSleep={vi.fn()}
        onBlock={vi.fn()}
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
        block={null}
        askEnergy={false}
        askSleep
        onEnergy={vi.fn()}
        onSleep={vi.fn()}
        onBlock={vi.fn()}
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
