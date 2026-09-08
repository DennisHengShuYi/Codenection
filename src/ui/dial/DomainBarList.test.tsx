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
