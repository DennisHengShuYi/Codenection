import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('is a real button that fires on click', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Rebalance</Button>)

    await userEvent.click(screen.getByRole('button', { name: 'Rebalance' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('defaults to the primary variant', () => {
    render(<Button>Go</Button>)

    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'primary')
  })

  it('carries the variant and size it is given', () => {
    render(
      <Button variant="quiet" size="sm">
        Not today
      </Button>,
    )

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('data-variant', 'quiet')
    expect(button).toHaveAttribute('data-size', 'sm')
  })

  it('passes through disabled', () => {
    render(<Button disabled>Working…</Button>)

    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('defaults type to button, so it never submits a form by accident', () => {
    render(<Button>Go</Button>)

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })
})
