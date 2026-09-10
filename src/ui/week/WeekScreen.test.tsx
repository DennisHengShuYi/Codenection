import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BlockRecord } from '../../domain/blockLog'
import {
  DEFAULT_PARAMS,
  HORIZON_DAYS,
  LOAD_TYPES,
  project,
  type DayInput,
  type LoadType,
} from '../../engine'
import { domainBars } from '../dial/domainBars'
import type { Fix, Schedule, ScheduledItem } from '../../optimizer'
import { BUSY_ABOVE_HOURS } from '../../domain/scheduleView'
import { WeekScreen } from './WeekScreen'

const item = (
  id: string,
  dayIndex: number,
  startHour = 9,
  hours = 2,
  over: Partial<ScheduledItem> = {},
): ScheduledItem => ({
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
  ...over,
})

const week = (items: ScheduledItem[] = [], over: Partial<Schedule> = {}): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

/**
 * Ruling 59 moved §1.2's five-domain breakdown OFF this screen and behind the room's
 * corner gauge, so nothing here needs a reserve, its bars or the projection any more.
 * `days` survives because the schedule helpers below still build from it.
 */
const days = (schedule: Schedule): DayInput[] =>
  Array.from({ length: schedule.horizonDays }, (_, dayIndex) => ({
    dayIndex,
    activities: [],
    sleepHours: schedule.sleepByDay[dayIndex] ?? 7,
    venueChanges: 0,
    daysToNearestDeadline: null,
    checkedIn: true,
  }))

const setup = (schedule = week(), over: Partial<Parameters<typeof WeekScreen>[0]> = {}) => {
  const onRebalance = vi.fn()
  const onSelectBlock = vi.fn()
  const projection = project(schedule.start, days(schedule), DEFAULT_PARAMS)

  render(
    <WeekScreen
      schedule={schedule}
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

  it('threads the durable block log through, so an answered block is not read as unconfirmed', () => {
    const answered: BlockRecord = {
      blockId: 'essay',
      type: 'mental',
      plannedHours: 2,
      dayIndex: 0,
      answer: 'right',
      answeredAt: 0,
    }

    setup(week([item('essay', 0)]), { blockLog: [answered] })

    expect(screen.getByTestId('day-0')).not.toHaveAccessibleName(/not confirmed/i)
  })

  it('marks the same block unconfirmed when the log has nothing to say about it', () => {
    setup(week([item('essay', 0)]))

    expect(screen.getByTestId('day-0')).toHaveAccessibleName(/not confirmed/i)
  })

  it('names the light band when a day is empty', () => {
    setup()

    expect(screen.getByTestId('day-5')).toHaveAccessibleName(/light/i)
  })

  it('names the busy band, not only heavy', () => {
    setup(week([item('a', 4, 9, BUSY_ABOVE_HOURS)]))

    expect(screen.getByTestId('day-4')).toHaveAccessibleName(/busy/i)
  })

  /**
   * §1.5/§12: colour never carries meaning alone. `BAND_SHADE` was the only visual
   * difference between light, busy and heavy -- the band word reached the `aria-label`
   * only, which is not a visual pairing. Every cell shows the legend glyph for its own
   * band, matching the spec's own mockup (`░ light ▓ busy █ heavy`).
   */
  it('pairs the load band with a visible glyph, not colour alone', () => {
    setup(week([item('a', 4, 9, BUSY_ABOVE_HOURS)]))

    expect(within(screen.getByTestId('day-4')).getByText('▓')).toBeInTheDocument()
    expect(within(screen.getByTestId('day-5')).getByText('░')).toBeInTheDocument()
  })

  it('marks a heavy day with its own visible glyph', () => {
    setup(week([item('a', 2, 9, 11)]))

    expect(within(screen.getByTestId('day-2')).getByText('█')).toBeInTheDocument()
  })

  /**
   * `scheduleView` computes `unconfirmed` and this screen's test already asserted it landed
   * in the `aria-label` -- but the button's visible children were only the date and the
   * deficit ⚠, so the mark never reached a sighted student. The spec needs it discoverable
   * from the overview, not only from a screen reader.
   */
  it('shows a visible mark for an unconfirmed day, not only in the accessible name', () => {
    setup(week([item('essay', 0)]))

    const cell = screen.getByTestId('day-0')
    expect(within(cell).getByText('?')).toBeInTheDocument()
  })

  it('does not show the unconfirmed mark once the block is answered', () => {
    const answered: BlockRecord = {
      blockId: 'essay',
      type: 'mental',
      plannedHours: 2,
      dayIndex: 0,
      answer: 'right',
      answeredAt: 0,
    }

    setup(week([item('essay', 0)]), { blockLog: [answered] })

    expect(within(screen.getByTestId('day-0')).queryByText('?')).not.toBeInTheDocument()
  })

  it('names a deficit day in words and marks it with an aria-hidden glyph', () => {
    // A fortnight that starts flat is in deficit regardless of how empty the days look --
    // see scheduleView.test.ts. Day 0 is never ahead of `today`, so it is eligible to
    // read as deficit here.
    setup(week([], { start: { mental: 5, physical: 5, social: 5, errands: 5 } }))

    const cell = screen.getByTestId('day-0')
    expect(cell).toHaveAccessibleName(/deficit/i)
    expect(within(cell).getByText('⚠')).toHaveAttribute('aria-hidden', 'true')
  })

  it('names every load type in words, not only by hue', async () => {
    const items = LOAD_TYPES.map((type: LoadType, index) =>
      item(`t-${type}`, 3, 9 + index * 2, 1, { type }),
    )
    setup(week(items))

    await userEvent.click(screen.getByTestId('day-3'))

    for (const type of LOAD_TYPES) {
      expect(screen.getByTestId(`block-t-${type}`)).toHaveTextContent(new RegExp(type, 'i'))
    }
  })

  it('marks a fixed block with both the glyph and the word, not the glyph alone', async () => {
    setup(week([item('essay', 3, 9, 2, { fixed: true })]))

    await userEvent.click(screen.getByTestId('day-3'))

    expect(screen.getByTestId('block-essay')).toHaveTextContent(/🔒/)
    expect(screen.getByTestId('block-essay')).toHaveTextContent(/fixed/i)
  })

  it('marks protected rest with both the glyph and the word, not the glyph alone', async () => {
    setup(week([item('rest', 3, 22, 2, { protectedRest: true })]))

    await userEvent.click(screen.getByTestId('day-3'))

    expect(screen.getByTestId('block-rest')).toHaveTextContent(/🛡/)
    expect(screen.getByTestId('block-rest')).toHaveTextContent(/protected/i)
  })

  it('offers the single best remaining move when the solver could not improve the week', () => {
    const fallback: Fix = {
      move: {
        kind: 'shiftDay',
        itemId: 'essay',
        description: 'Moved the essay 1 day later',
        apply: (schedule) => schedule,
      },
      worstBefore: 11,
      worstAfter: 44,
      gain: 33,
      deficitDaysBefore: 3,
      deficitDaysAfter: 2,
    }

    setup(week(), { fallback })

    // Honest about what actually happened: the rebalancer evaluated moves and rejected
    // them on its own score, so it must not claim there was "almost nothing to move".
    const text = screen.getByTestId('rebalance-fallback').textContent
    expect(text).toContain('Moved the essay 1 day later')
    expect(text).not.toMatch(/almost nothing to move/i)
  })

  it('offers no fallback when the solver already handled it, or the week needs none', () => {
    setup(week(), { fallback: null })

    expect(screen.queryByTestId('rebalance-fallback')).not.toBeInTheDocument()
  })

  it('reflects the opened day as a disclosure, not a toggle', async () => {
    setup(week([item('essay', 3)]))

    expect(screen.getByTestId('day-3')).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(screen.getByTestId('day-3'))

    expect(screen.getByTestId('day-3')).toHaveAttribute('aria-expanded', 'true')
  })
})

/**
 * The silently-wrong empty state.
 *
 * Fixed load -- classes, labs, shifts -- is the baseline everything else is measured
 * against. A student who never imported a timetable is being modelled as having no classes
 * at all, and the week grid renders that as twenty-one cheerful light squares. The screen
 * looks like good news when it is actually a screen with no information in it.
 *
 * Said once, quietly, and never again once there is anything fixed to work around.
 */
describe('WeekScreen with no fixed commitments', () => {
  const lecture = (dayIndex: number) => item(`lecture-${dayIndex}`, dayIndex, 9, 2, { fixed: true })

  it('says so when the week has no classes or shifts in it', () => {
    setup(week())

    expect(screen.getByTestId('no-fixed-load')).toHaveTextContent(
      'Your week has no classes or shifts in it. Add them and the forecast gets a lot sharper.',
    )
  })

  /**
   * The case that makes the message honest rather than merely present. A week full of
   * typed essays still has no timetable in it, and telling that student their forecast is
   * complete is the same silent wrongness from the other direction.
   */
  it('still says so when the week holds only movable work', () => {
    setup(week([item('essay', 2), item('reading', 4)]))

    expect(screen.getByTestId('no-fixed-load')).toBeVisible()
  })

  it('says nothing once a single fixed block exists', () => {
    setup(week([lecture(1)]))

    expect(screen.queryByTestId('no-fixed-load')).not.toBeInTheDocument()
  })

  /** Protected rest is fixed load the student did not put there, so it must not be read as
   *  a timetable and silence the prompt. */
  it('does not count protected rest as a timetable', () => {
    const rest = item('rest', 3, 20, 1, { fixed: true, protectedRest: true, kind: 'rest' })

    setup(week([rest]))

    expect(screen.getByTestId('no-fixed-load')).toBeVisible()
  })
  /**
   * Ruling 59. The week means the calendar and the one action on it; the dashboard that
   * used to sit underneath is behind the room's gauge now, covered by
   * `RoomShell.weekModal.test.tsx`. Asserted here so a future change cannot quietly put a
   * second capacity reading back on this screen.
   */
  it('carries no capacity reading of its own', () => {
    setup()

    expect(screen.queryByTestId('week-reserves')).toBeNull()
    expect(screen.queryAllByRole('meter')).toHaveLength(0)
    expect(screen.queryByTestId('reserve-text-equivalent')).toBeNull()
  })
})
