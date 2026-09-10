import { afterEach, describe, expect, it, vi } from 'vitest'
import { BLOCK_KINDS } from '../engine'
import { askVision } from './vision'

/**
 * The network is stubbed and the key is a fake string, so nothing here reaches Groq or
 * spends anything. This is one of only two modules in src/ that takes a credential, so the
 * "key travels in the Authorization header and nowhere else" property is proved rather than
 * assumed -- the same check groq.test.ts makes.
 */
const PHOTO = 'data:image/jpeg;base64,AAAA'

const reply = (content: string) => ({
  ok: true,
  json: () => Promise.resolve({ choices: [{ message: { content } }] }),
})

const good = JSON.stringify({
  items: [
    { title: 'WIA3001 report', type: 'mental', kind: 'studyBlock', hours: 8, deadlineDay: 9, hard: true },
  ],
})

afterEach(() => vi.unstubAllGlobals())

describe('askVision', () => {
  it('returns the validated items a photo produced', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(good)))

    const items = await askVision(PHOTO, 'test-key-not-real')

    expect(items).toHaveLength(1)
    expect(items?.[0]?.title).toBe('WIA3001 report')
  })

  // A key in a URL lands in logs and referrers; in a body it is echoed by anything that
  // logs a request.
  it('sends the key in the authorization header and nowhere else', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchSpy)

    await askVision(PHOTO, 'test-key-not-real')

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['authorization']).toContain(
      'test-key-not-real',
    )
    expect(url).not.toContain('test-key-not-real')
    expect(String(init.body)).not.toContain('test-key-not-real')
  })

  it('sends the photo itself', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchSpy)

    await askVision(PHOTO, 'test-key-not-real')

    expect(String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body)).toContain(PHOTO)
  })

  /**
   * Shared with the planner on purpose. One schema means a vision reply cannot quietly
   * become the unvalidated path by drifting away from a second copy of the rules.
   */
  it('gives up when the reply fails the planner schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(reply(JSON.stringify({ items: [{ title: 'x', type: 'made-up' }] }))),
    )

    expect(await askVision(PHOTO, 'test-key-not-real')).toBeNull()
  })

  it('gives up when the model answers in prose', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply('I can see an assignment brief!')))

    expect(await askVision(PHOTO, 'test-key-not-real')).toBeNull()
  })

  it('gives up when the API refuses the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 413 }))

    expect(await askVision(PHOTO, 'test-key-not-real')).toBeNull()
  })

  it('gives up when the reply carries no content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }))

    expect(await askVision(PHOTO, 'test-key-not-real')).toBeNull()
  })

  it('gives up when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    expect(await askVision(PHOTO, 'test-key-not-real')).toBeNull()
  })

  /**
   * §10, constraint 3. The budget is larger than the planner's because an image is far more
   * to process, but it exists: a model that accepts the photo and never answers would hold
   * the screen open forever, which is worse than no feature -- the student cannot even fall
   * back to typing.
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

    const pending = askVision(PHOTO, 'test-key-not-real')
    await vi.advanceTimersByTimeAsync(20000)

    expect(await pending).toBeNull()
    vi.useRealTimers()
  })

  /**
   * The prompt line that matters most. A model filling in a plausible deadline produces
   * exactly the silent poisoning §1.4 exists to prevent, and it is the failure a student is
   * least able to debug -- so the instruction is asserted rather than trusted to survive an
   * edit.
   */
  it('tells the model never to invent what is not in the picture', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchSpy)

    await askVision(PHOTO, 'test-key-not-real')

    expect(String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body)).toMatch(
      /never invent/i,
    )
  })

  /**
   * Ruling 46. The prompt used to offer `sleep` in its kind enum while the boundary
   * accepted it too; now the boundary rejects it, and a prompt that still asked for it
   * would turn one nap into a REJECTED WHOLE REPLY -- `parseModelReply` is all-or-nothing,
   * so every other item in the same answer would be lost with it. The prompt and the
   * schema have to be narrowed together, and this is what says so.
   */
  it('does not ask the model for a kind the boundary would reject', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchSpy)

    await askVision(PHOTO, 'test-key-not-real')

    const body = String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body)
    for (const kind of BLOCK_KINDS) expect(body).toContain(kind)
    expect(body).not.toContain('sleep')
  })
})
