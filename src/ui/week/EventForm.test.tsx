import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { EventForm } from './EventForm'

const item = (id: string, over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id,
  title: id,
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 3,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: ScheduledItem[] = []): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const setup = (over: Partial<Parameters<typeof EventForm>[0]> = {}) => {
  const onSave = vi.fn()
  const onClose = vi.fn()
  const onBack = vi.fn()

  render(
    <EventForm
      schedule={week()}
      params={DEFAULT_PARAMS}
      item={null}
      dayIndex={3}
      today={0}
      onSave={onSave}
      onClose={onClose}
      onBack={onBack}
      {...over}
    />,
  )

  return { onSave, onClose, onBack }
}

describe('adding a block by hand', () => {
  it('opens as a dialog that says it is adding', () => {
    setup()

    expect(screen.getByRole('dialog', { name: /add a block/i })).toBeVisible()
  })

  it('will not save a block with no name', () => {
    setup()

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  /**
   * Exactly what was typed, on exactly the day it was opened for. This is the case that
   * distinguishes the manual path from the `+` sheet's three ways in, all of which read
   * something and then work out where it goes.
   */
  it('saves exactly what was typed, where it was put', async () => {
    const { onSave } = setup()

    await userEvent.type(screen.getByLabelText('What'), 'Gym')
    await userEvent.selectOptions(screen.getByLabelText('Starts at'), '17')
    await userEvent.clear(screen.getByLabelText('Hours'))
    await userEvent.type(screen.getByLabelText('Hours'), '1.5')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Gym', startHour: 17, hours: 1.5, dayIndex: 3 }),
    )
  })
})

describe('changing a block by hand', () => {
  it('opens with what the block already is', () => {
    setup({ item: item('essay', { title: 'Essay draft', startHour: 9, hours: 2 }) })

    expect(screen.getByLabelText('What')).toHaveValue('Essay draft')
    expect(screen.getByLabelText('Hours')).toHaveValue(2)
  })

  it('hands back the changed field without losing the untouched ones', async () => {
    const { onSave } = setup({ item: item('essay', { title: 'Essay draft' }) })

    await userEvent.selectOptions(screen.getByLabelText('Starts at'), '15')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Essay draft', startHour: 15 }),
    )
  })
})

/**
 * A student correcting the record of their own life is right to be able to do it on a fixed
 * class and on protected rest. The form says what each costs; it does not refuse.
 */
describe('what the form says about a block the optimizer has pinned', () => {
  it('says a fixed block is one the week is built around', () => {
    setup({ item: item('lab', { fixed: true }) })

    expect(screen.getByTestId('pinned-note')).toHaveTextContent(/built around/i)
  })

  it('says protected rest was pinned on purpose', () => {
    setup({ item: item('nap', { protectedRest: true, kind: 'rest' }) })

    expect(screen.getByTestId('pinned-note')).toHaveTextContent(/on purpose/i)
  })

  it('lets it be saved anyway', async () => {
    const { onSave } = setup({ item: item('lab', { title: 'Lab', fixed: true }) })

    await userEvent.selectOptions(screen.getByLabelText('Starts at'), '15')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
  })
})

describe('what the form says about a clash', () => {
  const clashing = () => ({
    schedule: week([
      item('lab', { title: 'WIA3001 tutorial', dayIndex: 3, startHour: 9, hours: 2 }),
    ]),
    item: item('essay', { title: 'Essay', dayIndex: 3, startHour: 14 }),
  })

  it('names the block it would collide with', async () => {
    setup(clashing())

    await userEvent.selectOptions(screen.getByLabelText('Starts at'), '9')

    expect(screen.getByTestId('edit-warnings')).toHaveTextContent('WIA3001 tutorial')
  })

  /**
   * The case that encodes the whole decision. A fortnight the student says is double-booked
   * is recorded as double-booked, and the deficit forecast then says so -- which is the
   * signal they came for. Refusing the save would leave the model holding a fiction.
   */
  it('still lets it be saved, because the week really is double-booked', async () => {
    const { onSave } = setup(clashing())

    await userEvent.selectOptions(screen.getByLabelText('Starts at'), '9')

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('says nothing when there is nothing to say', () => {
    setup({ item: item('essay') })

    expect(screen.queryByTestId('edit-warnings')).toBeNull()
  })
})

/**
 * Every other control on the form, driven the way a student drives it.
 *
 * The name, the start hour and the fixed checkbox had tests; the four selects that carry
 * what a block IS and which day it lands on did not -- so a block could have been saved
 * with the type its dropdown showed and a different one underneath, and nothing would have
 * failed. Found by the coverage gate rather than by review: these were the untested
 * handlers holding the function threshold under its floor.
 */
describe('correcting what a block is and when it happens', () => {
  it('changes the load type it counts against', async () => {
    const { onSave } = setup({ item: item('essay', { title: 'Essay draft' }) })

    await userEvent.selectOptions(screen.getByLabelText('Kind'), 'physical')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Essay draft', type: 'physical' }),
    )
  })

  it('changes what the activity actually is, which is not the same question', async () => {
    const { onSave } = setup({ item: item('essay', { title: 'Essay draft' }) })

    await userEvent.selectOptions(screen.getByLabelText('Detail'), 'rest')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ kind: 'rest' }))
  })

  it('moves the block to another day', async () => {
    const { onSave } = setup({ item: item('essay', { title: 'Essay draft' }) })

    await userEvent.selectOptions(screen.getByLabelText('Day'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ dayIndex: 5 }))
  })

  /** The checkbox had a test for what it SAYS; this is what it does. Ticking it is how a
   *  block written down loosely becomes a commitment the week has to work around. */
  it('pins a loose block as a fixed commitment', async () => {
    const { onSave } = setup({ item: item('essay', { title: 'Essay draft', fixed: false }) })

    await userEvent.click(screen.getByTestId('fixed-block'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ fixed: true }))
  })

  it('unpins one that was fixed', async () => {
    const { onSave } = setup({ item: item('lab', { fixed: true }) })

    await userEvent.click(screen.getByTestId('fixed-block'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ fixed: false }))
  })
})

/**
 * The deadline, which this form could not set until now.
 *
 * Every other way into the week could state one -- the planner reads it out of what a
 * student typed, the photo reader off a timetable, the calendar import off the event's own
 * date. The one surface a student fills in by hand could not, so a block added here fell to
 * the synthetic deadline its kind gets and there was no way to correct a wrong one.
 */
describe('setting when something is due', () => {
  it('offers a due date, and defaults to none', () => {
    setup()

    expect(screen.getByTestId('deadline-day')).toHaveValue('')
  })

  it('saves the due date the student picked', async () => {
    const props = setup()

    await userEvent.type(screen.getByLabelText('What'), 'Essay')
    await userEvent.selectOptions(screen.getByTestId('deadline-day'), '6')
    await userEvent.click(screen.getByTestId('save-block'))

    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ deadlineDay: 6 }))
  })

  /** Undated is the ordinary case, and has to stay sayable: most things a student types in
   *  are not due on any particular day, and the kind's own interval covers those. */
  it('lets a due date be taken back off', async () => {
    const props = setup({ item: item('essay', { deadlineDay: 6 }) })

    await userEvent.selectOptions(screen.getByTestId('deadline-day'), '')
    await userEvent.click(screen.getByTestId('save-block'))

    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ deadlineDay: null }))
  })

  it('opens on the due date a block already has', () => {
    setup({ item: item('essay', { deadlineDay: 6 }) })

    expect(screen.getByTestId('deadline-day')).toHaveValue('6')
  })

  /** Not a warning like a clash: a block after its own deadline cannot be reconciled by any
   *  later rearrangement, so the save is held until one of the two moves. */
  it('refuses a day that falls after the due date, and says which way round', async () => {
    const props = setup()

    await userEvent.type(screen.getByLabelText('What'), 'Essay')
    await userEvent.selectOptions(screen.getByTestId('deadline-day'), '1')
    await userEvent.click(screen.getByTestId('save-block'))

    expect(props.onSave).not.toHaveBeenCalled()
    expect(screen.getByText(/due before the day/i)).toBeVisible()
  })
})

/**
 * The days, named the way the rest of the app names them.
 *
 * This form printed raw ISO dates -- `2026-09-15` -- in both its day pickers, while the
 * planner's chip asked the same question with `dayLabel`: "Today", "Tomorrow", "Fri 12 Sep".
 * Two vocabularies for one question, which `kit/labels.ts` names as the way "the planner and
 * the week come to call the same thing different things". `calendar.ts` already holds the
 * one answer; this reads it rather than formatting a second.
 */
describe('how the days are named', () => {
  it('calls today Today', () => {
    setup({ today: 3 })

    expect(screen.getByTestId('deadline-day')).toHaveTextContent(/Today/)
  })

  it('calls tomorrow Tomorrow', () => {
    setup({ today: 3 })

    expect(screen.getByTestId('deadline-day')).toHaveTextContent(/Tomorrow/)
  })

  it('names the rest by weekday rather than by ISO date', () => {
    setup({ today: 0, schedule: { ...week(), startedOn: '2026-09-12' } })

    const options = screen.getByTestId('deadline-day')

    expect(options).toHaveTextContent(/Sun 13 Sep/)
    expect(options).not.toHaveTextContent(/2026-09-13/)
  })

  it('names the scheduling day the same way', () => {
    setup({ today: 3 })

    expect(screen.getByTestId('day-of-block')).toHaveTextContent(/Today/)
  })
})

/**
 * What you have called things before, offered while you type.
 *
 * §2.4's narrow rungs group answers by title, so "gym" and "Gym session" are two buckets
 * neither of which fills. `taskKey` collapses what it can from the words; this is the
 * cheaper half of the fix -- the name already in use is one tap away, so the second spelling
 * never gets typed.
 *
 * A native `<datalist>` rather than a built dropdown: the browser filters as the student
 * types, announces it, and works on a phone keyboard, none of which a hand-rolled list gets
 * for free. It also stays a plain text field, so a name that is genuinely new needs no
 * escape hatch.
 */
describe('names offered while typing', () => {
  const answeredGym = {
    blockId: 'gym-1',
    type: 'physical' as const,
    kind: 'hardExercise' as const,
    title: 'Gym',
    plannedHours: 1,
    dayIndex: 0,
    answer: 'right' as const,
    answeredAt: 1,
  }

  /** A datalist option carries a value and no text, so the value is what to read. */
  const offered = (): string[] =>
    [...document.querySelectorAll('#what-before option')].map((option) =>
      option.getAttribute('value') ?? '',
    )

  it('offers what is already in the week', () => {
    setup({ schedule: week([item('lab', { title: 'WIA3001 lab' })]) })

    expect(offered()).toContain('WIA3001 lab')
  })

  it('offers what the student has answered for before', () => {
    setup({ blockLog: [answeredGym] })

    expect(offered()).toContain('Gym')
  })

  it('leaves the field a plain text box, so a new name needs no escape hatch', () => {
    setup({ blockLog: [answeredGym] })

    const field = screen.getByLabelText('What')

    expect(field).toHaveAttribute('list')
    expect(field.tagName).toBe('INPUT')
  })
})
