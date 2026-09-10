import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ParsedItem } from '../../ai'
import { ACTIVITY_KINDS } from '../../engine'
import { ItemChip } from './ItemChip'

const item = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  id: 'a',
  title: 'WIA3001 essay',
  type: 'mental',
  kind: 'studyBlock',
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

  /**
   * The gym bug: a parse cannot always tell a hard session from a walk, and the wrong kind
   * silently flips whether the engine believes the next study block was helped or hurt.
   * §3.2 requires this to be correctable with one tap, the same as type.
   */
  it('lets the kind be corrected', async () => {
    const props = setup({ type: 'physical', kind: 'lightExercise' })

    await userEvent.selectOptions(screen.getByLabelText(/detail/i), 'hardExercise')

    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'hardExercise' }))
  })

  /**
   * `sleep` is an `ActivityKind` the engine understands but that no scheduled item may
   * carry: `engine/reachable.test.ts` records it as intentionally absent from every
   * producer -- "Enters through Schedule.sleepByDay, never as a scheduled activity."
   * Offering it in this select was the one place a student could put it on a block anyway,
   * and `drain.ts` then treats that block as costing nothing, while `sleepByDay` counts the
   * same hours a second time.
   */
  it('does not offer sleep as something a block can be', async () => {
    setup()

    const detail = screen.getByLabelText(/detail/i)

    expect(within(detail).queryByRole('option', { name: /sleep/i })).toBeNull()
    // The rest of the list is untouched -- this is one option removed, not a shorter menu.
    expect(within(detail).getAllByRole('option')).toHaveLength(ACTIVITY_KINDS.length - 1)
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
