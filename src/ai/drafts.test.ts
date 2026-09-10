import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RequestCost } from '../domain/requestCost'
import { draftReplies } from './drafts'
import type { ParsedItem } from './types'

const item: ParsedItem = {
  id: 'r1',
  title: 'FYP presentation help',
  type: 'mental',
  kind: 'studyBlock',
  hours: 3,
  deadlineDay: 4,
  fixed: false,
  confident: true,
  repeat: null,
}

const cost: RequestCost = {
  firstDeficitDayBefore: null,
  firstDeficitDayAfter: 14,
  floorBefore: 62,
  floorAfter: 28,
  deepestDrop: 34,
  capacityAfter: 41,
  eveningsEquivalent: 2,
  absorbable: false,
}

const modelReply = {
  drafts: [
    { tone: 'decline', text: 'Thanks for thinking of me, but I have to pass this time.' },
    { tone: 'defer', text: 'I would like to help, but could it wait until next week?' },
    { tone: 'accept', text: 'Happy to help. It will cost me an evening, so I will be tight.' },
  ],
}

const respondWith = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: status === 200, status, json: () => Promise.resolve(body) }),
  )

afterEach(() => vi.unstubAllGlobals())

describe('draftReplies', () => {
  it('uses the model when the endpoint answers', async () => {
    respondWith(200, modelReply)

    const outcome = await draftReplies(item, cost)

    expect(outcome.source).toBe('model')
    expect(outcome.drafts).toHaveLength(3)
  })

  /**
   * The state CI, local development and the demo laptop are all in. Unlike a photograph a
   * decline can honestly be written by rules, so this produces three real drafts rather
   * than an apology.
   */
  it('falls back to templates when the endpoint is unavailable', async () => {
    respondWith(503, {})

    const outcome = await draftReplies(item, cost)

    expect(outcome.source).toBe('fallback')
    expect(outcome.drafts).toHaveLength(3)
  })

  it('falls back when the network fails outright', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const outcome = await draftReplies(item, cost)

    expect(outcome.source).toBe('fallback')
    expect(outcome.drafts).toHaveLength(3)
  })

  // A reply that fails validation is not better than no reply.
  it('falls back when the model returns something malformed', async () => {
    respondWith(200, { drafts: [{ tone: 'sarcastic', text: 'lol no' }] })

    expect((await draftReplies(item, cost)).source).toBe('fallback')
  })

  it('always offers all three tones, whichever path it took', async () => {
    respondWith(503, {})

    expect((await draftReplies(item, cost)).drafts.map((draft) => draft.tone)).toEqual([
      'decline',
      'defer',
      'accept',
    ])
  })

  it('tells the endpoint what was asked and what it costs', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(modelReply),
    })
    vi.stubGlobal('fetch', fetchSpy)

    await draftReplies(item, cost)

    const body = String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body)
    expect(body).toContain('FYP presentation help')
    expect(body).toContain('2')
  })
})
