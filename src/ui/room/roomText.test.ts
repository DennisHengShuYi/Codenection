import { describe, expect, it } from 'vitest'
import { describeRoom, describeRoomFully } from './roomText'
import type { RoomState } from './roomState'

const state = (over: Partial<RoomState> = {}): RoomState => ({
  dayFull: 0.2,
  paperHeight: 0.2,
  clutter: [],
  exerciseWaiting: 0, companyWaiting: 0,
  windowDark: 0,
  sleepDebt: 0,
  weather: 'clear',
  lightLevel: 0.8,
  reserve: 0.7,
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
    // Ruling 45: the worst case now includes a day that does not fit and rest still waiting on
    // it -- the point of this fixture is that every sentence the room can say is applicable
    // at once, so the two new ones belong in it.
    exerciseWaiting: 0.5, companyWaiting: 0.5,
    windowDark: 0.6,
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

  /** Ruling 45: "clear" now means the floor AND the day -- the slot is only free to say the floor
   *  is clear when today put nothing in the room either. */
  it('says the floor is clear when it is, and today put nothing out', () => {
    const empty = state({ paperHeight: 0, exerciseWaiting: 0, companyWaiting: 0 })

    expect(describeRoom(empty)).toMatch(/nothing waiting|floor is clear/i)
  })

  it('mentions sleep debt when there is some', () => {
    expect(describeRoom(state({ sleepDebt: 2 }))).toMatch(/sleep/i)
  })

  it('says nothing about sleep when none is owed', () => {
    expect(describeRoom(state())).not.toMatch(/sleep/i)
  })

  /** Ruling 45: the plant is gone; what today actually put in the room took its place. */
  it('names what today put in the room', () => {
    expect(describeRoom(state({ exerciseWaiting: 0.5 }))).toMatch(/dumbbell/i)
    expect(describeRoom(state({ companyWaiting: 0.5 }))).toMatch(/people/i)
    expect(describeRoom(state({ paperHeight: 0.5 }))).toMatch(/books/i)
  })

  /**
   * Ruling 45's darkness, said in words. The drawing dims and a screen reader has to be told the
   * same fact -- a binding that reaches the picture and not the paragraph tells the two
   * audiences different things, and only one of them can tell.
   */
  it('says when the day does not fit inside itself', () => {
    expect(describeRoom(state({ windowDark: 0.6 }))).toMatch(/dim|sleep|hours/i)
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
      state({ character: 'flattened', sleepDebt: 3, weather: 'storm', exerciseWaiting: 0, companyWaiting: 0, windowDark: 0 }),
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

  /**
   * Ruling 45 put the spill at the top of the chain. It is the only sentence here about something
   * the student can still act on before it costs them the night: the door is a suggestion,
   * the floor is a fact, and sleep debt is already spent.
   */
  it('picks the day that does not fit over the door, sleep debt and the floor, in priority order', () => {
    const text = describeRoom(worstCaseState())

    expect(text).toMatch(/dim|comes out of sleep/i)
    expect(text).not.toMatch(/door is lit|laundry/i)
  })

  it('falls back to the door when the day does fit', () => {
    const text = describeRoom({ ...worstCaseState(), windowDark: 0 })

    expect(text).toMatch(/door is lit/i)
  })

  it('falls back to sleep debt when the door is not lit', () => {
    const text = describeRoom(
      state({ sleepDebt: 2, clutter: [{ id: 'a', title: 'Laundry', dayIndex: 1 }], exerciseWaiting: 0, companyWaiting: 0, windowDark: 0 }),
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
    expect(text).toMatch(/dumbbell|people|books/i)
    expect(text).toMatch(/dim|does not fit|comes out of sleep/i)
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
