import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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

  // Ruling 23: `blockToAsk` can select a block scheduled for later today, so the copy must
  // not assert the block already happened.
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
