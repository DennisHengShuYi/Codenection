import { describe, expect, it } from 'vitest'
import { parseModelReply } from './schema'

const good = {
  items: [
    { title: 'WIA3001 essay', type: 'mental', kind: 'studyBlock', hours: 4, deadlineDay: 5, hard: true },
    { title: 'Laundry', type: 'errands', kind: 'errands', hours: 1, deadlineDay: null, hard: false },
  ],
}

/**
 * The boundary .claude/CLAUDE.md names: untrusted input never becomes trusted by passing
 * through a layer. A model reply is not trusted for having come through our own server,
 * and this is the one place it turns into data the engine will reason with.
 */
describe('parseModelReply', () => {
  it('accepts a well-formed reply', () => {
    const items = parseModelReply(good)

    expect(items).toHaveLength(2)
    expect(items?.[0]?.title).toBe('WIA3001 essay')
  })

  it('gives every item an id, so chips can be edited and removed independently', () => {
    const ids = parseModelReply(good)?.map((item) => item.id)

    expect(new Set(ids).size).toBe(2)
  })

  /**
   * The most valuable test here. A load type the model invented would reach the engine and
   * corrupt every projection from then on, silently -- there is no later layer that would
   * notice.
   */
  it('rejects a load type the model invented', () => {
    expect(parseModelReply({ items: [{ ...good.items[0], type: 'spiritual' }] })).toBeNull()
  })

  it('rejects a reply that is not an object at all', () => {
    expect(parseModelReply('sure, here you go!')).toBeNull()
    expect(parseModelReply(null)).toBeNull()
  })

  it('rejects an item with no title', () => {
    expect(parseModelReply({ items: [{ ...good.items[0], title: '' }] })).toBeNull()
  })

  it('rejects negative or absurd effort', () => {
    expect(parseModelReply({ items: [{ ...good.items[0], hours: -3 }] })).toBeNull()
    expect(parseModelReply({ items: [{ ...good.items[0], hours: 500 }] })).toBeNull()
  })

  it('rejects a deadline outside the horizon', () => {
    expect(parseModelReply({ items: [{ ...good.items[0], deadlineDay: 90 }] })).toBeNull()
  })

  // A runaway reply must not become a runaway week.
  it('rejects a reply with far too many items', () => {
    const items = Array.from({ length: 40 }, () => good.items[0])

    expect(parseModelReply({ items })).toBeNull()
  })

  // Accepted, not rejected: rejecting would send a legitimately empty answer to the
  // fallback for no reason, and the fallback would find nothing either.
  it('accepts an empty list, because a student may type something with nothing in it', () => {
    expect(parseModelReply({ items: [] })).toEqual([])
  })

  // §3.2: nothing enters unconfirmed. Defaulting this way makes that a property of the
  // data rather than a habit of the interface.
  it('marks everything from the model as needing confirmation', () => {
    expect(parseModelReply(good)?.every((item) => item.confident)).toBe(false)
  })

  it('rejects a kind the engine does not have', () => {
    const reply = {
      items: [{ title: 'gym', type: 'physical', kind: 'crossfit', hours: 2, deadlineDay: null, hard: false }],
    }

    expect(parseModelReply(reply)).toBeNull()
  })

  it('keeps a kind the engine does have', () => {
    const reply = {
      items: [{ title: 'gym', type: 'physical', kind: 'hardExercise', hours: 2, deadlineDay: null, hard: false }],
    }

    expect(parseModelReply(reply)?.[0]?.kind).toBe('hardExercise')
  })
})
