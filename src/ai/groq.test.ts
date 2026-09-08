import { afterEach, describe, expect, it, vi } from 'vitest'
import { askGroq } from './groq'

/**
 * Added beyond the approved test plan, which had listed this function as a deliberate gap.
 * Two reasons changed that: it is the only code in `src/` holding a credential, so the
 * "the key travels in the Authorization header and nowhere else" property is worth
 * asserting rather than assuming; and leaving it untested would have pulled coverage below
 * the project's floor, which .claude/CLAUDE.md says is answered with tests rather than a
 * lower number.
 *
 * The key used here is a fake string and the network is stubbed, so nothing reaches Groq.
 */
const reply = (content: string) => ({
  ok: true,
  json: () => Promise.resolve({ choices: [{ message: { content } }] }),
})

const good = JSON.stringify({
  items: [{ title: 'Essay', type: 'mental', hours: 4, deadlineDay: 3, hard: true }],
})

afterEach(() => vi.unstubAllGlobals())

describe('askGroq', () => {
  it('returns the validated items from a good reply', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(good)))

    const items = await askGroq('essay due wednesday', 'test-key-not-real')

    expect(items).toHaveLength(1)
    expect(items?.[0]?.title).toBe('Essay')
  })

  // The credential's one safe channel. A key in the URL lands in logs and referrers.
  it('sends the key in the authorization header and nowhere else', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchSpy)

    await askGroq('essay', 'test-key-not-real')

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['authorization']).toContain(
      'test-key-not-real',
    )
    expect(url).not.toContain('test-key-not-real')
    expect(String(init.body)).not.toContain('test-key-not-real')
  })

  it('sends the student text as the user message', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchSpy)

    await askGroq('essay due wednesday', 'test-key-not-real')

    expect(String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body)).toContain(
      'essay due wednesday',
    )
  })

  it('gives up when the API refuses the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))

    expect(await askGroq('essay', 'test-key-not-real')).toBeNull()
  })

  it('gives up when the reply carries no content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }))

    expect(await askGroq('essay', 'test-key-not-real')).toBeNull()
  })

  // The model ignoring "JSON only" and answering in prose.
  it('gives up when the content is not JSON at all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply('sure, here you go!')))

    expect(await askGroq('essay', 'test-key-not-real')).toBeNull()
  })

  it('gives up when the content is JSON but fails validation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(JSON.stringify({ items: 'nope' }))))

    expect(await askGroq('essay', 'test-key-not-real')).toBeNull()
  })

  it('gives up when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    expect(await askGroq('essay', 'test-key-not-real')).toBeNull()
  })

  /**
   * §10's third constraint: the call is time-boxed. A model that accepts the request and
   * then never answers would otherwise hold the confirm screen open indefinitely, which is
   * worse than no model at all -- the student cannot even fall back to typing.
   */
  it('gives up on a model that never answers, rather than hanging', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
          }),
      ),
    )

    const pending = askGroq('essay', 'test-key-not-real')
    await vi.advanceTimersByTimeAsync(8000)

    expect(await pending).toBeNull()
    vi.useRealTimers()
  })
})
