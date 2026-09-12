import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ruleLadder, type Ladder } from '../domain/ladder'
import type { ScheduledItem } from '../optimizer'
import { buildLadder, LADDER_REQUEST_TIMEOUT_MS, replaceRung } from './ladder'

const item: ScheduledItem = {
  id: 'b1',
  title: 'Ethics essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 3,
  intensity: 1,
  dayIndex: 0,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
}

const ok = (payload: unknown) => ({ ok: true, json: async () => payload }) as unknown as Response

const status = (code: number) => ({ ok: false, status: code }) as unknown as Response

const modelSteps = [
  { action: 'Open the ethics essay document.', minutes: 2 },
  { action: 'Write the title.', minutes: 3 },
  { action: 'Write one bad sentence.', minutes: 5 },
]

const sentBody = (call = 0): Record<string, unknown> =>
  JSON.parse(vi.mocked(fetch).mock.calls[call]?.[1]?.body as string) as Record<string, unknown>

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildLadder', () => {
  it('uses the model chain when the endpoint answers', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ steps: modelSteps }))

    const outcome = await buildLadder(item)

    expect(outcome.source).toBe('model')
    expect(outcome.ladder.rungs).toEqual(modelSteps)
    expect(outcome.ladder.blockId).toBe('b1')
    expect(outcome.ladder.done).toBe(0)
  })

  it('sends the block and nothing about the rest of the week', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ steps: modelSteps }))

    await buildLadder(item)

    expect(sentBody()).toEqual({ what: 'Ethics essay', kind: 'studyBlock', hours: 3 })
  })

  // The endpoint only accepts a BLOCK_KINDS value, and `sleep` is not one. Protected rest
  // is also rest to the model, matching what `ruleLadder` does with it.
  it('calls protected rest rest, whatever kind the block carries', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ steps: modelSteps }))

    await buildLadder({ ...item, kind: 'socialRestorative', protectedRest: true })

    expect(sentBody().kind).toBe('rest')
  })

  // Every failure is the same answer, and none of them is an error the student sees. The
  // rule chain is a real answer, not a degraded one.
  it('falls back to the rules when the endpoint is unavailable', async () => {
    vi.mocked(fetch).mockResolvedValue(status(503))

    const outcome = await buildLadder(item)

    expect(outcome.source).toBe('fallback')
    expect(outcome.ladder.rungs).toEqual(ruleLadder(item).rungs)
  })

  it('falls back to the rules when there is no network at all', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))

    expect((await buildLadder(item)).source).toBe('fallback')
  })

  it('falls back to the rules when the reply does not pass the schema', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ steps: [{ action: 'only one', minutes: 2 }] }))

    expect((await buildLadder(item)).source).toBe('fallback')
  })

  it('never throws, whatever the endpoint does', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('not json')
      },
    } as unknown as Response)

    await expect(buildLadder(item)).resolves.toBeDefined()
  })
})

describe('replaceRung', () => {
  const open: Ladder = {
    blockId: 'b1',
    rungs: [
      { action: 'first', minutes: 2 },
      { action: 'second', minutes: 3 },
      { action: 'third', minutes: 4 },
    ],
    done: 1,
  }

  it('swaps only the current rung and leaves the count alone', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ steps: modelSteps }))

    const next = await replaceRung(item, open)

    expect(next.rungs[1]).toEqual(modelSteps[0])
    expect(next.rungs[0]?.action).toBe('first')
    expect(next.rungs[2]?.action).toBe('third')
    expect(next.done).toBe(1)
  })

  it('tells the endpoint what was rejected and what is already done', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ steps: modelSteps }))

    await replaceRung(item, open)

    expect(sentBody().rejected).toBe('second')
    expect(sentBody().soFar).toEqual(['first'])
  })

  // Without a model there is nothing new to say, and re-rolling into the identical rule rung
  // would be a button that visibly does nothing.
  it('leaves the ladder untouched when the model is unavailable', async () => {
    vi.mocked(fetch).mockResolvedValue(status(503))

    expect(await replaceRung(item, open)).toEqual(open)
  })

  it('leaves a finished ladder untouched without calling anything', async () => {
    const finished: Ladder = { ...open, done: 3 }

    expect(await replaceRung(item, finished)).toEqual(finished)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })
})

/**
 * A request that never settles, which is the one failure the old code could not survive.
 *
 * `askEndpoint` caught a rejected fetch and a bad body, so every *answer* fell back to the
 * rule chain. A stalled connection is not an answer: it never rejects, so the promise never
 * settled, `MicroStartPage` never left "Working out where to start." and a student stuck on
 * a task sat looking at a sentence about being stuck. The endpoint's own eight-second bound
 * lives server-side and cannot help here -- it bounds the Groq call inside the function, not
 * the browser's wait on the function.
 *
 * The fallback was always meant to be a genuine equal rather than an apology, so waiting
 * indefinitely for the better half of an either/or is the wrong trade when the other half is
 * sitting in the domain, already written.
 */
describe('when the request never settles', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('falls back to the rule chain rather than waiting for good', async () => {
    // Never resolves and never rejects, exactly like a connection that has stalled.
    vi.mocked(fetch).mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          ;(init?.signal as AbortSignal | undefined)?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }) as Promise<Response>,
    )

    const pending = buildLadder(item)
    await vi.advanceTimersByTimeAsync(LADDER_REQUEST_TIMEOUT_MS + 1)
    const outcome = await pending

    expect(outcome.source).toBe('fallback')
    expect(outcome.ladder.rungs).toEqual(ruleLadder(item).rungs)
  })
})
