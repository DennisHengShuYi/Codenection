import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROFILE } from '../../domain/calibration'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { WeekScreen } from './WeekScreen'

const item = (id: string, dayIndex: number, startHour = 9, hours = 2): ScheduledItem => ({
  id,
  title: id,
  type: 'mental',
  kind: 'studyBlock',
  hours,
  intensity: 1,
  dayIndex,
  startHour,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
})

const week = (items: ScheduledItem[] = []): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const setup = (schedule = week(), over: Partial<Parameters<typeof WeekScreen>[0]> = {}) => {
  const onRebalance = vi.fn()
  const onSelectBlock = vi.fn()

  render(
    <WeekScreen
      schedule={schedule}
      profile={DEFAULT_PROFILE}
      today={0}
      working={false}
      report={null}
      onRebalance={onRebalance}
      onSelectBlock={onSelectBlock}
      {...over}
    />,
  )

  return { onRebalance, onSelectBlock }
}

describe('WeekScreen', () => {
  it('shows the whole horizon at once', () => {
    setup()

    expect(screen.getAllByTestId(/^day-\d+$/)).toHaveLength(HORIZON_DAYS)
  })

  it('opens a day when it is tapped', async () => {
    setup(week([item('essay', 3)]))

    await userEvent.click(screen.getByTestId('day-3'))

    expect(within(screen.getByTestId('day-grid')).getByText('essay')).toBeInTheDocument()
  })

  it('keeps Rebalance above the opened day, because it acts on the fortnight', async () => {
    setup(week([item('essay', 3)]))

    await userEvent.click(screen.getByTestId('day-3'))

    const rebalance = screen.getByTestId('rebalance')
    const grid = screen.getByTestId('day-grid')
    expect(rebalance.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('reports which block was chosen', async () => {
    const { onSelectBlock } = setup(week([item('essay', 3)]))

    await userEvent.click(screen.getByTestId('day-3'))
    await userEvent.click(screen.getByTestId('block-essay'))

    expect(onSelectBlock).toHaveBeenCalledWith('essay')
  })

  it('names a day s load in words, never only by shade', async () => {
    setup(week([item('a', 2, 9, 11)]))

    expect(screen.getByTestId('day-2')).toHaveAccessibleName(/heavy/i)
  })

  it('says what it is doing while the solver runs', () => {
    setup(week(), { working: true })

    expect(screen.getByTestId('rebalance')).toBeDisabled()
    expect(screen.getByTestId('rebalance')).toHaveTextContent(/working/i)
  })

  it('reports what rebalancing changed', () => {
    setup(week(), { report: 'Moved the essay a day later.' })

    expect(screen.getByTestId('rebalance-report')).toHaveTextContent('Moved the essay a day later.')
  })
})
