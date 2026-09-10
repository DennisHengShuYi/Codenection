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
  actions: ['done', 'later', 'move', 'cantStart'],
  microStart: null,
  ...over,
})

const setup = (over: Partial<BlockSheetModel> = {}) => {
  const handlers = {
    onClose: vi.fn(),
    onDone: vi.fn(),
    onLater: vi.fn(),
    onMove: vi.fn(),
    onConfirm: vi.fn(),
    onUndo: vi.fn(),
    onRested: vi.fn(),
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
    expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument()
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
    setup({ actions: ['done', 'later', 'move', 'cantStart'], microStart: null })

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
    expect(within(bar).getByRole('button', { name: 'Move' })).toBeInTheDocument()
  })
})
