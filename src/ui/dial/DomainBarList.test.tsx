import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DomainBarList } from './DomainBarList'
import type { DomainBar } from './domainBars'

const bar = (over: Partial<DomainBar> = {}): DomainBar => ({
  key: 'mental',
  label: 'Study & thinking',
  value: 70,
  ceiling: 100,
  status: 'healthy',
  span: 'now',
  trend: 'flat',
  warning: null,
  ...over,
})

describe('DomainBarList', () => {
  it('renders one row per bar', () => {
    render(<DomainBarList bars={[bar(), bar({ key: 'social', label: 'People' })]} />)

    expect(screen.getAllByRole('meter')).toHaveLength(2)
  })

  // A screen reader user should get from the announcement what a sighted user gets from
  // the bar's length.
  it('announces each bar with its name, value and maximum', () => {
    render(<DomainBarList bars={[bar()]} />)

    const meter = screen.getByRole('meter', { name: /study/i })
    expect(meter).toHaveAttribute('aria-valuenow', '70')
    expect(meter).toHaveAttribute('aria-valuemax', '100')
  })

  // §1.5: severity is never carried by colour alone -- it is paired with a glyph and a
  // word, so it survives greyscale, colour blindness and a screen reader alike.
  it('shows a trend glyph beside every bar', () => {
    render(<DomainBarList bars={[bar({ trend: 'falling' })]} />)

    expect(screen.getByTestId('trend-mental')).toHaveTextContent('▼')
  })

  it('spells the trend out in words for assistive technology', () => {
    render(<DomainBarList bars={[bar({ trend: 'rising' })]} />)

    expect(screen.getByTestId('trend-mental')).toHaveAccessibleName(/rising/i)
  })

  it('shows a warning when one is present', () => {
    render(
      <DomainBarList
        bars={[
          bar({
            key: 'social',
            label: 'People',
            status: 'critical',
            warning: 'You have been spending a lot of time alone.',
          }),
        ]}
      />,
    )

    expect(screen.getByText(/time alone/i)).toBeVisible()
  })

  // A warning on a healthy bar would train the student to ignore all of them.
  it('shows no warning text when the bar is healthy', () => {
    render(<DomainBarList bars={[bar()]} />)

    expect(screen.queryByTestId('warning-mental')).toBeNull()
  })
})

/**
 * §1.5: the arrow is a reading, so a bar without one draws nothing.
 *
 * `role="img"` with an `aria-label` is announced, so a hard-coded direction is not a
 * harmless default -- it is a spoken claim about a number nobody measured. The density bar
 * is the one in this position: nothing projects how packed a future day will be.
 */
describe('a bar with no measured direction', () => {
  it('draws no arrow at all', () => {
    render(<DomainBarList bars={[bar({ key: 'schedule', trend: null })]} />)

    expect(screen.queryByTestId('trend-schedule')).toBeNull()
  })

  it('says nothing about a direction to a screen reader either', () => {
    render(<DomainBarList bars={[bar({ key: 'schedule', trend: null })]} />)

    expect(screen.queryByLabelText(/steady|rising|falling/i)).toBeNull()
  })

  it('still draws the bar, its value and its meter', () => {
    render(<DomainBarList bars={[bar({ key: 'schedule', value: 72, trend: null })]} />)

    expect(screen.getByRole('meter')).toBeInTheDocument()
    expect(screen.getByText('72')).toBeVisible()
  })

  it('leaves the arrow on a bar that has one', () => {
    render(<DomainBarList bars={[bar({ key: 'mental', trend: 'falling' })]} />)

    expect(screen.getByTestId('trend-mental')).toHaveAttribute('aria-label', 'falling')
  })
})

/**
 * Four bars are a snapshot and the fifth is a fortnight, so the list says which is which.
 *
 * Said once per group rather than once per row: the four reserve bars share a span, and
 * repeating it four times is noise of exactly the kind the panel's intro sentence already
 * avoids. The heading appears where the span changes, which is a real boundary in the data
 * rather than a decoration.
 */
describe('the stretch of time each group covers', () => {
  const reserveBar = (over: Partial<DomainBar> = {}) => bar({ span: 'now', ...over })
  const densityBar = () =>
    bar({ key: 'schedule', label: 'How packed the days are', span: 'horizon', trend: null })

  it('heads the reserve bars with when the reading was taken', () => {
    render(<DomainBarList bars={[reserveBar(), densityBar()]} />)

    expect(screen.getByTestId('span-now')).toBeVisible()
  })

  it('heads the horizon bar with the stretch it measures', () => {
    render(<DomainBarList bars={[reserveBar(), densityBar()]} />)

    expect(screen.getByTestId('span-horizon')).toHaveTextContent(/21 days/i)
  })

  it('says each span once, however many bars share it', () => {
    render(
      <DomainBarList
        bars={[reserveBar(), reserveBar({ key: 'social', label: 'People' }), densityBar()]}
      />,
    )

    expect(screen.getAllByTestId('span-now')).toHaveLength(1)
  })

  it('puts the heading above the bars it describes', () => {
    render(<DomainBarList bars={[reserveBar(), densityBar()]} />)

    const heading = screen.getByTestId('span-horizon')
    const meter = screen.getByRole('meter', { name: 'How packed the days are' })

    expect(
      Boolean(heading.compareDocumentPosition(meter) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true)
  })
})
