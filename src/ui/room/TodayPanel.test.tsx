import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { PanelRow } from './todayRows'
import { TodayPanel } from './TodayPanel'

/**
 * Ruling 46: the panel is the control surface, and the drawing stays a picture.
 *
 * §3 removed tap-to-open from the room, and the e2e guard that protects it names this exact
 * change in its own docstring. There is a structural reason too: the drawing carries
 * `role="img"`, which hides its whole subtree from the accessibility tree, so a control
 * placed inside it would be invisible to a screen reader while looking perfectly correct.
 *
 * So every row here is a real button, outside that subtree -- which is what makes the
 * per-object detail reachable by keyboard and by screen reader at all.
 */
const row = (over: Partial<PanelRow> = {}): PanelRow => ({
  id: 'books',
  label: 'Books',
  meaning: 'study — the stack on the desk grows with it',
  hours: 4,
  count: 2,
  blocks: [
    { id: 'lecture', title: 'WIA3001 lecture', startHour: 9, hours: 2, done: false },
    { id: 'revision', title: 'Revision', startHour: 14, hours: 2, done: false },
  ],
  drawn: true,
  trend: null,
  ...over,
})

describe('the panel as a legend', () => {
  it('says what each object means', () => {
    render(<TodayPanel rows={[row()]} />)

    expect(screen.getByText(/study/i)).toBeVisible()
  })

  it('shows a row the words for where its load is heading', () => {
    render(<TodayPanel rows={[row({ id: 'books', trend: 'more coming' })]} />)

    expect(screen.getByTestId('panel-trend-books')).toHaveTextContent('more coming')
  })

  /**
   * A flat row carries nothing, and it is checked by absence rather than by empty text.
   *
   * This is the assertion most likely to pass by accident: a test looking only for empty text
   * would also pass against an element rendered with nothing in it, which would still take up
   * space in a panel that is already tight at 320px and would still be announced.
   */
  it('renders no trend element at all on a flat row', () => {
    render(<TodayPanel rows={[row({ id: 'books', trend: null })]} />)

    expect(screen.queryByTestId('panel-trend-books')).toBeNull()
  })

  it('says how much of today each object accounts for', () => {
    render(<TodayPanel rows={[row({ hours: 4 })]} />)

    expect(screen.getByTestId('panel-row-books')).toHaveTextContent(/4/)
  })

  /** A box is one errand, not half an hour of one, so the errands row counts rather than
   *  measuring -- and the panel has to say the figure it is actually showing. */
  it('counts the rows that are counted rather than timed', () => {
    render(<TodayPanel rows={[row({ id: 'boxes', label: 'Boxes', hours: 1, count: 3 })]} />)

    expect(screen.getByTestId('panel-row-boxes')).toHaveTextContent(/3/)
  })

  it('says when a row has nothing on it today, rather than hiding it', () => {
    render(<TodayPanel rows={[row({ hours: 0, count: 0, blocks: [] })]} />)

    // Still there: the legend teaches the vocabulary whether or not today uses every word.
    expect(screen.getByTestId('panel-row-books')).toBeVisible()
  })
})

describe('the panel as today', () => {
  /** The whole reason §3 could stay intact: the row is the control, so this works by
   *  keyboard and is announced, which a shape inside the drawing could never be. */
  it('offers each row as a real button', () => {
    render(<TodayPanel rows={[row()]} />)

    expect(screen.getByTestId('panel-row-books').tagName).toBe('BUTTON')
  })

  it('opens the events behind an object, with their times', async () => {
    render(<TodayPanel rows={[row()]} />)

    await userEvent.click(screen.getByTestId('panel-row-books'))

    const details = screen.getByTestId('panel-blocks-books')
    expect(within(details).getByText(/WIA3001 lecture/)).toBeVisible()
    expect(within(details).getByText(/09:00/)).toBeVisible()
  })

  it('keeps them shut until the row is pressed', () => {
    render(<TodayPanel rows={[row()]} />)

    expect(screen.queryByTestId('panel-blocks-books')).toBeNull()
  })

  it('closes them again on a second press', async () => {
    render(<TodayPanel rows={[row()]} />)

    await userEvent.click(screen.getByTestId('panel-row-books'))
    await userEvent.click(screen.getByTestId('panel-row-books'))

    expect(screen.queryByTestId('panel-blocks-books')).toBeNull()
  })

  /** The room empties as the day is worked through; the list says the same thing in words
   *  rather than leaving a done block looking identical to one still ahead. */
  it('marks a block the student has already answered', async () => {
    const blocks = [
      { id: 'done', title: 'Done thing', startHour: 9, hours: 2, done: true },
      { id: 'ahead', title: 'Still ahead', startHour: 14, hours: 2, done: false },
    ]
    render(<TodayPanel rows={[row({ blocks })]} />)

    await userEvent.click(screen.getByTestId('panel-row-books'))

    expect(screen.getByTestId('panel-block-done')).toHaveAttribute('data-done', 'true')
    expect(screen.getByTestId('panel-block-ahead')).toHaveAttribute('data-done', 'false')
  })

  /** The bed carries no blocks -- sleep is not a block -- so pressing it must say the hours
   *  rather than opening an empty list that reads as a bug. */
  it('says the sleep on the bed row without an empty list behind it', async () => {
    render(<TodayPanel rows={[row({ id: 'bed', label: 'Bed', hours: 7, count: 0, blocks: [] })]} />)

    await userEvent.click(screen.getByTestId('panel-row-bed'))

    expect(screen.getByTestId('panel-row-bed')).toHaveTextContent(/7/)
    expect(screen.queryByTestId('panel-blocks-bed')).toBeNull()
  })

  /** Ruling 45 left rest without an object on purpose. The row says so, or a student reads its
   *  absence from the room as the app having lost it. */
  it('says when a row is not drawn in the room at all', () => {
    render(<TodayPanel rows={[row({ id: 'rest', label: 'Rest', drawn: false })]} />)

    expect(screen.getByTestId('panel-row-rest')).toHaveAttribute('data-drawn', 'false')
  })
})

/**
 * Ruling 46: the sentence that makes the rows below it mean something.
 *
 * Without it the panel is a list of nouns and numbers: a student reads "Books 4 hours" and
 * still has to work out that the books on the desk ARE the four hours. The rule is one
 * sentence and it is the same for every row, so it is said once at the top rather than
 * repeated six times.
 */
describe('the sentence above the rows', () => {
  it('says the room fills with the work today asks for', () => {
    render(<TodayPanel rows={[row()]} />)

    const intro = screen.getByTestId('panel-intro')

    expect(intro).toBeVisible()
    expect(intro.textContent ?? '').toMatch(/room|object/i)
    expect(intro.textContent ?? '').toMatch(/hours|work|today/i)
  })

  it('sits above the first row rather than among them', () => {
    render(<TodayPanel rows={[row()]} />)

    const intro = screen.getByTestId('panel-intro')
    const first = screen.getByTestId('panel-row-books')

    expect(
      Boolean(intro.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true)
  })

  /** Said once, not per row: six copies of one rule is noise, and the rows already carry
   *  their own meaning underneath their names. */
  /** Ruling 47 moved the day's total from the ceiling to a clock. The legend explains every
   *  object the room draws, so it has to explain that one too -- a reading nobody can
   *  decode is decoration. */
  it('explains the clock, which carries the day as a whole', () => {
    render(<TodayPanel rows={[row()]} />)

    expect(screen.getByTestId('panel-intro').textContent ?? '').toMatch(/clock/i)
  })

  it('says it once', () => {
    render(<TodayPanel rows={[row(), row({ id: 'bed', label: 'Bed' })]} />)

    expect(screen.getAllByTestId('panel-intro')).toHaveLength(1)
  })
})
