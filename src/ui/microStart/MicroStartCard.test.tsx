import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MicroStart } from '../../domain/microStart'
import { MicroStartCard } from './MicroStartCard'

const microStart: MicroStart = {
  itemId: 'essay',
  action: 'Open the document and write the title. Nothing else.',
  minutes: 8,
}

const setup = (data: MicroStart | null = microStart, title = 'Ethics essay') => {
  const props = { microStart: data, title, onStarted: vi.fn(), onDismiss: vi.fn() }
  render(<MicroStartCard {...props} />)
  return props
}

/** §4.1: one action, time-boxed, offered without the student having to admit anything. */
describe('MicroStartCard', () => {
  it('renders nothing when there is nothing to suggest', () => {
    const { container } = render(
      <MicroStartCard microStart={null} title="Ethics essay" onStarted={vi.fn()} onDismiss={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  /**
   * Which block this is about, said on the card.
   *
   * "Stuck on this one?" over a first move names no task, and the room can hold several
   * blocks -- so a student reading "Put your kit on" had to work out for themselves which of
   * today's items the app was talking about. Asking somebody who cannot start a task to
   * first identify the task is the deliberation this card exists to remove.
   *
   * The title rather than the kind: the student typed "Gym", and their own word for it is
   * the one they will recognise.
   */
  it('names the block it is about', () => {
    setup(microStart, 'Gym')

    expect(screen.getByText('Gym')).toBeInTheDocument()
  })

  it('shows the one action', () => {
    setup()

    expect(screen.getByTestId('micro-start')).toHaveTextContent(/open the document/i)
  })

  // The time box is the persuasion. Without it the ask is open-ended again.
  it('shows the time box', () => {
    setup()

    expect(screen.getByTestId('micro-start')).toHaveTextContent(/8 minutes/i)
  })

  it('hands it back when the student takes it', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /i'll do that/i }))

    expect(props.onStarted).toHaveBeenCalledWith(microStart)
  })

  it('can be waved off', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /not now/i }))

    expect(props.onDismiss).toHaveBeenCalledOnce()
    expect(props.onStarted).not.toHaveBeenCalled()
  })

  /**
   * §4.1: one action, never a list -- a stuck person cannot choose. Counting the buttons
   * that actually commit to something must give one.
   */
  it('offers exactly one thing to do', () => {
    setup()

    expect(screen.getAllByRole('button', { name: /i'll do that/i })).toHaveLength(1)
  })

  // §4.1: zero friction, no explanation asked for. Being asked why you are stuck is one
  // more thing to be stuck on.
  it('asks for no explanation', () => {
    setup()

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByTestId('micro-start').textContent).not.toMatch(/why|reason|because/i)
  })
})
