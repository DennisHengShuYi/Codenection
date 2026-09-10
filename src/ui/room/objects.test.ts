import { describe, expect, it } from 'vitest'
import { CLUTTER_PLACEHOLDER, clutterIdFor, isClutterId, metaFor, OBJECT_ORDER } from './objects'

describe('the room objects', () => {
  it('gives every object a label a person would recognise', () => {
    for (const id of OBJECT_ORDER) {
      expect(metaFor(id).label.length, id).toBeGreaterThan(2)
    }
  })

  /**
   * Everything else opens something, so an object that only reports a number could read as
   * broken. The plant and the door are deliberate: they carry state and nothing more, and
   * tapping the plant states the reading rather than doing nothing at all -- silence is what
   * teaches people to stop tapping. The door lost its own outings menu in §7 and has nothing
   * left behind it.
   */
  it('opens something for every object except the ones that only report', () => {
    for (const id of OBJECT_ORDER) {
      const { opens } = metaFor(id)
      if (id === 'plant' || id === 'door') expect(opens, id).toBeNull()
      else expect(opens, id).not.toBeNull()
    }
  })

  // Both are one job: getting what you are carrying into the app.
  it('puts the planner and photo import behind the desk', () => {
    expect(metaFor('desk').opens).toBe('input')
  })

  // Both are the outside world reaching you.
  it('puts the request box and the chat channel behind the phone', () => {
    expect(metaFor('phone').opens).toBe('outsideWorld')
  })

  it('puts calibration and the account behind the mirror', () => {
    expect(metaFor('mirror').opens).toBe('aboutYou')
  })

  /**
   * The order is the keyboard traversal order and the sidebar order at once. Fixed, so
   * neither has to be re-learned; identical, so the two cannot diverge.
   */
  it('has a stable order with no duplicates', () => {
    expect(new Set(OBJECT_ORDER).size).toBe(OBJECT_ORDER.length)
  })

  it('lists the three new objects alongside the nine bindings', () => {
    for (const id of ['desk', 'phone', 'mirror'] as const) {
      expect(OBJECT_ORDER, id).toContain(id)
    }
  })

  it('keeps every one of §1.3s nine bindings', () => {
    for (const id of [
      'ceiling',
      'papers',
      'plant',
      'bed',
      'window',
      'light',
      'door',
      'character',
      CLUTTER_PLACEHOLDER,
    ] as const) {
      expect(OBJECT_ORDER, id).toContain(id)
    }
  })

  // Clutter is one object per task, so the order holds a placeholder the model expands.
  it('holds a placeholder for clutter rather than a fixed number of boxes', () => {
    expect(OBJECT_ORDER).toContain(CLUTTER_PLACEHOLDER)
  })

  it('builds and recognises an id for one clutter box', () => {
    const id = clutterIdFor('laundry')

    expect(isClutterId(id)).toBe(true)
    expect(isClutterId('desk')).toBe(false)
  })

  it('describes a clutter box by the task it holds', () => {
    expect(metaFor(clutterIdFor('laundry')).label.length).toBeGreaterThan(2)
  })

  it('opens a micro-start for a clutter box', () => {
    expect(metaFor(clutterIdFor('laundry')).opens).toBe('microStart')
  })
})
