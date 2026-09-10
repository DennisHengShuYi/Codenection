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
  actions: ['done', 'later', 'cantStart'],
  microStart: null,
  recordedAnswer: null,
  ...over,
})

const setup = (over: Partial<BlockSheetModel> = {}) => {
  const handlers = {
    onClose: vi.fn(),
    onBack: vi.fn(),
    onDone: vi.fn(),
    onLater: vi.fn(),
    onConfirm: vi.fn(),
    onRested: vi.fn(),
    onEdit: vi.fn(),
    onRemove: vi.fn(),
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

  it('completes the block', async () => {
    const { onDone } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onDone).toHaveBeenCalledWith('essay')
  })

  it('offers nothing it was not given', () => {
    setup({ actions: ['done'] })

    expect(screen.queryByRole('button', { name: 'Later' })).not.toBeInTheDocument()
  })

  it('asks a past block how it went, in one four-way answer', async () => {
    const { onConfirm } = setup({ actions: ['confirm'] })

    await userEvent.click(screen.getByTestId('answer-longer'))

    expect(onConfirm).toHaveBeenCalledWith('essay', 'longer')
  })

  it('labels the four confirm answers in the student-facing words', () => {
    setup({ actions: ['confirm'] })

    expect(screen.getByTestId('answer-didnt')).toHaveTextContent("Didn't happen")
    expect(screen.getByTestId('answer-less')).toHaveTextContent('Took less')
    expect(screen.getByTestId('answer-right')).toHaveTextContent('About right')
    expect(screen.getByTestId('answer-longer')).toHaveTextContent('Took longer')
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

  it('shows the micro-start unasked when one is offered', () => {
    setup({ microStart: { itemId: 'essay', action: 'Open the document and write the title.', minutes: 8 } })

    expect(screen.getByTestId('micro-start')).toHaveTextContent('Open the document')
    expect(screen.getByTestId('micro-start')).toHaveTextContent('8 minutes. That is the whole ask.')
  })

  it('reveals the micro-start when "I can\'t start this" is pressed and none was already shown', async () => {
    setup({ actions: ['done', 'later', 'cantStart'], microStart: null })

    expect(screen.queryByTestId('micro-start')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: "I can't start this" }))

    expect(screen.getByTestId('micro-start')).toBeInTheDocument()
  })

  it('says the block type in the same words Reality Check uses', () => {
    setup({ item: { ...model().item, type: 'social' } })

    expect(screen.getByTestId('block-when')).toHaveTextContent('seeing people')
  })

  it('puts every action in the pinned action bar, not the body', () => {
    setup()

    const bar = screen.getByTestId('sheet-actions')
    expect(within(bar).getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: 'Later' })).toBeInTheDocument()
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
  const editable = { actions: ['done', 'edit', 'remove'] as const }

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
