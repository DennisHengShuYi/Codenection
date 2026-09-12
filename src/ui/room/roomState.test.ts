import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS, project, type Reserves } from '../../engine'
import { ALL_PRESENT, toDayInputs, type Schedule, type ScheduledItem } from '../../optimizer'
import type { BlockRecord } from '../../domain/blockLog'
import { roomStateFor } from './roomState'

const healthy: Reserves = { mental: 80, physical: 80, social: 80, errands: 80 }
const drained: Reserves = { mental: 8, physical: 9, social: 7, errands: 10 }

const errand = (id: string, dayIndex: number): ScheduledItem => ({
  id,
  title: id,
  type: 'errands',
  kind: 'errands',
  hours: 1,
  intensity: 1,
  dayIndex,
  startHour: 17,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
})

const schedule = (items: ScheduledItem[] = [], sleepHours = 8): Schedule => ({
  items,
  start: healthy,
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => sleepHours),
})

const stateFor = (reserves: Reserves, week: Schedule = schedule(), today = 0) =>
  roomStateFor(
    reserves,
    project(reserves, toDayInputs(week, ALL_PRESENT), DEFAULT_PARAMS),
    week,
    // Ruling 45: the room draws a day now. These older tests are about the bindings that still
    // read reserves -- the character, the door, the weather -- so they look at a day with
    // nothing on it and say so, rather than leaving the day to a default.
    //
    // `today` is taken where a case needs nights BEHIND the student: sleep debt is accrued,
    // so on day zero nothing is owed however short the fortnight's nights are.
    today,
    [],
  )

describe('roomStateFor', () => {

  // §1.3: "Floor clutter -- errands, one box per pending item." Ruling 45 narrows the pool to
  // today, so the floor speaks about the same day as the rest of the room; that the boxes
  // are still one-per-item is what this test is about, and `the floor, which is part of
  // today too` below covers the narrowing.
  it('puts one clutter box on the floor per pending errand', () => {
    const state = stateFor(healthy, schedule([errand('a', 0), errand('b', 0)]))

    expect(state.clutter).toHaveLength(2)
    expect(state.clutter.map((box) => box.id)).toEqual(['a', 'b'])
  })

  it('leaves the floor clear when there are no errands', () => {
    expect(stateFor(healthy).clutter).toHaveLength(0)
  })

  // A floor with twenty boxes is not readable, and the room's whole job is being
  // readable without being read.
  it('caps the clutter so the floor stays legible', () => {
    // All on today, since Ruling 45 made the floor today's: twenty errands on one day is the
    // case the cap exists for.
    const many = Array.from({ length: 20 }, (_, i) => errand(`e${i}`, 0))

    expect(stateFor(healthy, schedule(many)).clutter.length).toBeLessThanOrEqual(6)
  })

  // A day in, so there is a night behind them to owe against.
  it('shows sleep debt building on short nights', () => {
    expect(stateFor(healthy, schedule([], 5), 3).sleepDebt).toBeGreaterThan(0)
  })

  it('shows no sleep debt on long ones', () => {
    expect(stateFor(healthy, schedule([], 9), 3).sleepDebt).toBe(0)
  })

  // §1.3: "Window weather -- the projection, rendered literally."
  it('shows clear weather when the fortnight holds', () => {
    expect(stateFor(healthy).weather).toBe('clear')
  })

  it('shows a storm when it does not', () => {
    expect(stateFor(drained, schedule([], 5)).weather).toBe('storm')
  })


  /**
   * §1.3: the door lights when getting outside is the highest-value action. That is when
   * physical *and* social are both low -- going outside is the one move that answers
   * both at once, which is what makes it highest-value rather than merely good.
   */
  it('lights the door when getting outside is the best move', () => {
    expect(stateFor({ mental: 70, physical: 12, social: 10, errands: 70 }).doorLit).toBe(true)
  })

  it('leaves the door unlit when something else matters more', () => {
    expect(stateFor({ mental: 8, physical: 80, social: 80, errands: 80 }).doorLit).toBe(false)
  })

  it('gives the character a state', () => {
    expect(stateFor(drained).character).toBe('flattened')
    expect(stateFor(healthy).character).toBe('rested')
  })

  // §0: no cold start. An empty week still produces a drawable room.
  it('produces a room for an empty week', () => {
    const state = stateFor(healthy)

    expect(state.lightLevel).toBeGreaterThan(0)
    expect(state.clutter).toEqual([])
  })
})

/**
 * Ruling 45: the furniture reads today, not the fortnight.
 *
 * Every binding below used to be a function of the reserves -- a coherent picture of two
 * weeks and a vague one about the day in front of the student. The reserve has a better
 * home since Ruling 59 put it in the corner gauge with the full breakdown behind it, which
 * is what freed the furniture to say something else.
 *
 * The character is the deliberate exception and keeps its reserve: Ruling 55 makes it the
 * app's statement about how the student is DOING, which is not a property of a timetable.
 */
const study = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'study',
  title: 'Essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 0,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const answeredBlock = (blockId: string): BlockRecord => ({
  blockId,
  type: 'mental',
  plannedHours: 2,
  dayIndex: 0,
  answer: 'right',
  answeredAt: 0,
})

const dayState = (
  items: ScheduledItem[],
  today = 0,
  log: BlockRecord[] = [],
  reserves: Reserves = healthy,
) => {
  const week = schedule(items)
  return roomStateFor(
    reserves,
    project(reserves, toDayInputs(week, ALL_PRESENT), DEFAULT_PARAMS),
    week,
    today,
    log,
  )
}

describe('the room as today', () => {
  it('stacks the desk from the hours today asks of it', () => {
    expect(dayState([study({ hours: 6 })]).paperHeight).toBeGreaterThan(
      dayState([study({ hours: 1 })]).paperHeight,
    )
  })

  it('leaves the desk clear on a day with no study on it', () => {
    expect(dayState([]).paperHeight).toBe(0)
  })

  /**
   * The same reserve, two different days: what changed is the day, so the furniture has to
   * follow the day. This is the discriminator -- a binding still secretly reading the
   * reserve passes every test above and fails this one.
   */
  it('draws two different days differently on identical reserves', () => {
    const items = [study({ id: 'today', hours: 5, dayIndex: 0 }), study({ id: 'tomorrow', hours: 0.5, dayIndex: 1 })]

    expect(dayState(items, 0).paperHeight).toBeGreaterThan(dayState(items, 1).paperHeight)
  })

  /** Ruling 47 moved this to the clock: the ceiling's depth is drawn in viewBox units and so
   *  means different amounts at different window sizes, which is no way to carry a number.
   *  The reading itself is unchanged and lives in `the clock, and the ceiling that no longer
   *  speaks` below. */
  it("puts today's total hours on the clock rather than the reserve", () => {
    expect(dayState([study({ hours: 10 })]).dayFull).toBeGreaterThan(
      dayState([study({ hours: 1 })]).dayFull,
    )
  })

  it('clears the desk as the day is answered', () => {
    const items = [study({ id: 'done', hours: 4 })]

    expect(dayState(items, 0, [answeredBlock('done')]).paperHeight).toBeLessThan(
      dayState(items, 0).paperHeight,
    )
  })
})

/**
 * Ruling 45's darkness: a day that cannot fit inside its waking hours takes the difference out of
 * sleep, and the room says so before the night rather than after it.
 */
describe('a day that does not fit', () => {
  it('dims the light in proportion to what spills past the day', () => {
    expect(dayState([study({ hours: 22 })]).lightLevel).toBeLessThan(
      dayState([study({ hours: 4 })]).lightLevel,
    )
  })

  it('leaves the light alone on a day there is room for', () => {
    expect(dayState([study({ hours: 4 })]).lightLevel).toBe(1)
  })

  /**
   * The window says two things at once and they are independent: weather is the forecast,
   * darkness is this day. A dark clear window is an exhausted student with a calm week; a
   * bright storm is a rested one with a rough patch coming.
   */
  it('darkens the window without touching the forecast it also carries', () => {
    const state = dayState([study({ hours: 22 })])

    expect(state.windowDark).toBeGreaterThan(0)
    expect(state.weather).toBe('clear')
  })
})

/**
 * Ruling 45: the gauge reads the reserve, and the light no longer does.
 *
 * Found by looking at the room rather than by a test: with the light rebound to the day's
 * spill, the corner gauge -- which derived its percentage from the light -- read 100% on a
 * nine-hour day at 43% reserve. The number in the corner is the door to the whole breakdown
 * (Ruling 59), so it has to be the reserve itself and not something that merely used to be.
 */
describe('the reserve the gauge shows', () => {
  it('is the reserve, not the light', () => {
    const drainedState = dayState([], 0, [], drained)
    const healthyState = dayState([], 0, [], healthy)

    expect(drainedState.reserve).toBeLessThan(healthyState.reserve)
  })

  it('does not move when the day gets heavier', () => {
    const quiet = dayState([study({ hours: 1 })])
    const buried = dayState([study({ hours: 22 })])

    expect(buried.reserve).toBe(quiet.reserve)
    expect(buried.lightLevel).toBeLessThan(quiet.lightLevel)
  })
})

/**
 * Found in review: the floor was the last binding still reading the fortnight.
 *
 * Every other object had moved to today, so a room could show one book for today's single
 * hour of study and six boxes for errands spread over two weeks -- two timeframes in one
 * picture, which is precisely what Ruling 45 set out to stop.
 */
describe('the floor, which is part of today too', () => {
  const errandOn = (id: string, dayIndex: number): ScheduledItem => ({
    ...study({ id, dayIndex }),
    type: 'errands',
    kind: 'errands',
    hours: 1,
  })

  it('shows the errands on today', () => {
    const state = dayState([errandOn('a', 0), errandOn('b', 0)])

    expect(state.clutter).toHaveLength(2)
  })

  it('leaves out the ones waiting on other days', () => {
    const state = dayState([errandOn('today', 0), errandOn('friday', 4)])

    expect(state.clutter.map((box) => box.id)).toEqual(['today'])
  })
})

/**
 * Ruling 47: the ceiling stops meaning anything, and the day's fullness moves to a clock.
 *
 * Ruling 45 rebound the ceiling from the fortnight's reserve to today's hours, which was a better
 * source for a worse home: the ceiling's depth is drawn in viewBox units, so it scales with
 * the stage and is 13 real pixels on a phone -- too thin to hold the controls that sit in
 * it, and too variable to read as a quantity. A clock face says "how much of today is
 * already spoken for" directly, and it pairs with the window: the clock fills up to a full
 * day, and the window darkens once the day runs past it.
 */
describe('the clock, and the ceiling that no longer speaks', () => {
  it('fills as today fills', () => {
    expect(dayState([study({ hours: 8 })]).dayFull).toBeGreaterThan(
      dayState([study({ hours: 2 })]).dayFull,
    )
  })

  it('is empty on a day with nothing on it', () => {
    expect(dayState([]).dayFull).toBe(0)
  })

  /** Full is full. A day asking for more hours than it has does not wrap round to empty --
   *  that overflow is the window's to say, and it already does. */
  it('stops at full rather than wrapping', () => {
    expect(dayState([study({ hours: 40 })]).dayFull).toBe(1)
  })

  it('reads the day it is showing, not the fortnight', () => {
    const items = [study({ id: 'today', hours: 8, dayIndex: 0 }), study({ id: 'later', hours: 8, dayIndex: 1 })]

    expect(dayState(items, 0).dayFull).toBeGreaterThan(0)
    expect(dayState(items, 5).dayFull).toBe(0)
  })

  /** The ceiling is furniture now. It was pressure, and pressure moved to the clock. */
  it('leaves the ceiling out of the state entirely', () => {
    expect('ceilingPressure' in dayState([study({ hours: 8 })])).toBe(false)
  })
})

/**
 * Sleep debt against the student rather than against a population.
 *
 * `RESTED_NIGHT_HOURS`' own docstring asked for exactly this: it is a population norm and
 * fixed, so "for a student who needs nine hours the bed under-reports", which "wants the same
 * calibration the engine's side is waiting on". A stated target is that calibration arriving.
 */
describe('roomStateFor and a stated sleep target', () => {
  const withTarget = (sleepHours: number, targetHours?: number, today = 3) => {
    const week = schedule([], sleepHours)

    return roomStateFor(
      healthy,
      project(healthy, toDayInputs(week, ALL_PRESENT), DEFAULT_PARAMS),
      week,
      today,
      [],
      targetHours,
    )
  }

  it('measures the shortfall against a target the student stated', () => {
    expect(withTarget(7, 9).sleepDebt).toBeCloseTo(2)
  })

  /**
   * And falls back to the population norm when nobody stated one -- NOT to
   * `DEFAULT_SLEEP_HOURS`. Those answer different questions: 8 is the night the app assumes
   * when it has not been told, 7 is the line below which a student counts as short.
   * Conflating them would wilt the bed for every student who had never opened the page, which
   * is a claim about them the app has no basis for.
   */
  it('keeps the population norm when nobody stated a target', () => {
    expect(withTarget(7).sleepDebt).toBe(0)
  })

  it('still reports a shortfall against a low target when the nights are lower', () => {
    expect(withTarget(4, 6, 3).sleepDebt).toBeCloseTo(2)
  })
})

/**
 * A debt is accrued, not forecast.
 *
 * `sleepDebt` averaged all twenty-one nights, so the bed's "about 3.4 hours of sleep owed"
 * included nights that had not happened -- and once `assumeSleep` began deriving those nights
 * from a measured average, the bed was reporting a debt largely made of the app's own
 * forecast. A student cannot owe sleep they have not yet failed to get.
 */
describe('roomStateFor and what sleep is actually owed', () => {
  const nights = (hours: readonly number[], today: number, targetHours?: number) => {
    const week: Schedule = {
      items: [],
      start: healthy,
      horizonDays: HORIZON_DAYS,
      sleepByDay: Array.from({ length: HORIZON_DAYS }, (_, day) => hours[day] ?? 8),
    }

    return roomStateFor(
      healthy,
      project(healthy, toDayInputs(week, ALL_PRESENT), DEFAULT_PARAMS),
      week,
      today,
      [],
      targetHours,
    )
  }

  it('reads only the nights already behind the student', () => {
    // Three short nights behind today, generous nights ahead. The debt is about the three.
    expect(nights([5, 5, 5, 9, 9, 9, 9], 3).sleepDebt).toBeCloseTo(2)
  })

  /** The forecast cannot put a student in debt. Short nights AHEAD are a warning the window
   *  and the forecast carry; they are not hours already lost. */
  it('ignores the nights still ahead', () => {
    expect(nights([8, 8, 8, 2, 2, 2, 2], 3).sleepDebt).toBe(0)
  })

  /** On the first morning nothing is behind them, so nothing is owed -- rather than a debt
   *  computed from a fortnight of assumptions. */
  it('owes nothing on the fortnight\u2019s first morning', () => {
    expect(nights([2, 2, 2], 0).sleepDebt).toBe(0)
  })

  it('still measures against a target the student stated', () => {
    expect(nights([7, 7, 7], 3, 9).sleepDebt).toBeCloseTo(2)
  })
})
