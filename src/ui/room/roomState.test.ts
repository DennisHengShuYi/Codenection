import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS, project, type Reserves } from '../../engine'
import { ALL_PRESENT, toDayInputs, type Schedule, type ScheduledItem } from '../../optimizer'
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

const stateFor = (reserves: Reserves, week: Schedule = schedule()) =>
  roomStateFor(reserves, project(reserves, toDayInputs(week, ALL_PRESENT), DEFAULT_PARAMS), week)

describe('roomStateFor', () => {
  it('presses the ceiling lower as load rises', () => {
    expect(stateFor(drained).ceilingPressure).toBeGreaterThan(stateFor(healthy).ceilingPressure)
  })

  it('grows the paper stack with mental load', () => {
    expect(stateFor({ ...healthy, mental: 5 }).paperHeight).toBeGreaterThan(
      stateFor(healthy).paperHeight,
    )
  })

  // §1.3: "Floor clutter -- errands, one box per pending item."
  it('puts one clutter box on the floor per pending errand', () => {
    const state = stateFor(healthy, schedule([errand('a', 1), errand('b', 3)]))

    expect(state.clutter).toHaveLength(2)
    expect(state.clutter.map((box) => box.id)).toEqual(['a', 'b'])
  })

  it('leaves the floor clear when there are no errands', () => {
    expect(stateFor(healthy).clutter).toHaveLength(0)
  })

  // A floor with twenty boxes is not readable, and the room's whole job is being
  // readable without being read.
  it('caps the clutter so the floor stays legible', () => {
    const many = Array.from({ length: 20 }, (_, i) => errand(`e${i}`, i % 14))

    expect(stateFor(healthy, schedule(many)).clutter.length).toBeLessThanOrEqual(6)
  })

  it('wilts the plant with poor sleep', () => {
    expect(stateFor(healthy, schedule([], 5)).plantHealth).toBeLessThan(
      stateFor(healthy, schedule([], 9)).plantHealth,
    )
  })

  it('shows sleep debt building on short nights', () => {
    expect(stateFor(healthy, schedule([], 5)).sleepDebt).toBeGreaterThan(0)
  })

  it('shows no sleep debt on long ones', () => {
    expect(stateFor(healthy, schedule([], 9)).sleepDebt).toBe(0)
  })

  // §1.3: "Window weather -- the projection, rendered literally."
  it('shows clear weather when the fortnight holds', () => {
    expect(stateFor(healthy).weather).toBe('clear')
  })

  it('shows a storm when it does not', () => {
    expect(stateFor(drained, schedule([], 5)).weather).toBe('storm')
  })

  it('dims the light as the reserve falls', () => {
    expect(stateFor(drained).lightLevel).toBeLessThan(stateFor(healthy).lightLevel)
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
