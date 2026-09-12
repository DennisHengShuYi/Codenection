import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseBrainDump } from './parseBrainDump'

/**
 * The network is stubbed in every case here, and vitest.config.ts blanks the Groq key, so
 * nothing in this file can reach a live model or spend money. .claude/CLAUDE.md forbids
 * testing against a real credential, and a planner test is exactly where that would
 * otherwise creep in.
 */
const respondWith = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: status === 200, status, json: () => Promise.resolve(body) }),
  )

afterEach(() => vi.unstubAllGlobals())

describe('parseBrainDump', () => {
  it('uses the model when the endpoint answers', async () => {
    respondWith(200, {
      items: [{ title: 'Essay', type: 'mental', kind: 'studyBlock', hours: 4, deadlineDay: 3, hard: true }],
    })

    const outcome = await parseBrainDump('essay due wednesday')

    expect(outcome.source).toBe('model')
    expect(outcome.items[0]?.title).toBe('Essay')
  })

  /**
   * The behaviour the whole fallback exists for. No key configured means the endpoint
   * answers 503, which is the normal state in tests, in CI, and under `vite dev` where
   * /api is not served -- and it must produce a week rather than an error.
   */
  it('falls back to rules when the endpoint is unavailable', async () => {
    respondWith(503, {})

    const outcome = await parseBrainDump('gym, laundry')

    expect(outcome.source).toBe('fallback')
    expect(outcome.items).toHaveLength(2)
  })

  it('falls back when the network fails outright', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const outcome = await parseBrainDump('gym, laundry')

    expect(outcome.source).toBe('fallback')
    expect(outcome.items).toHaveLength(2)
  })

  // A reply that fails validation is not better than no reply.
  it('falls back when the model returns something malformed', async () => {
    respondWith(200, { items: [{ title: 'Essay', type: 'invented', hours: 4 }] })

    expect((await parseBrainDump('essay')).source).toBe('fallback')
  })

  // Asserted on the network, not merely on the answer: an empty box should cost nothing.
  it('returns nothing for an empty dump without calling out at all', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const outcome = await parseBrainDump('   ')

    expect(outcome.items).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses an input longer than a brain dump before it becomes a request', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const outcome = await parseBrainDump('x'.repeat(5000))

    expect(outcome.items).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

/**
 * The student's own names, on the path where the names are not theirs.
 *
 * §2.4's narrow rungs group answers by title, and here the title is whatever the model wrote
 * from their sentence: "Gym session" one week, "Workout" the next, each a fresh bucket at
 * zero answers. Nothing fills, and the feature is dead for anyone who does not type their
 * own blocks.
 *
 * Two layers, and this file covers the one that holds. The list is sent to the model, which
 * helps and is only advice; the reply is then snapped onto the names already in use, which
 * is ordinary code and cannot be ignored. See `domain/snapTitle` for the guards.
 */
describe('reading against the names a student already uses', () => {
  const known = [{ title: 'Gym', kind: 'hardExercise' as const }]

  const replying = (title: string) =>
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { title, type: 'physical', kind: 'hardExercise', hours: 1, deadlineDay: 2, startHour: 18, hard: false, confident: true },
        ],
      }),
    })

  it('renames the model’s phrasing to the one already in use', async () => {
    vi.stubGlobal('fetch', replying('Gym session'))

    const outcome = await parseBrainDump('gym tuesday', undefined, known)

    expect(outcome.items[0]?.title).toBe('Gym')
  })

  it('leaves something genuinely new exactly as the model wrote it', async () => {
    vi.stubGlobal('fetch', replying('Rock climbing'))

    const outcome = await parseBrainDump('climbing tuesday', undefined, known)

    expect(outcome.items[0]?.title).toBe('Rock climbing')
  })

  it('sends the names along, so the model can use them itself', async () => {
    const fetched = replying('Gym')
    vi.stubGlobal('fetch', fetched)

    await parseBrainDump('gym tuesday', undefined, known)

    const body = JSON.parse((fetched.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(body.vocabulary).toEqual(['Gym'])
  })

  it('changes nothing when the student has no history to go on', async () => {
    vi.stubGlobal('fetch', replying('Gym session'))

    const outcome = await parseBrainDump('gym tuesday')

    expect(outcome.items[0]?.title).toBe('Gym session')
  })
})
