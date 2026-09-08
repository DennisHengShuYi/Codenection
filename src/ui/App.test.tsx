import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('renders the app shell', () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Codenection')
  })

  // §0: no cold start. Every screen renders something useful with zero user data, so the
  // first thing a new user sees must be a real figure rather than a dash or a spinner.
  it('shows a capacity figure before the user has entered anything', () => {
    render(<App />)

    expect(screen.getByTestId('capacity-value')).toHaveTextContent(/^\d{1,3}%$/)
    expect(screen.getByTestId('worst-day-value')).toHaveTextContent(/^\d{1,3}$/)
  })

  // §1.5: the text equivalent is a primary view, not a fallback, and it has to carry the
  // same information the number does.
  it('states the same figures in words', () => {
    render(<App />)

    const summary = screen.getByTestId('reserve-text-equivalent')
    const capacity = screen.getByTestId('capacity-value').textContent ?? ''

    expect(summary).toHaveTextContent(/capacity/i)
    expect(summary.textContent).toContain(capacity.replace('%', ''))
  })

  it('says nothing about a rebalance until one is asked for', () => {
    render(<App />)

    expect(screen.queryByTestId('rebalance-report')).toBeNull()
  })

  it('reports what the rebalance changed, in specifics', async () => {
    render(<App />)

    await userEvent.click(screen.getByTestId('rebalance'))

    const report = screen.getByTestId('rebalance-report')
    expect(report.textContent?.length ?? 0).toBeGreaterThan(0)
    // §2.1: never "optimised", always what actually moved.
    expect(report).not.toHaveTextContent(/optimis|optimiz/i)
  })
})
