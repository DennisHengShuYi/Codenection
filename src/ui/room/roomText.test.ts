import { describe, expect, it } from 'vitest'
import { describeRoom } from './roomText'
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
})
