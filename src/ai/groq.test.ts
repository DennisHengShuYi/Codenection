import { afterEach, describe, expect, it, vi } from 'vitest'
import { askGroq, transcribeAudio } from './groq'

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
  items: [{ title: 'Essay', type: 'mental', kind: 'studyBlock', hours: 4, deadlineDay: 3, hard: true }],
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

/**
 * The transcription half, tested for the same two reasons as `askGroq` above: it is the
 * other place in `src/` that spends a credential, and leaving it uncovered pulls the
 * project below its coverage floor -- which .claude/CLAUDE.md answers with tests rather
 * than a lower number.
 *
 * The key is a fake string and the network is stubbed, so nothing reaches Groq and no
 * request is spent.
 */
describe('transcribeAudio', () => {
  const audio = () => new Blob(['not really audio'], { type: 'audio/ogg' })

  it('returns what came back, trimmed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('  essay due friday  ') }),
    )

    expect(await transcribeAudio(audio(), 'test-key-not-real')).toBe('essay due friday')
  })

  // The key travels in the Authorization header and nowhere else -- not in the URL, where
  // it would end up in logs and referrers.
  it('sends the key in the header and not in the address', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('hi') })
    vi.stubGlobal('fetch', fetchMock)

    await transcribeAudio(audio(), 'test-key-not-real')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).not.toContain('test-key-not-real')
    expect((init.headers as Record<string, string>).authorization).toContain('test-key-not-real')
  })

  it('answers null when the service refuses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: () => Promise.resolve('') }))

    expect(await transcribeAudio(audio(), 'test-key-not-real')).toBeNull()
  })

  // Silence is not an empty brain dump. Null lets the caller say "I heard nothing" rather
  // than offering an empty list to confirm.
  it('answers null for silence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('   ') }))

    expect(await transcribeAudio(audio(), 'test-key-not-real')).toBeNull()
  })

  // A network failure must not escape into the endpoint: the student is told to type it.
  it('answers null rather than throwing when the call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    expect(await transcribeAudio(audio(), 'test-key-not-real')).toBeNull()
  })
})
