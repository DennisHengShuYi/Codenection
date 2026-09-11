import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BlockSheetModel } from './blockActions'
import { BlockSheet } from './BlockSheet'

const model = (over: Partial<BlockSheetModel> = {}): BlockSheetModel => ({
  item: {
    id: 'essay',
    title: 'Essay draft',
    type: 'mental',
    kind: 'studyBlock',
    hours: 3,
    intensity: 1,
    dayIndex: 5,
    startHour: 20,
    fixed: false,
    deadlineDay: null,
    protectedRest: false,
  },
  actions: ['later', 'microStart'],
  recordedAnswer: null,
  ...over,
})

const setup = (over: Partial<BlockSheetModel> = {}) => {
  const handlers = {
    onClose: vi.fn(),
    onBack: vi.fn(),
    onLater: vi.fn(),
    onConfirm: vi.fn(),
    onRested: vi.fn(),
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    onMicroStart: vi.fn(),
  }
  render(<BlockSheet model={model(over)} {...handlers} />)
  return handlers
}

describe('BlockSheet', () => {
  it('is named by the block', () => {
    setup()

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Essay draft')
  })

  it('says when the block is and how long it runs', () => {
    setup()

    expect(screen.getByTestId('block-when')).toHaveTextContent('20:00')
    expect(screen.getByTestId('block-when')).toHaveTextContent('3')
  })

  /** `done` is gone from the model: it called `completeItem`, which deletes the block --
   *  the same thing Remove does, without the confirmation or the name. */
  it('offers no Done, which was a delete wearing another word', () => {
    setup()

    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
  })

  it('offers nothing it was not given', () => {
    setup({ actions: ['edit'] })

    expect(screen.queryByRole('button', { name: 'Later' })).not.toBeInTheDocument()
  })

  it('asks a past block how it went, in one four-way answer', async () => {
    const { onConfirm } = setup({ actions: ['confirm'] })

    await userEvent.click(screen.getByTestId('answer-longer'))

    expect(onConfirm).toHaveBeenCalledWith('essay', 'longer')
  })

  /**
   * Three, not four. "Didn't happen" sat one row above Remove doing the same job, so the
   * question narrowed to the one thing Reality Check reads: how long it took. The answer
   * itself still exists -- the today card and the bot both write it, and `softDeadlines`
   * depends on it to stop a skipped rest satisfying the rest rhythm.
   */
  it('labels the three confirm answers in the student-facing words', () => {
    setup({ actions: ['confirm'] })

    expect(screen.getByTestId('answer-less')).toHaveTextContent('Took less')
    expect(screen.getByTestId('answer-right')).toHaveTextContent('About right')
    expect(screen.getByTestId('answer-longer')).toHaveTextContent('Took longer')
    expect(screen.queryByTestId('answer-didnt')).toBeNull()
  })

  /** They report on the past; Micro start, Edit and Remove change the plan. Mixed into one
   *  wrapped row a student picked "Edit" out of a line that began "Took less". */
  it('keeps the answers on a row of their own', () => {
    setup({ actions: ['confirm', 'edit', 'remove'] })

    const row = screen.getByTestId('answer-row')

    expect(within(row).getByTestId('answer-less')).toBeVisible()
    expect(within(row).queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('asks protected rest whether it happened', async () => {
    const { onRested } = setup({ actions: ['didRest'], item: { ...model().item, protectedRest: true } })

    await userEvent.click(screen.getByTestId('rested-no'))

    expect(onRested).toHaveBeenCalledWith('essay', false)
  })

  it('records rest as happened when the student says it did', async () => {
    const { onRested } = setup({ actions: ['didRest'], item: { ...model().item, protectedRest: true } })

    await userEvent.click(screen.getByTestId('rested-yes'))

    expect(onRested).toHaveBeenCalledWith('essay', true)
  })

  it('labels the rest answers', () => {
    setup({ actions: ['didRest'], item: { ...model().item, protectedRest: true } })

    expect(screen.getByTestId('rested-yes')).toHaveTextContent('I rested')
    expect(screen.getByTestId('rested-no')).toHaveTextContent("I didn't")
  })

  it('opens the micro-start page for this block', async () => {
    const handlers = setup()

    await userEvent.click(screen.getByTestId('micro-start'))

    expect(handlers.onMicroStart).toHaveBeenCalledWith('essay')
  })

  // The inline reveal is gone. Two ways to a first move is two answers that can disagree
  // about the same block, and only one of them can be the model's.
  it('no longer reveals a micro-start inside the sheet', () => {
    setup()

    expect(screen.queryByRole('button', { name: "I can't start this" })).not.toBeInTheDocument()
    expect(screen.queryByText(/that is the whole ask/i)).not.toBeInTheDocument()
  })


  it('says the block type in the same words Reality Check uses', () => {
    setup({ item: { ...model().item, type: 'social' } })

    expect(screen.getByTestId('block-when')).toHaveTextContent('seeing people')
  })

  it('puts every action in the pinned action bar, not the body', () => {
    setup()

    const bar = screen.getByTestId('sheet-actions')
    expect(within(bar).getByRole('button', { name: 'Later' })).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: /micro start/i })).toBeInTheDocument()
  })

  /**
   * §5's "what you recorded, and Undo" case, without a real Undo (see `blockActions.ts`'s
   * doc comment: there is no repository operation to retract an answer). Showing what was
   * said replaces the button that would otherwise do nothing.
   */
  describe('an already-answered past block', () => {
    it('states what was recorded rather than offering a dead Undo button', () => {
      setup({ actions: ['undo'], recordedAnswer: 'longer' })

      expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument()
      expect(screen.getByTestId('recorded-answer')).toHaveTextContent('You said: Took longer')
    })

    it('says so plainly even when the specific answer is not known', () => {
      setup({ actions: ['undo'], recordedAnswer: null })

      expect(screen.getByTestId('recorded-answer')).toHaveTextContent(/already answered/i)
    })
  })
})

describe('changing the block rather than answering about it', () => {
  const editable = { actions: ['later', 'edit', 'remove'] as const }

  it('opens the form when Edit is pressed', async () => {
    const { onEdit } = setup({ actions: [...editable.actions] })

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

    expect(onEdit).toHaveBeenCalledWith('essay')
  })

  /**
   * Removing is the one thing here that cannot be taken back. Done and Later change a block
   * and an answer can be given again; this takes it out of the week with no operation to put
   * it back, so the question IS the safeguard -- which is why it names the block rather than
   * asking "are you sure?" about nothing in particular.
   */
  it('asks before it removes anything', async () => {
    const { onRemove } = setup({ actions: [...editable.actions] })

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.getByTestId('confirm-remove')).toHaveTextContent(/takes it out of your week/i)
    expect(screen.getByTestId('confirm-remove')).toHaveTextContent('Essay draft')
  })

  it('removes it once the question is answered yes', async () => {
    const { onRemove } = setup({ actions: [...editable.actions] })

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await userEvent.click(screen.getByTestId('confirm-remove-yes'))

    expect(onRemove).toHaveBeenCalledWith('essay')
  })

  it('leaves it alone when the question is answered no', async () => {
    const { onRemove } = setup({ actions: [...editable.actions] })

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }))

    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.queryByTestId('confirm-remove')).toBeNull()
  })
})

/**
 * The line under the title, which says three things about the block and got two of them
 * wrong on a rest block.
 *
 * `1 hours` was unconditional plural. And the load-type word is `IN_THEIR_WORDS[item.type]`,
 * while every rest block the app creates carries `type: 'mental'` as a placeholder --
 * `drain.ts` excludes rest from draining, so nothing ever spends it. Nothing else read that
 * placeholder; this line did, so a rest block introduced itself as study.
 */
describe('what the line under the title says', () => {
  it('counts one hour as an hour', () => {
    setup({ item: { ...model().item, hours: 1 } })

    expect(screen.getByText(/1 hour\b/)).toBeVisible()
    expect(screen.queryByText(/1 hours/)).toBeNull()
  })

  it('still pluralises the rest', () => {
    setup({ item: { ...model().item, hours: 3 } })

    expect(screen.getByText(/3 hours/)).toBeVisible()
  })

  it('names the load type on a block that spends one', () => {
    setup({ item: { ...model().item, type: 'mental' } })

    expect(screen.getByText(/study and writing/i)).toBeVisible()
  })

  /** A rest block's kind is its description, and the title already says "Rest". Naming a
   *  load type it never spends tells the student something untrue about the block. */
  it('says nothing about a load type on a rest block', () => {
    setup({
      item: { ...model().item, title: 'Rest', kind: 'rest', protectedRest: true },
      actions: ['didRest', 'edit'],
    })

    expect(screen.queryByText(/study and writing/i)).toBeNull()
  })

  it('still says when a rest block is and how long it runs', () => {
    setup({
      item: { ...model().item, title: 'Rest', kind: 'rest', protectedRest: true, hours: 1 },
      actions: ['didRest', 'edit'],
    })

    expect(screen.getByText(/20:00–21:00/)).toBeVisible()
    expect(screen.getByText(/1 hour\b/)).toBeVisible()
  })
})
