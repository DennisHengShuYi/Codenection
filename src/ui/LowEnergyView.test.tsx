import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LowEnergyView } from './LowEnergyView'

const renderView = (over: Partial<Parameters<typeof LowEnergyView>[0]> = {}) => {
  const props = {
    capacity: 12,
    action: 'Take twenty minutes outside',
    onAction: vi.fn(),
    onExit: vi.fn(),
    ...over,
  }

  render(<LowEnergyView {...props} />)
  return props
}

describe('LowEnergyView', () => {
  // §1.5: one number and one action. The count is the requirement, not a guideline --
  // a depleted student handed a dashboard is the failure this screen exists to prevent.
  it('shows one number and no bars', () => {
    renderView()

    expect(screen.getByTestId('capacity-value')).toHaveTextContent('12%')
    expect(screen.queryAllByRole('meter')).toHaveLength(0)
  })

  it('offers exactly one action besides the way out', () => {
    renderView()

    expect(screen.getByRole('button', { name: /twenty minutes outside/i })).toBeVisible()
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('runs the action when it is taken', async () => {
    const props = renderView()

    await userEvent.click(screen.getByRole('button', { name: /twenty minutes outside/i }))

    expect(props.onAction).toHaveBeenCalledOnce()
  })

  it('lets the student go back to the full view', async () => {
    const props = renderView()

    await userEvent.click(screen.getByRole('button', { name: /show everything/i }))

    expect(props.onExit).toHaveBeenCalledOnce()
  })

  // §1.3's gamification rule reaches the copy. This is the screen a student reaches when
  // they are least able to absorb being told what they should have done.
  it('does not scold', () => {
    renderView()

    expect(document.body.textContent).not.toMatch(/should|failed|behind|streak|missed/i)
  })
})
