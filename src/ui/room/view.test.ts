import { describe, expect, it } from 'vitest'
import { back, ROOM, toWords, zoomTo, type View } from './view'

describe('the view', () => {
  it('starts in the room', () => {
    expect(ROOM).toEqual({ kind: 'room' })
  })

  it('zooms to an object', () => {
    expect(zoomTo(ROOM, 'desk')).toEqual({ kind: 'zoom', objectId: 'desk' })
  })

  // Replacing rather than nesting: there is no stack, so back always means the room.
  it('replaces rather than nests when zooming while zoomed', () => {
    expect(zoomTo(zoomTo(ROOM, 'desk'), 'door')).toEqual({ kind: 'zoom', objectId: 'door' })
  })

  it('comes back to the room from a zoom', () => {
    expect(back(zoomTo(ROOM, 'desk'))).toEqual(ROOM)
  })

  it('comes back to the room from the words view', () => {
    expect(back(toWords(ROOM))).toEqual(ROOM)
  })

  it('going back from the room stays in the room', () => {
    expect(back(ROOM)).toEqual(ROOM)
  })

  it('opens the words view from anywhere', () => {
    expect(toWords(zoomTo(ROOM, 'desk')).kind).toBe('words')
  })

  /**
   * The reason this exists at all.
   *
   * It replaces seven booleans on the old home screen -- planning, photographing, requesting,
   * calibrating, selected, and two dismissal flags -- which between them permitted states
   * like "planning and photographing at once" that the screen could not actually render. A
   * union makes those unrepresentable rather than merely unlikely.
   */
  it('is only ever in one place at a time', () => {
    const views: View[] = [ROOM, zoomTo(ROOM, 'desk'), toWords(ROOM)]

    for (const view of views) {
      expect(Object.keys(view).filter((key) => key === 'kind')).toHaveLength(1)
      expect(['room', 'zoom', 'words']).toContain(view.kind)
    }
  })

  it('never carries an object id except when zoomed', () => {
    expect('objectId' in ROOM).toBe(false)
    expect('objectId' in toWords(ROOM)).toBe(false)
    expect('objectId' in zoomTo(ROOM, 'bed')).toBe(true)
  })
})
