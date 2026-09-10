import { describe, expect, it } from 'vitest'
import { describeRoom, describeRoomFully } from './roomText'
import type { RoomState } from './roomState'

const state = (over: Partial<RoomState> = {}): RoomState => ({
  ceilingPressure: 0.2,
  paperHeight: 0.2,
  clutter: [],
  plantHealth: 0.8,
  sleepDebt: 0,
  weather: 'clear',
  lightLevel: 0.8,
  doorLit: false,
  character: 'steady',
  ...over,
})

/** Everything at once: flattened, storm, clutter, sleep debt, drooping plant, lit door --
 *  the state that used to produce all six sentences `describeRoom` could emit. */
const worstCaseState = (): RoomState =>
  state({
    character: 'flattened',
    weather: 'storm',
    clutter: [{ id: 'a', title: 'Laundry', dayIndex: 1 }],
    sleepDebt: 3,
    plantHealth: 0.1,
    doorLit: true,
  })

/**
 * §1.5 makes the text equivalent a primary view rather than a fallback, and the room
 * needs it far more than the dial did: a dial at least has a number beside it, while a
 * picture of a room carries nothing whatsoever to a screen reader. Anything missing here
 * is not unstyled for those users -- it is absent.
 */
describe('describeRoom', () => {
  it('describes how the student is', () => {
    expect(describeRoom(state({ character: 'flattened' }))).toMatch(/flattened/i)
  })

  it('describes the weather in the window', () => {
    expect(describeRoom(state({ weather: 'storm' }))).toMatch(/storm/i)
  })

  it('names what is waiting on the floor', () => {
    const text = describeRoom(state({ clutter: [{ id: 'a', title: 'Laundry', dayIndex: 2 }] }))

    expect(text).toMatch(/laundry/i)
  })

  it('says the floor is clear when it is', () => {
    expect(describeRoom(state())).toMatch(/nothing waiting|floor is clear/i)
  })

  it('mentions sleep debt when there is some', () => {
    expect(describeRoom(state({ sleepDebt: 2 }))).toMatch(/sleep/i)
  })

  it('says nothing about sleep when none is owed', () => {
    expect(describeRoom(state())).not.toMatch(/sleep/i)
  })

  it('mentions the plant when it is drooping', () => {
    expect(describeRoom(state({ plantHealth: 0.2 }))).toMatch(/plant/i)
  })

  it('says when the door is worth taking', () => {
    expect(describeRoom(state({ doorLit: true }))).toMatch(/outside|door/i)
  })

  /**
   * Driven at the worst possible state, because this is exactly the copy that drifts
   * toward "you have fallen behind" one small edit at a time. §1.3: the room reflects,
   * never scolds.
   */
  it('does not scold, even at the worst', () => {
    const text = describeRoom(
      state({ character: 'flattened', sleepDebt: 3, weather: 'storm', plantHealth: 0.1 }),
    )

    expect(text).not.toMatch(/should|failed|behind|lazy|streak|neglect/i)
  })

  it('reads as prose rather than a data dump', () => {
    const text = describeRoom(state())

    expect(text).toMatch(/\.$/)
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('[object')
  })

  it('never runs past three sentences, so 320px keeps its buttons', () => {
    // Everything at once: flattened, storm, clutter, sleep debt, drooping plant, lit door.
    const loud = describeRoom(worstCaseState())

    expect(loud.split('. ').length).toBeLessThanOrEqual(3)
  })

  it('always keeps the two things the picture cannot say another way', () => {
    const loud = describeRoom(worstCaseState())

    expect(loud).toMatch(/flattened/i)
    expect(loud).toMatch(/storm/i)
  })

  it('picks door lit over sleep debt, clutter and the plant, in priority order', () => {
    const text = describeRoom(worstCaseState())

    expect(text).toMatch(/door is lit/i)
    expect(text).not.toMatch(/sleep|laundry|drooping/i)
  })

  it('falls back to sleep debt when the door is not lit', () => {
    const text = describeRoom(
      state({ sleepDebt: 2, clutter: [{ id: 'a', title: 'Laundry', dayIndex: 1 }], plantHealth: 0.1 }),
    )

    expect(text).toMatch(/sleep/i)
    expect(text).not.toMatch(/laundry|drooping/i)
  })
})

describe('describeRoomFully', () => {
  /**
   * The cap on `describeRoom` is visual only -- a screen reader using the drawing's
   * aria-label must still hear everything the room can say, so this stays uncapped and
   * keeps every conditional sentence the six-sentence version used to emit.
   */
  it('keeps every applicable sentence, not just one', () => {
    const text = describeRoomFully(worstCaseState())

    expect(text).toMatch(/flattened/i)
    expect(text).toMatch(/storm/i)
    expect(text).toMatch(/laundry/i)
    expect(text).toMatch(/sleep/i)
    expect(text).toMatch(/drooping/i)
    expect(text).toMatch(/door is lit/i)
  })

  it('says the floor is clear when it is', () => {
    expect(describeRoomFully(state())).toMatch(/nothing waiting|floor is clear/i)
  })

  it('reads as prose rather than a data dump', () => {
    const text = describeRoomFully(state())

    expect(text).toMatch(/\.$/)
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('[object')
  })
})
