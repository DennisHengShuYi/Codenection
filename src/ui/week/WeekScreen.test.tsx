import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BlockRecord } from '../../domain/blockLog'
import { HORIZON_DAYS, LOAD_TYPES, type LoadType } from '../../engine'
import { LOAD_TYPE_LABELS } from '../kit/labels'
import type { Fix, Schedule, ScheduledItem } from '../../optimizer'
import { BUSY_ABOVE_HOURS } from '../../domain/scheduleView'
import { WeekScreen } from './WeekScreen'

// `PushToCalendar` asks the database on mount whether a grant exists, and a real network
// round trip has no place in this suite. Answering "yes" is what makes the control render,
// which is what the wiring test below is about; the control's own behaviour is covered in
// `PushToCalendar.test.tsx`.
vi.mock('../../google/connection', () => ({ hasCalendarConnected: () => Promise.resolve(true) }))
vi.mock('../../google/client', () => ({ pushCalendar: vi.fn() }))

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

/*
 * Ruling 59 moved §1.2's five-domain breakdown OFF this screen and behind the room's corner
 * gauge, so nothing here needs a reserve, its bars or the projection.
 *
 * A `days` helper survived that move, with a comment saying it was kept "because the
 * schedule helpers below still build from it" -- they did not, and its one remaining
 * consumer was an unused `projection` local. Both are gone, found by `noUnusedLocals`
 * rather than by reading.
 */

const setup = (schedule = week(), over: Partial<Parameters<typeof WeekScreen>[0]> = {}) => {
  const onRebalance = vi.fn()
  const onSelectBlock = vi.fn()
  const onAddBlock = vi.fn()

  render(
    <WeekScreen
      schedule={schedule}
      today={0}
      working={false}
      report={null}
      onRebalance={onRebalance}
      onSelectBlock={onSelectBlock}
      onAddBlock={onAddBlock}
      {...over}
    />,
  )

  return { onRebalance, onSelectBlock, onAddBlock }
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

/**
 * The fourth way in, and the only direct one. The `+` sheet's three ways all read something
 * and then work out where it goes; this starts from a day the student is already looking at,
 * so the day is what it hands back.
 */
describe('putting something into a day by hand', () => {
  it('offers nothing until a day is open', () => {
    setup(week([item('essay', 3)]))

    expect(screen.queryByTestId('add-block')).toBeNull()
  })

  it('offers to add to whichever day is open', async () => {
    const { onAddBlock } = setup(week([item('essay', 3)]))

    await userEvent.click(screen.getByTestId('day-3'))
    await userEvent.click(screen.getByTestId('add-block'))

    expect(onAddBlock).toHaveBeenCalledWith(3)
  })

  // The button follows the day it sits under, rather than the first one ever opened.
  it('follows the open day when it changes', async () => {
    const { onAddBlock } = setup(week([item('essay', 3), item('lab', 5)]))

    await userEvent.click(screen.getByTestId('day-3'))
    await userEvent.click(screen.getByTestId('day-5'))
    await userEvent.click(screen.getByTestId('add-block'))

    expect(onAddBlock).toHaveBeenCalledWith(5)
  })
})

/**
 * The way out to Google, on the screen that shows the week it would write.
 *
 * The wiring assertion rather than the control's own: `PushToCalendar` is tested in full in
 * its own file, and what matters here is that it is reachable from the one screen where a
 * student can see what they would be sending.
 */
describe('WeekScreen and the calendar', () => {
  it('offers to send the week to a connected calendar', async () => {
    render(
      <WeekScreen
        schedule={{ ...week([item('a', 0)]), startedOn: '2026-09-11' }}
        today={0}
        working={false}
        report={null}
        onRebalance={vi.fn()}
        onSelectBlock={vi.fn()}
        onAddBlock={vi.fn()}
      />,
    )

    expect(await screen.findByTestId('push-calendar')).toBeVisible()
  })
})

/**
 * Why a day is marked, on the day itself.
 *
 * The grid puts a ⚠ on a deficit day and says nothing else, and the days that most need
 * explaining are the ones that look empty -- a light day carrying a warning is where a
 * fortnight of load finally lands, and nothing on that day accounts for it. A student
 * reading the mark has no way to connect it to anything they did.
 *
 * Everything in the sentence is recomputed from the projection that produced the mark, so it
 * cannot describe a day the model did not simulate. See `domain/deficitCause`.
 */
describe('opening a deficit day', () => {
  const heavy = (dayIndex: number) => ({
    id: `study-${dayIndex}`,
    title: 'Thesis',
    type: 'mental' as const,
    kind: 'studyBlock' as const,
    hours: 9,
    intensity: 1,
    dayIndex,
    startHour: 9,
    fixed: true,
    deadlineDay: null,
    protectedRest: false,
  })

  /** Heavy enough, long enough, on short nights: mental gives way and the days after it stay
   *  under the line with nothing on them. */
  const crushing = (): Schedule => ({
    items: Array.from({ length: 9 }, (_, dayIndex) => heavy(dayIndex)),
    start: { mental: 70, physical: 70, social: 70, errands: 70 },
    horizonDays: HORIZON_DAYS,
    sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 6),
  })

  const openDeficitDay = async () => {
    setup(crushing())

    const marked = screen
      .getAllByTestId(/^day-\d+$/)
      .find((cell) => cell.textContent?.includes('⚠'))

    if (marked === undefined) throw new Error('no deficit day was marked')

    await userEvent.click(marked)

    return marked
  }

  it('says why, rather than leaving the mark unexplained', async () => {
    await openDeficitDay()

    expect(await screen.findByTestId('deficit-why')).toBeVisible()
  })

  it('names the reserve that gave way and where it is forecast to land', async () => {
    await openDeficitDay()

    const why = await screen.findByTestId('deficit-why')

    expect(why).toHaveTextContent(/study and writing/i)
    expect(why.textContent ?? '').toMatch(/\d+/)
  })

  it('says nothing on a day that is not in deficit', async () => {
    setup()

    await userEvent.click(screen.getByTestId('day-4'))

    expect(screen.queryByTestId('deficit-why')).toBeNull()
  })
})

/**
 * Where all four reserves stand on the day you opened.
 *
 * The grid says how busy a day is and warns when it is a deficit day; the reserves behind
 * that were computed for every day of the horizon and shown for none of them. Opening a day
 * is where a student asks "how am I on Thursday", and the answer already existed.
 *
 * The range travels with the figure deliberately. The projection is three runs at different
 * optimism levels and `central` is the middle one -- §8.2 is explicit that the 21-day
 * projection is a decision aid and never described as validated, and a single hard number
 * per day quietly drops that.
 */
describe('the reserves on the day you opened', () => {
  it('lists all four, in the words the rest of the app uses', async () => {
    setup()

    await userEvent.click(screen.getByTestId('day-4'))

    const panel = await screen.findByTestId('day-reserves')

    for (const label of Object.values(LOAD_TYPE_LABELS)) {
      expect(within(panel).getByText(label)).toBeVisible()
    }
  })

  it('shows the figure for the day that is open, not for today', async () => {
    const heavy = Array.from({ length: 6 }, (_, dayIndex) => ({
      id: `study-${dayIndex}`,
      title: 'Thesis',
      type: 'mental' as const,
      kind: 'studyBlock' as const,
      hours: 9,
      intensity: 1,
      dayIndex,
      startHour: 9,
      fixed: true,
      deadlineDay: null,
      protectedRest: false,
    }))

    setup({ ...week(), items: heavy, sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 6) })

    await userEvent.click(screen.getByTestId('day-0'))
    const early = (await screen.findByTestId('reserve-mental')).textContent ?? ''

    await userEvent.click(screen.getByTestId('day-6'))
    const later = (await screen.findByTestId('reserve-mental')).textContent ?? ''

    expect(early).not.toBe(later)
  })

  /** §8.2: a decision aid, never described as validated. The spread is the honesty. */
  it('shows how sure it is, not only the middle figure', async () => {
    setup()

    await userEvent.click(screen.getByTestId('day-8'))

    expect((await screen.findByTestId('reserve-mental')).textContent ?? '').toMatch(/\d+–\d+/)
  })

  it('marks a reserve that is under the line', async () => {
    const crushing = {
      ...week(),
      items: Array.from({ length: 9 }, (_, dayIndex) => ({
        id: `study-${dayIndex}`,
        title: 'Thesis',
        type: 'mental' as const,
        kind: 'studyBlock' as const,
        hours: 9,
        intensity: 1,
        dayIndex,
        startHour: 9,
        fixed: true,
        deadlineDay: null,
        protectedRest: false,
      })),
      sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 6),
    }

    setup(crushing)

    await userEvent.click(screen.getByTestId('day-8'))

    expect(await screen.findByTestId('reserve-mental')).toHaveAttribute('data-deficit', 'true')
  })

  it('says nothing until a day is opened', () => {
    setup()

    expect(screen.queryByTestId('day-reserves')).toBeNull()
  })
})

/**
 * Where the fortnight is going, as one picture.
 *
 * §1.5: colour never carries meaning alone, so the four lines are named in a legend and the
 * whole chart has a text equivalent -- a line chart is the most exclusionary thing in the
 * app for a screen reader, and an `aria-label` saying "chart" is not access.
 */
describe('the reserve track', () => {
  it('draws the fortnight under the grid', () => {
    setup()

    expect(screen.getByTestId('reserve-track')).toBeVisible()
  })

  it('names each line rather than leaving the colours to speak', () => {
    setup()

    const legend = screen.getByTestId('reserve-track-legend')

    for (const label of Object.values(LOAD_TYPE_LABELS)) {
      expect(within(legend).getByText(label)).toBeVisible()
    }
  })

  it('carries the same reading in words', () => {
    setup()

    expect(screen.getByTestId('reserve-track-text')).toBeVisible()
  })

  it('says in words when the horizon holds', () => {
    setup()

    expect(screen.getByTestId('reserve-track-text').textContent ?? '').toMatch(/nothing|holds|no /i)
  })
})
