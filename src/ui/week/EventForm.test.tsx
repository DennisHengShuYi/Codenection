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
