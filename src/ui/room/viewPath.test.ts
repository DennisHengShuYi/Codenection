import { describe, expect, it } from 'vitest'
import {
  ROOM,
  fromPath,
  isAscent,
  toAdd,
  toBlock,
  toEditBlock,
  toMicroStart,
  toNewBlock,
  toPath,
  toNotices,
  toRebalance,
  toRest,
  toReserves,
  toToday,
  toSettings,
  toWeek,
  type View,
} from './view'

/**
 * The address, as a projection of `View`.
 *
 * `View` stays the single source of truth -- these two functions only say what each of its
 * values is called in the address bar and how to read one back. They are pure and total on
 * purpose: everything the router does that is hard to test (history, popstate, a live
 * `window`) lives in `useUrlView`, and everything that is easy to get wrong (a block id
 * with a slash in it, an unknown path) lives here where it can be tabulated.
 */
const TABLE: readonly { readonly path: string; readonly view: View }[] = [
  { path: '/', view: ROOM },
  { path: '/week', view: toWeek() },
  { path: '/week/block/essay', view: toBlock('essay') },
  { path: '/week/rebalance', view: toRebalance() },
  { path: '/week/block/essay/edit', view: toEditBlock('essay') },
  { path: '/week/new/3', view: toNewBlock(3) },
  { path: '/settings', view: toSettings() },
  { path: '/reserves', view: toReserves() },
  { path: '/notices', view: toNotices() },
  { path: '/today', view: toToday() },
  { path: '/add', view: toAdd() },
  { path: '/add/photo', view: toAdd('photo') },
  { path: '/add/type', view: toAdd('type') },
  { path: '/add/request', view: toAdd('request') },
  { path: '/rest', view: toRest() },
]

describe('the address a view is written to', () => {
  for (const { path, view } of TABLE) {
    it(`writes ${JSON.stringify(view)} as ${path}`, () => {
      expect(toPath(view)).toBe(path)
    })

    it(`reads ${path} back as ${JSON.stringify(view)}`, () => {
      expect(fromPath(path)).toEqual(view)
    })
  }

  /**
   * A block id is a free-form string -- the planner derives one from what the student
   * typed -- so an id carrying a slash would otherwise write a path with an extra segment
   * in it and read back as a different block, or as no block at all.
   */
  it.each(['a/b', 'two words', '100%', 'q?x=1', '#hash'])(
    'survives the round trip with %s as the block id',
    (itemId) => {
      expect(fromPath(toPath(toBlock(itemId)))).toEqual(toBlock(itemId))
    },
  )

  it('reads a path it does not know as the room, rather than throwing', () => {
    expect(fromPath('/nowhere')).toEqual(ROOM)
    expect(fromPath('/add/sideways')).toEqual(ROOM)
    expect(fromPath('/week/block')).toEqual(ROOM)
    expect(fromPath('')).toEqual(ROOM)
  })

  /**
   * A trailing slash is what a browser leaves behind when someone edits the address by
   * hand, and `/week/` naming nothing would drop the student into the room for a
   * difference they cannot see.
   */
  it('ignores a trailing slash', () => {
    expect(fromPath('/week/')).toEqual(toWeek())
    expect(fromPath('/add/photo/')).toEqual(toAdd('photo'))
  })
})

/**
 * The predicate behind push-versus-replace. Descending pushes, so Back steps down one
 * level; ascending replaces, because a Cancel that pushed would leave Back walking the
 * student FORWARD into the flow they just left.
 */
describe('ascending', () => {
  it('is true when closing a sub-flow back to the chooser', () => {
    expect(isAscent(toAdd('photo'), toAdd())).toBe(true)
  })

  it('is true when closing a sheet to the room', () => {
    expect(isAscent(toSettings(), ROOM)).toBe(true)
    expect(isAscent(toReserves(), ROOM)).toBe(true)
    expect(isAscent(toNotices(), ROOM)).toBe(true)
    expect(isAscent(toAdd('type'), ROOM)).toBe(true)
  })

  it('is true when closing a block back to the week it was opened from', () => {
    expect(isAscent(toBlock('essay'), toWeek())).toBe(true)
  })

  it('is false when opening something', () => {
    expect(isAscent(ROOM, toSettings())).toBe(false)
    expect(isAscent(toAdd(), toAdd('photo'))).toBe(false)
    expect(isAscent(toWeek(), toBlock('essay'))).toBe(false)
  })

  /**
   * Sideways is not ascent. `/settings` is not inside `/add`, so going from one to the
   * other is a new place rather than a step back out of one -- and Back should return to
   * where you were.
   */
  it('is false between two unrelated places', () => {
    expect(isAscent(toSettings(), toAdd())).toBe(false)
    expect(isAscent(toAdd(), toSettings())).toBe(false)
    expect(isAscent(toWeek(), toSettings())).toBe(false)
  })

  it('is false when nothing moves', () => {
    expect(isAscent(toAdd('photo'), toAdd('photo'))).toBe(false)
    expect(isAscent(ROOM, ROOM)).toBe(false)
  })

  /**
   * `/add` must not count as an ancestor of `/added-something` on a string prefix alone.
   * Nothing generates that path today; this is the guard that keeps the predicate
   * segment-wise if one ever appears.
   */
  it('compares whole segments rather than string prefixes', () => {
    expect(isAscent({ kind: 'week' }, { kind: 'room' })).toBe(true)
    expect(fromPath('/weekend')).toEqual(ROOM)
  })
})

/**
 * The day index in `/week/new/<day>` is the one number in the whole address space a person
 * can type, so it is the one that has to be checked rather than trusted -- a form opened
 * onto day 99 would render a picker over a day that does not exist.
 */
describe('addresses that name nothing real', () => {
  it('reads a day outside the fortnight as the room', () => {
    expect(fromPath('/week/new/99')).toEqual(ROOM)
  })

  it('reads a day that is not a number as the room', () => {
    expect(fromPath('/week/new/tuesday')).toEqual(ROOM)
  })

  it('reads a negative day as the room', () => {
    expect(fromPath('/week/new/-1')).toEqual(ROOM)
  })

  it('reads an unknown fourth segment under a block as the room', () => {
    expect(fromPath('/week/block/essay/delete')).toEqual(ROOM)
  })
})

describe('ascending out of the new doors', () => {
  it('is true when closing a proposal back to the week', () => {
    expect(isAscent(toRebalance(), toWeek())).toBe(true)
  })

  it('is true when closing an edit form back to its block', () => {
    expect(isAscent(toEditBlock('essay'), toBlock('essay'))).toBe(true)
  })

  it('is false when opening an edit form from a block', () => {
    expect(isAscent(toBlock('essay'), toEditBlock('essay'))).toBe(false)
  })
})

describe('the micro-start address', () => {
  it('sits under the block it is about', () => {
    expect(toPath(toMicroStart('b1'))).toBe('/week/block/b1/start')
  })

  it('round-trips through the address', () => {
    expect(fromPath('/week/block/b1/start')).toEqual({ kind: 'microStart', itemId: 'b1' })
  })

  // Ids are free-form -- the planner derives one from whatever the student typed -- so an
  // unencoded slash would write a path with an extra segment in it.
  it('encodes an id with a slash in it', () => {
    const view = toMicroStart('a/b')

    expect(toPath(view)).toBe('/week/block/a%2Fb/start')
    expect(fromPath(toPath(view))).toEqual(view)
  })

  it('is a descent from the block, so Back does not walk forward into it', () => {
    expect(isAscent(toBlock('b1'), toMicroStart('b1'))).toBe(false)
    expect(isAscent(toMicroStart('b1'), toBlock('b1'))).toBe(true)
  })

  it('does not confuse the edit form or an unknown leaf with the page', () => {
    expect(fromPath('/week/block/b1/edit')).toEqual(toEditBlock('b1'))
    expect(fromPath('/week/block/b1/elsewhere')).toEqual(ROOM)
  })
})
