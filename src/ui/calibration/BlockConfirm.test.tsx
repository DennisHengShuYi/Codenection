import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ScheduledItem } from '../../optimizer'
import { BlockConfirm } from './BlockConfirm'

const block = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'a',
  title: 'WIA3001 essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 0,
  startHour: 10,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const setup = (item: ScheduledItem | null = block()) => {
  const props = { block: item, onAnswer: vi.fn(), onDismiss: vi.fn() }
  render(<BlockConfirm {...props} />)
  return props
}

/** §7.9: one notification, two taps, feeding three separate model parameters. */
describe('BlockConfirm', () => {
  it('renders nothing when there is no block to confirm', () => {
    const { container } = render(
      <BlockConfirm block={null} onAnswer={vi.fn()} onDismiss={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('names the block, so the answer is about something specific', () => {
    setup()

    expect(screen.getByTestId('block-confirm')).toHaveTextContent('WIA3001 essay')
  })

  it('offers all three answers', () => {
    setup()

    expect(screen.getByTestId('happened-yes')).toBeVisible()
    expect(screen.getByTestId('happened-partly')).toBeVisible()
    expect(screen.getByTestId('happened-no')).toBeVisible()
  })

  // §7.9: the difficulty rating rides on the same prompt, not a second screen.
  it('asks how it went on the same prompt, once the first answer is given', async () => {
    setup()

    expect(screen.queryByTestId('difficulty-harder')).toBeNull()

    await userEvent.click(screen.getByTestId('happened-yes'))

    expect(screen.getByTestId('difficulty-harder')).toBeVisible()
  })

  it('hands back both answers together', async () => {
    const props = setup()

    await userEvent.click(screen.getByTestId('happened-partly'))
    await userEvent.click(screen.getByTestId('difficulty-harder'))

    expect(props.onAnswer).toHaveBeenCalledWith('partly', 'harder')
  })

  /**
   * §7.9: never punish a miss. "No" is a neutral answer that feeds the model, not a failure
   * the app comments on -- a student who did not do the thing is exactly the one whose data
   * is most needed, and an app that makes them feel judged is one they stop answering.
   */
  it('never reproaches a student who did not do it', async () => {
    setup()

    await userEvent.click(screen.getByTestId('happened-no'))

    expect(screen.getByTestId('block-confirm').textContent).not.toMatch(
      /failed|should have|why not|missed again|try harder|disappoint/i,
    )
  })

  it('treats no exactly like yes, offering the same next question', async () => {
    setup()

    await userEvent.click(screen.getByTestId('happened-no'))

    expect(screen.getByTestId('difficulty-expected')).toBeVisible()
  })

  // A prompt somebody cannot escape is one they learn to dread, and then to ignore.
  it('can be dismissed without answering', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /not now/i }))

    expect(props.onDismiss).toHaveBeenCalledOnce()
    expect(props.onAnswer).not.toHaveBeenCalled()
  })
})
