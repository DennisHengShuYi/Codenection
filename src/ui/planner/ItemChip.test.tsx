import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ParsedItem } from '../../ai'
import { ItemChip } from './ItemChip'

const item = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  id: 'a',
  title: 'WIA3001 essay',
  type: 'mental',
  hours: 4,
  deadlineDay: 5,
  hard: true,
  confident: true,
  ...over,
})

const setup = (over: Partial<ParsedItem> = {}) => {
  const props = { item: item(over), onChange: vi.fn(), onRemove: vi.fn() }
  render(<ItemChip {...props} />)
  return props
}

/**
 * §3.2: what was understood can be retyped, recategorised or deleted with one tap. The
 * chip is a gate, not a preview, so everything it shows has to be correctable.
 */
describe('ItemChip', () => {
  it('shows what was understood, rather than a summary of it', () => {
    setup()

    expect(screen.getByDisplayValue('WIA3001 essay')).toBeVisible()
  })

  it('lets the title be retyped', async () => {
    const props = setup()

    await userEvent.type(screen.getByLabelText(/what/i), '!')

    expect(props.onChange).toHaveBeenCalled()
  })

  // The correction most likely to be needed: the load type is the parser's most frequent
  // guess, and it is what the engine actually reasons in.
  it('lets the load type be changed', async () => {
    const props = setup()

    await userEvent.selectOptions(screen.getByLabelText(/kind/i), 'physical')

    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'physical' }))
  })

  it('lets the effort be corrected', async () => {
    const props = setup()

    await userEvent.clear(screen.getByLabelText(/hours/i))

    expect(props.onChange).toHaveBeenCalled()
  })

  it('lets the item be removed', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /remove/i }))

    expect(props.onRemove).toHaveBeenCalledWith('a')
  })

  /**
   * §1.4: low-confidence rows are flagged rather than silently guessed. Both directions
   * are asserted, because a flag that is always on carries no information.
   */
  it('flags an item it was unsure about', () => {
    setup({ confident: false })

    expect(screen.getByTestId('unsure-a')).toBeVisible()
  })

  it('does not flag one it read confidently', () => {
    setup({ confident: true })

    expect(screen.queryByTestId('unsure-a')).toBeNull()
  })
})
