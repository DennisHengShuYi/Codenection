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
  startHour: null,
  fixed: true,
  confident: true,
  repeat: null,
  ...over,
})

/** Ruling 43: real dates rather than day indices. "Day 2" is a modelling term; "Tue 10 Sep" is
 *  what a student recognises as their own week. */
const DAY_LABELS = [
  'Today, Mon 8 Sep',
  'Tue 9 Sep',
  'Wed 10 Sep',
  'Thu 11 Sep',
  'Fri 12 Sep',
]

const setup = (over: Partial<ParsedItem> = {}) => {
  const props = { item: item(over), onChange: vi.fn(), onRemove: vi.fn(), dayLabels: DAY_LABELS }
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

  /**
   * §5.1's boundary, drawn where the student can see it.
   *
   * A parse may not pin a block on its own -- a pinned block is one the optimizer is
   * forbidden to move, and a model that could create those could quietly wreck a week. So
   * the model's reading arrives as a ticked box rather than as a fact, and this control is
   * the difference between "the app decided your lecture is immovable" and "you told it
   * so". It is also the only way a photographed timetable becomes real fixed load rather
   * than movable work the solver shuffles around.
   */
  it('shows the model reading a stated time as a fixed block', () => {
    setup({ fixed: true })

    expect(screen.getByTestId('fixed-a')).toBeChecked()
  })

  it('shows an item with no stated time as movable', () => {
    setup({ fixed: false })

    expect(screen.getByTestId('fixed-a')).not.toBeChecked()
  })

  it('lets the student pin a block the model read as movable', async () => {
    const props = setup({ fixed: false })

    await userEvent.click(screen.getByTestId('fixed-a'))

    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ fixed: true }))
  })

  it('lets the student unpin a block the model read as fixed', async () => {
    const props = setup({ fixed: true })

    await userEvent.click(screen.getByTestId('fixed-a'))

    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ fixed: false }))
  })

  /**
   * Ruling 41: recurrence is a property confirmed on something the student was already adding,
   * not a screen of its own.
   *
   * A form with weekday checkboxes and an until-date picker is exactly the setup burden this
   * design has cut everywhere else -- so it surfaces here, as one line on the chip that is
   * already in front of them, and only when the parse actually read a repeat.
   */
  it('says so when what was read repeats', () => {
    setup({ repeat: { weekdays: [2], untilDay: null } })

    expect(screen.getByTestId('repeat-a')).toHaveTextContent(/every week|weekly|repeats/i)
  })

  it('names the days it repeats on', () => {
    setup({ repeat: { weekdays: [1, 3], untilDay: null } })

    expect(screen.getByTestId('repeat-a')).toHaveTextContent(/Monday/)
    expect(screen.getByTestId('repeat-a')).toHaveTextContent(/Wednesday/)
  })

  it('says nothing about repeating for a one-off', () => {
    setup({ repeat: null })

    expect(screen.queryByTestId('repeat-a')).toBeNull()
  })

  /** The correction that matters most: a parse reading a repeat into a one-off would fill
   *  three weeks with a class that meets once. One tap has to undo it. */
  it('lets the student say it does not actually repeat', async () => {
    const props = setup({ repeat: { weekdays: [2], untilDay: null } })

    await userEvent.click(screen.getByRole('button', { name: /just once/i }))

    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ repeat: null }))
  })
})

/**
 * Ruling 43: what will be added, and WHEN.
 *
 * The chip showed What, Kind, Detail and Hours -- everything except the one thing a
 * calendar entry is for. The day and the hour were decided after the accept, by
 * `placement.ts`, so a student confirmed an entry without being told when it would land
 * and then discovered it in the week.
 */
describe('the chip saying when', () => {
  it('shows the day it will land on, in words a student recognises', () => {
    setup({ deadlineDay: 2 })

    expect(screen.getByTestId('when-day-a')).toHaveValue('2')
    expect(screen.getByRole('option', { name: 'Wed 10 Sep' })).toBeInTheDocument()
  })

  it('shows the stated time', () => {
    setup({ deadlineDay: 2, startHour: 9 })

    expect(screen.getByTestId('when-hour-a')).toHaveValue('9')
  })

  it('lets the day be corrected', async () => {
    const props = setup({ deadlineDay: 2 })

    await userEvent.selectOptions(screen.getByTestId('when-day-a'), '3')

    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ deadlineDay: 3 }))
  })

  it('lets the time be corrected', async () => {
    const props = setup({ deadlineDay: 2, startHour: 9 })

    await userEvent.selectOptions(screen.getByTestId('when-hour-a'), '14')

    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ startHour: 14 }))
  })

  /**
   * "Any time" is a real answer and has to stay sayable. An essay due Friday has a day and
   * no hour, and forcing one would pin it -- taking away the optimizer's freedom to place
   * it, which is the whole reason the week can be rebalanced at all.
   */
  it('lets the time be given back to the app', async () => {
    const props = setup({ deadlineDay: 2, startHour: 9 })

    await userEvent.selectOptions(screen.getByTestId('when-hour-a'), '')

    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ startHour: null }))
  })

  /**
   * The ask. Extraction that found no day is not a failure to be hidden -- it is a
   * question, and this is where it gets asked rather than answered by a default.
   */
  it('asks for a day when the text stated none', () => {
    setup({ deadlineDay: null })

    expect(screen.getByTestId('when-missing-a')).toHaveTextContent(/when/i)
    expect(screen.getByTestId('when-day-a')).toHaveValue('')
  })

  it('stops asking once the day is given', () => {
    setup({ deadlineDay: 1 })

    expect(screen.queryByTestId('when-missing-a')).toBeNull()
  })
})

/**
 * Found by the live model, not by reasoning: `askGroq` reads "wia3001 lecture tuesday 9am"
 * as `repeat: {weekdays:[2]}` with `deadlineDay: null` -- the weekday becomes a weekly
 * series rather than a single dated item, which is right, and `expandRecurring` then
 * derives a day for every instance.
 *
 * The first cut of Ruling 43's gate asked "when is this?" of exactly those items: a lecture that
 * had said Tuesday twice over was told it had not said when it happens.
 */
describe('an item that repeats', () => {
  it('does not ask for a day, because the weekdays already answer', () => {
    setup({ deadlineDay: null, repeat: { weekdays: [2], untilDay: null } })

    expect(screen.queryByTestId('when-missing-a')).toBeNull()
  })

  it('still asks when there is neither a day nor a repeat', () => {
    setup({ deadlineDay: null, repeat: null })

    expect(screen.getByTestId('when-missing-a')).toBeVisible()
  })

  /** The hour is still the student's to see and correct: "every Tuesday" says which days,
   *  never what time. */
  it('keeps the time editable on a repeating item', async () => {
    const props = setup({
      deadlineDay: null,
      startHour: 9,
      repeat: { weekdays: [2], untilDay: null },
    })

    expect(screen.getByTestId('when-hour-a')).toHaveValue('9')

    await userEvent.selectOptions(screen.getByTestId('when-hour-a'), '10')
    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ startHour: 10 }))
  })
})
