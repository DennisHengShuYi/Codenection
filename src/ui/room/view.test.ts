import { describe, expect, it } from 'vitest'
import { ROOM, back, toAdd, toBlock, toSettings, toWeek, type View } from './view'

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

  it('opens add', () => {
    expect(toAdd()).toEqual({ kind: 'add' })
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
    const views: View[] = [ROOM, toWeek(), toBlock('essay'), toAdd(), toSettings()]

    for (const view of views) {
      expect(Object.keys(view).filter((key) => key === 'kind')).toHaveLength(1)
      expect(['room', 'week', 'block', 'add', 'settings']).toContain(view.kind)
    }
  })

  it('never carries an item id except when on a block', () => {
    expect('itemId' in ROOM).toBe(false)
    expect('itemId' in toWeek()).toBe(false)
    expect('itemId' in toAdd()).toBe(false)
    expect('itemId' in toSettings()).toBe(false)
    expect('itemId' in toBlock('essay')).toBe(true)
  })
})
