import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ScheduledItem } from '../../optimizer'
import { OverfullCard } from './OverfullCard'

const block = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'b1',
  title: 'Ethics essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 3,
  intensity: 1,
  dayIndex: 2,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const three = (): ScheduledItem[] => [
  block({ id: 'lab', title: 'WIA3001 lab', hours: 4, startHour: 9 }),
  block({ id: 'gym', title: 'Gym', hours: 1, startHour: 18, type: 'physical', kind: 'hardExercise' }),
  block({ id: 'essay', title: 'Ethics essay', hours: 3, startHour: 20 }),
]

const setup = (over: Partial<Parameters<typeof OverfullCard>[0]> = {}) => {
  const onDrop = vi.fn<(itemId: string) => void>()
  const onDismiss = vi.fn()

  render(
    <OverfullCard
      dayLabel="Thursday"
      candidates={three()}
      droppedTitle={null}
      {...{ onDrop, onDismiss }}
      {...over}
    />,
  )

  return { onDrop, onDismiss }
}

/**
 * The card for the fortnight that is too big rather than badly arranged.
 *
 * Every other card in this app either reports something or hands the student a first move.
 * This one asks for a decision, and the decision is one the app deliberately refuses to make
 * for them: nothing in a `ScheduledItem` says how much something matters, so any ranking
 * would be invented. What the card owes the student, then, is an honest frame -- which day,
 * what is on it, how big each thing is -- and no thumb on the scale.
 */
describe('OverfullCard', () => {
  it('names the day that does not fit', () => {
    setup({ dayLabel: 'Thursday, Thu 17 Sep' })

    expect(screen.getByTestId('overfull')).toHaveTextContent('Thursday, Thu 17 Sep')
  })

  /** So the student knows this is not another suggestion to press Rebalance. They have
   *  already been past that; saying it plainly is what makes the ask reasonable. */
  it('says that rearranging cannot fix it', () => {
    setup()

    expect(screen.getByTestId('overfull')).toHaveTextContent(/rearrang|moving/i)
  })

  it('lists everything on the day by the name the student gave it', () => {
    setup()

    expect(screen.getByText('WIA3001 lab')).toBeInTheDocument()
    expect(screen.getByText('Gym')).toBeInTheDocument()
    expect(screen.getByText('Ethics essay')).toBeInTheDocument()
  })

  /** The choice is only informed if the size of each thing is on screen: dropping the four
   *  hours and dropping the one are not the same decision. */
  it('shows how many hours each one costs', () => {
    setup()

    const card = screen.getByTestId('overfull')
    expect(card).toHaveTextContent('4h')
    expect(card).toHaveTextContent('1h')
    expect(card).toHaveTextContent('3h')
  })

  it('reports the one that was actually pressed', async () => {
    const { onDrop } = setup()

    await userEvent.click(screen.getByTestId('drop-gym'))

    expect(onDrop).toHaveBeenCalledExactlyOnceWith('gym')
  })

  /**
   * The assertion the whole design rests on.
   *
   * A primary-styled button among the options would be the app saying "this one" -- a
   * recommendation it has no data to make. Ruling 22 refuses exactly this on the check-in's
   * three answers, for the same reason: a highlighted option is a nudge, and the value here
   * is that the student chose rather than agreed.
   */
  it('marks none of them as the one to drop', () => {
    setup()

    for (const id of ['lab', 'gym', 'essay']) {
      expect(screen.getByTestId(`drop-${id}`)).not.toHaveAttribute('data-variant', 'primary')
    }
  })

  it('offers a way to keep everything', async () => {
    const { onDismiss, onDrop } = setup()

    await userEvent.click(screen.getByTestId('overfull-dismiss'))

    expect(onDismiss).toHaveBeenCalledOnce()
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('renders nothing at all when there is nothing to offer', () => {
    const { container } = render(
      <OverfullCard
        dayLabel="Thursday"
        candidates={[]}
        droppedTitle={null}
        onDrop={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  /**
   * §2.3's surviving half. Dropping something a student only provisionally said yes to
   * leaves somebody expecting them, and the hard part was never the decision -- it was the
   * message. So the words appear once the decision is made, and not before.
   */
  it('offers the withdrawal message for something that was a provisional yes', () => {
    setup({ droppedTitle: 'Helping Sam move' })

    expect((screen.getByTestId('withdrawal') as HTMLTextAreaElement).value).toContain(
      'Helping Sam move',
    )
  })

  /** A student who deleted their own gym session owes nobody an apology, and offering them
   *  one to send would be the app inventing an obligation. */
  it('offers no withdrawal message for something that was only ever theirs', () => {
    setup({ droppedTitle: null })

    expect(screen.queryByTestId('withdrawal')).toBeNull()
  })

  /** The student sends it, so the student can change it. */
  it('lets the withdrawal be edited before it is sent', async () => {
    setup({ droppedTitle: 'Helping Sam move' })

    const box = screen.getByTestId('withdrawal')
    await userEvent.clear(box)
    await userEvent.type(box, 'Sorry, I cannot make it.')

    expect(box).toHaveValue('Sorry, I cannot make it.')
  })

  /** Once something has been dropped the list must reflect it, or the student is looking at
   *  a day that no longer exists and may drop a second thing they did not need to. */
  it('shows the remaining blocks after one has gone', () => {
    setup({ candidates: three().filter((one) => one.id !== 'gym'), droppedTitle: null })

    const card = screen.getByTestId('overfull')
    expect(within(card).queryByText('Gym')).toBeNull()
    expect(within(card).getByText('WIA3001 lab')).toBeInTheDocument()
  })
})
