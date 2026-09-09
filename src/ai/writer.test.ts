import { afterEach, describe, expect, it, vi } from 'vitest'
import { askWriter } from './writer'

/**
 * The network is stubbed and the key is a fake string, so nothing here reaches Groq or
 * spends anything. This is the third module in src/ that takes a credential, so it gets the
 * same proof the other two do: the key travels in the Authorization header and nowhere else.
 */
const brief = { what: 'FYP presentation help', hours: 3, evenings: 2, deficitDay: 14, absorbable: false }

const reply = (content: string) => ({
  ok: true,
  json: () => Promise.resolve({ choices: [{ message: { content } }] }),
})

const good = JSON.stringify({
  drafts: [
    { tone: 'decline', text: 'Thanks for thinking of me, but I have to pass this time.' },
    { tone: 'defer', text: 'I would like to help, but could it wait until next week?' },
    { tone: 'accept', text: 'Happy to help. It will cost me an evening, so I will be tight.' },
  ],
})

afterEach(() => vi.unstubAllGlobals())

describe('askWriter', () => {
  it('returns the validated drafts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(good)))

    expect(await askWriter(brief, 'test-key-not-real')).toHaveLength(3)
  })

  it('sends the key in the authorization header and nowhere else', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchSpy)

    await askWriter(brief, 'test-key-not-real')

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['authorization']).toContain(
      'test-key-not-real',
    )
    expect(url).not.toContain('test-key-not-real')
    expect(String(init.body)).not.toContain('test-key-not-real')
  })

  it('tells the model what was asked and what it costs', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchSpy)

    await askWriter(brief, 'test-key-not-real')

    expect(String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body)).toContain(
      'FYP presentation help',
    )
  })

  /**
   * The app never declines on anyone's behalf (§2.3), so the model is told to write as the
   * student. A draft in the app's voice is one the student has to rewrite before sending,
   * which defeats the point of drafting it.
   */
  it("tells the model to write in the student's own voice", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchSpy)

    await askWriter(brief, 'test-key-not-real')

    expect(String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body)).toMatch(
      /first person|as the student|your own voice/i,
    )
  })

  it('gives up when the API refuses the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))

    expect(await askWriter(brief, 'test-key-not-real')).toBeNull()
  })

  it('gives up when the reply carries no content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }))

    expect(await askWriter(brief, 'test-key-not-real')).toBeNull()
  })

  it('gives up when the model answers in prose', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply('Sure, here are three replies!')))

    expect(await askWriter(brief, 'test-key-not-real')).toBeNull()
  })

  it('gives up when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    expect(await askWriter(brief, 'test-key-not-real')).toBeNull()
  })

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

    const pending = askWriter(brief, 'test-key-not-real')
    await vi.advanceTimersByTimeAsync(8000)

    expect(await pending).toBeNull()
    vi.useRealTimers()
  })
})
