import { afterEach, describe, expect, it, vi } from 'vitest'
import { askLadder, type LadderBrief } from './ladderWriter'

/**
 * The network is stubbed and the key is a fake string, so nothing here reaches Groq or spends
 * anything. This is the fourth module in src/ that takes a credential, so it gets the same
 * proof the other three do: the key travels in the Authorization header and nowhere else.
 */
const brief: LadderBrief = { what: 'Ethics essay', kind: 'studyBlock', hours: 3 }

const reply = (content: string) => ({
  ok: true,
  json: () => Promise.resolve({ choices: [{ message: { content } }] }),
})

const good = JSON.stringify({
  steps: [
    { action: 'Open the ethics essay document.', minutes: 2 },
    { action: 'Write the title.', minutes: 3 },
    { action: 'Write one bad sentence.', minutes: 5 },
  ],
})

const bodyOf = (spy: ReturnType<typeof vi.fn>): string =>
  String((spy.mock.calls[0] as [string, RequestInit])[1].body)

afterEach(() => vi.unstubAllGlobals())

describe('askLadder', () => {
  it('returns the validated chain', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(good)))

    expect(await askLadder(brief, 'test-key-not-real')).toHaveLength(3)
  })

  it('sends the key in the authorization header and nowhere else', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchSpy)

    await askLadder(brief, 'test-key-not-real')

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['authorization']).toContain('test-key-not-real')
    expect(url).not.toContain('test-key-not-real')
    expect(String(init.body)).not.toContain('test-key-not-real')
  })

  it('tells the model which task it is about', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchSpy)

    await askLadder(brief, 'test-key-not-real')

    expect(bodyOf(fetchSpy)).toContain('Ethics essay')
    expect(bodyOf(fetchSpy)).toContain('studyBlock')
  })

  // §4.1's constraint, stated to the model rather than only enforced afterwards. Enforcing
  // it only in the schema would mean throwing away a whole chain over one long step.
  it('states the time box and the never-a-smaller-version rule in the prompt', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchSpy)

    await askLadder(brief, 'test-key-not-real')

    expect(bodyOf(fetchSpy)).toContain('1 to 10')
    expect(bodyOf(fetchSpy)).toContain('still the essay')
  })

  // §5.1: recovery is structurally protected, and the model is told so directly rather than
  // being left to guess that "rest" is a task like any other.
  it('tells the model never to ask somebody to finish their rest', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchSpy)

    await askLadder(brief, 'test-key-not-real')

    expect(bodyOf(fetchSpy)).toContain('lowers the bar to resting')
  })

  it('passes on what was rejected and what is already done', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchSpy)

    await askLadder({ ...brief, rejected: 'Write the title.', soFar: ['Open the document.'] }, 'k')

    expect(bodyOf(fetchSpy)).toContain('did not fit')
    expect(bodyOf(fetchSpy)).toContain('Already done: Open the document.')
  })

  it('says nothing about progress when there is none', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchSpy)

    await askLadder({ ...brief, soFar: [] }, 'k')

    expect(bodyOf(fetchSpy)).not.toContain('Already done')
  })

  // Every failure is one answer -- no chain -- and the client turns that into the rule
  // chain. None of them is an error the student is shown.
  it('answers with nothing when the model refuses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))

    expect(await askLadder(brief, 'k')).toBeNull()
  })

  it('answers with nothing when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    expect(await askLadder(brief, 'k')).toBeNull()
  })

  /**
   * §10's third constraint. The whole point of this feature is somebody who cannot start,
   * and leaving them watching a spinner behind a model that never answers is worse than
   * handing them the rule chain -- which is what the null triggers.
   */
  it('gives up rather than hanging on a model that never answers', async () => {
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

    const pending = askLadder(brief, 'k')
    await vi.advanceTimersByTimeAsync(9000)

    expect(await pending).toBeNull()
    vi.useRealTimers()
  })

  it('answers with nothing when the reply carries no content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }))

    expect(await askLadder(brief, 'k')).toBeNull()
  })

  it('answers with nothing when the content is not JSON the model closed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply('{"steps":[')))

    expect(await askLadder(brief, 'k')).toBeNull()
  })

  // The same schema the client uses, applied here so a malformed chain never travels one
  // hop further into the app.
  it('answers with nothing when the chain is too short to be one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(JSON.stringify({ steps: [] }))))

    expect(await askLadder(brief, 'k')).toBeNull()
  })

  it('answers with nothing when a step breaks the time box', async () => {
    const overrun = JSON.stringify({
      steps: [
        { action: 'Open it.', minutes: 2 },
        { action: 'Write the title.', minutes: 3 },
        { action: 'Write the whole thing.', minutes: 45 },
      ],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(overrun)))

    expect(await askLadder(brief, 'k')).toBeNull()
  })
})
