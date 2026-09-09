import { describe, expect, it } from 'vitest'
import { parseDraftReply } from './draftSchema'

const good = {
  drafts: [
    { tone: 'decline', text: 'Thanks for thinking of me, but I have to pass this time.' },
    { tone: 'defer', text: 'I would like to help, but could it wait until next week?' },
    { tone: 'accept', text: 'Happy to help. It will cost me an evening, so I will be tight.' },
  ],
}

/**
 * The same boundary the planner's schema guards, applied to drafted text. A reply is not
 * trusted for having come through our own server, and a draft goes straight into a box the
 * student may copy and send without rereading.
 */
describe('parseDraftReply', () => {
  it('accepts a well-formed reply', () => {
    expect(parseDraftReply(good)).toHaveLength(3)
  })

  it('rejects a tone the model invented', () => {
    const drafts = [{ ...good.drafts[0], tone: 'passive-aggressive' }, ...good.drafts.slice(1)]

    expect(parseDraftReply({ drafts })).toBeNull()
  })

  /** The same shape tolerance the planner's schema needed, for the same reason: the
   *  wrapper is our request, and dropping it is the most common way a model deviates. */
  it('accepts a bare array, because models drop the wrapper', () => {
    expect(parseDraftReply(good.drafts)).toHaveLength(3)
  })

  it('still requires all three tones inside a bare array', () => {
    expect(parseDraftReply(good.drafts.slice(0, 2))).toBeNull()
  })

  it('rejects a reply that is not an object at all', () => {
    expect(parseDraftReply('here are three replies!')).toBeNull()
    expect(parseDraftReply(null)).toBeNull()
  })

  it('rejects an empty draft', () => {
    const drafts = [{ tone: 'decline', text: '' }, ...good.drafts.slice(1)]

    expect(parseDraftReply({ drafts })).toBeNull()
  })

  // Three tones, no more and no fewer. A missing one leaves a student without the option
  // §2.3 promised them.
  it('rejects a reply that is not all three tones', () => {
    expect(parseDraftReply({ drafts: good.drafts.slice(0, 2) })).toBeNull()
  })

  it('rejects a reply with the same tone twice', () => {
    expect(parseDraftReply({ drafts: [good.drafts[0], good.drafts[0], good.drafts[1]] })).toBeNull()
  })

  it('rejects text far longer than a message plausibly is', () => {
    const drafts = [{ tone: 'decline', text: 'x'.repeat(3000) }, ...good.drafts.slice(1)]

    expect(parseDraftReply({ drafts })).toBeNull()
  })

  it('returns the tones in the order the student is offered them', () => {
    expect(parseDraftReply(good)?.map((draft) => draft.tone)).toEqual([
      'decline',
      'defer',
      'accept',
    ])
  })
})
