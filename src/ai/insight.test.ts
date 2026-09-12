import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INSIGHT_REQUEST_TIMEOUT_MS, phraseInsight } from './insight'

/**
 * The one rule this layer exists to keep: the facts are the domain's, and the model only
 * says them better.
 *
 * So every failure returns the computed lines rather than nothing. The block on the Reserves
 * sheet is a reading of the student's own fortnight -- losing it because a network call
 * failed would be the app going quiet about something it already knows, which is worse than
 * a plainer sentence.
 */
const COMPUTED = [
  'People is your thinnest, at 43 — at that level an hour of rest gives back about 69% of what it would at full.',
  'Nothing in the next fortnight takes you below 30.',
]

const ok = (payload: unknown) => ({ ok: true, json: async () => payload }) as unknown as Response

const status = (code: number) => ({ ok: false, status: code }) as unknown as Response

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('phraseInsight', () => {
  it('uses the model wording when the reply says the same number of things', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ lines: ['Warmer one.', 'Warmer two.'] }))

    expect(await phraseInsight(COMPUTED)).toEqual(['Warmer one.', 'Warmer two.'])
  })

  it('sends the computed lines and nothing about the student', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ lines: ['a', 'b'] }))

    await phraseInsight(COMPUTED)

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string) as {
      lines: string[]
    }

    expect(Object.keys(body)).toEqual(['lines'])
    expect(body.lines).toEqual(COMPUTED)
  })

  /** No key configured, which is CI, the tests, and `vite dev` where /api is not served. */
  it('keeps the computed wording when there is no model to ask', async () => {
    vi.mocked(fetch).mockResolvedValue(status(503))

    expect(await phraseInsight(COMPUTED)).toEqual(COMPUTED)
  })

  it('keeps it when the network fails outright', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))

    expect(await phraseInsight(COMPUTED)).toEqual(COMPUTED)
  })

  /** A reply with a line added has invented a claim about somebody's fortnight, which §8.2
   *  forbids however plausible it reads. The whole reply goes, not the extra line. */
  it('refuses a reply that added a claim of its own', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ lines: ['a', 'b', 'and you seem burnt out.'] }))

    expect(await phraseInsight(COMPUTED)).toEqual(COMPUTED)
  })

  it('refuses a reply that quietly dropped a warning', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ lines: ['a'] }))

    expect(await phraseInsight(COMPUTED)).toEqual(COMPUTED)
  })

  /**
   * A stalled connection never rejects. Every answer already falls back, but a request that
   * simply hangs would leave the promise unsettled -- and the block above this would hold a
   * `setState` free to land minutes later over wording the student has long since read.
   */
  it('gives up on a request that never answers, and keeps the computed wording', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch).mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )

    const pending = phraseInsight(COMPUTED)
    await vi.advanceTimersByTimeAsync(INSIGHT_REQUEST_TIMEOUT_MS + 1)

    expect(await pending).toEqual(COMPUTED)
    vi.useRealTimers()
  })

  it('does not call out at all when there is nothing to phrase', async () => {
    expect(await phraseInsight([])).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})
