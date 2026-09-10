import { describe, expect, it } from 'vitest'
import { BLOCK_KINDS } from '../engine'
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

  /**
   * Ruling 46. `sleep` is an `ActivityKind` but not a kind a *block* may carry: it enters
   * through `Schedule.sleepByDay` and never as a scheduled activity, which
   * `engine/reachable.test.ts` records as a deliberate decision. `ItemChip` stopped
   * offering it, which narrowed the picker -- and left the boundary still admitting it from
   * a model reply, which is the weaker half of the fix. A sleep block is charged nothing by
   * `drain.ts` while `sleepByDay` counts the same hours again, so it is not a harmless
   * extra: it is a block that quietly does not exist to the model.
   */
  it('rejects a sleep block, which the model may not originate', () => {
    expect(parseModelReply({ items: [{ ...good.items[0], kind: 'sleep' }] })).toBeNull()
  })

  // The rest of the enum must keep working, so the narrowing cannot be mistaken for the
  // whole field being rejected.
  it('still accepts every kind a block may actually carry', () => {
    for (const kind of BLOCK_KINDS) {
      expect(parseModelReply({ items: [{ ...good.items[0], kind }] })).toHaveLength(1)
    }
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

  /**
   * `confident` used to be hardcoded `false` for every model-parsed item, on the grounds
   * of §3.2's "nothing enters unconfirmed". That conflated two different things, and the
   * cost was paid on screen: `ItemChip` renders the flag as "Not sure about this one --
   * check it before adding", which is a claim about *the model's* certainty. With it
   * always false, every row of every photo import was flagged, always -- and a warning
   * that fires on everything is one students learn to tap past, which is precisely the
   * silent-poisoning failure §1.4 exists to prevent.
   *
   * §3.2 is unaffected. Nothing enters unconfirmed because the chips must be accepted
   * before `addItems` ever sees them, which is a property of the flow rather than of this
   * field. So `confident` now means what the interface already claimed it meant.
   */
  it('reports the model’s own confidence rather than flagging every row', () => {
    const mixed = {
      items: [
        { ...good.items[0], title: 'WIA3001 lecture', confident: true },
        { ...good.items[0], title: 'something illegible', confident: false },
      ],
    }

    expect(parseModelReply(mixed)?.map((item) => item.confident)).toEqual([true, false])
  })

  /** A model that omits the field is a model that did not tell us it was sure, and §1.4's
   *  bias is toward flagging. Absent must not take the whole reply down either -- the
   *  parse is all-or-nothing, so a missing optional field would cost every other item. */
  it('treats a missing confidence as unsure rather than rejecting the reply', () => {
    const withoutField = { items: [{ ...good.items[0] }] }

    expect(parseModelReply(withoutField)?.[0]?.confident).toBe(false)
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
