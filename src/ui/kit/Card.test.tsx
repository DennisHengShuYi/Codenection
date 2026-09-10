import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card } from './Card'

describe('Card', () => {
  it('renders its children', () => {
    render(<Card>Two things have lapsed</Card>)

    expect(screen.getByText('Two things have lapsed')).toBeInTheDocument()
  })

  it('has no tone by default', () => {
    render(<Card data-testid="card">plain</Card>)

    expect(screen.getByTestId('card')).toHaveAttribute('data-tone', 'none')
  })

  it('carries the tone it is given', () => {
    render(
      <Card tone="attention" data-testid="card">
        needs you
      </Card>,
    )

    expect(screen.getByTestId('card')).toHaveAttribute('data-tone', 'attention')
  })
})
