import { describe, expect, it } from 'vitest'
import {
  ROOM,
  back,
  toAdd,
  toBlock,
  toEditBlock,
  toMicroStart,
  toNewBlock,
  toRebalance,
  toReserves,
  toSettings,
  toWeek,
  type View,
} from './view'

describe('the view', () => {
  it('starts in the room', () => {
    expect(ROOM).toEqual({ kind: 'room' })
  })

  it('opens the week', () => {
    expect(toWeek()).toEqual({ kind: 'week' })
  })

  it('opens a block by id', () => {
    expect(toBlock('essay')).toEqual({ kind: 'block', itemId: 'essay' })
  })

  it('opens add at the chooser', () => {
    expect(toAdd()).toEqual({ kind: 'add', way: null })
  })

  /**
   * The sub-flow is part of where the student IS, not private state inside the sheet.
   * That is what lets `/add/photo` be an address at all -- see `viewPath.test.ts`.
   */
  it('opens add on one of its three ways', () => {
    expect(toAdd('photo')).toEqual({ kind: 'add', way: 'photo' })
  })

  it('opens settings', () => {
    expect(toSettings()).toEqual({ kind: 'settings' })
  })

  it('comes back to the room from the week', () => {
    expect(back(toWeek())).toEqual(ROOM)
  })

  it('comes back to the room from add', () => {
    expect(back(toAdd())).toEqual(ROOM)
  })

  it('comes back to the room from settings', () => {
    expect(back(toSettings())).toEqual(ROOM)
  })

  it('going back from the room stays in the room', () => {
    expect(back(ROOM)).toEqual(ROOM)
  })

  /**
   * The one place a stack is worth having: a block is opened from the week, not the room,
   * so closing it must leave you where you opened it rather than skipping past the week.
   */
  it('comes back to the week from a block, not the room', () => {
    expect(back(toBlock('essay'))).toEqual({ kind: 'week' })
  })

  it('is only ever in one place at a time', () => {
    const views: View[] = [ROOM, toWeek(), toBlock('essay'), toAdd(), toAdd('type'), toSettings()]

    for (const view of views) {
      expect(Object.keys(view).filter((key) => key === 'kind')).toHaveLength(1)
      expect(['room', 'week', 'block', 'add', 'settings']).toContain(view.kind)
    }
  })

  /**
   * Was "never carries an item id except when on a block", which stopped being true when
   * the edit form got an address of its own -- it is a view about one block and has to say
   * which. Rewritten rather than deleted: the invariant is still worth holding, it just has
   * two members on one side now instead of one.
   */
  it('carries an item id only where an item is what it is about', () => {
    const aboutAnItem: View[] = [toBlock('essay'), toEditBlock('essay')]
    const aboutSomethingElse: View[] = [
      ROOM,
      toWeek(),
      toRebalance(),
      toNewBlock(0),
      toAdd(),
      toSettings(),
      toReserves(),
    ]

    for (const view of aboutAnItem) expect('itemId' in view).toBe(true)
    for (const view of aboutSomethingElse) expect('itemId' in view).toBe(false)
  })
  /**
   * Ruling 59: the five-bar breakdown moved off the week screen and behind the room's own
   * corner gauge, which is now the door to it rather than only a readout.
   */
  it('opens the reserves', () => {
    expect(toReserves()).toEqual({ kind: 'reserves' })
  })

  it('comes back to the room from the reserves', () => {
    expect(back(toReserves())).toEqual(ROOM)
  })
  /**
   * Ruling 60. `back` is the Back BUTTON's rule now: one level up, not "the way out". The
   * close control is what leaves entirely, and it does not consult this.
   */
  it('comes back to the chooser from one of the add sub-flows, not to the room', () => {
    expect(back(toAdd('photo'))).toEqual(toAdd())
    expect(back(toAdd('type'))).toEqual(toAdd())
    expect(back(toAdd('request'))).toEqual(toAdd())
  })

  it('comes back to the room from the chooser itself', () => {
    expect(back(toAdd())).toEqual(ROOM)
  })
})

/**
 * Ruling 60 applied to the three doors this feature adds.
 *
 * A proposal and a new block were both opened from the week, so up is the week. The edit
 * form was opened from the block it edits, so up is that block -- not the week, which would
 * skip a level and make Back and the close control mean the same thing again.
 */
describe('one level up from the new doors', () => {
  it('takes a proposal back to the week it is about', () => {
    expect(back(toRebalance())).toEqual(toWeek())
  })

  it('takes an edit form back to the block it was opened from', () => {
    expect(back(toEditBlock('essay'))).toEqual(toBlock('essay'))
  })

  it('takes a new block back to the week it is being added to', () => {
    expect(back(toNewBlock(4))).toEqual(toWeek())
  })
})

describe('the micro-start page', () => {
  // Ruling 60: one level up is the block, not the week. Skipping it would make Back and the
  // close control mean the same thing again.
  it('goes back to the block it was opened from', () => {
    expect(back(toMicroStart('b1'))).toEqual(toBlock('b1'))
  })

  it('is about the block it names', () => {
    expect(toMicroStart('b1')).toEqual({ kind: 'microStart', itemId: 'b1' })
  })
})
