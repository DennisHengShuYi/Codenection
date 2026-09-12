import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

// These tests drive the real public/sw.js rather than a copy of its logic. The service
// worker is registered as a classic worker (see registerServiceWorker.ts), so it is served
// verbatim out of public/ and cannot import from src/ -- which means a tested duplicate
// here would be free to drift from the file that actually ships. Loading the real source
// and invoking its handlers is the only way this suite can prove anything about production.

// Resolved from the project root rather than import.meta.url: the suite runs in a jsdom
// environment, where import.meta.url is an http URL that readFileSync will not accept.
const SW_SOURCE = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

const ORIGIN = 'https://app.test'

type Listener = (event: unknown) => void

interface FakeResponse {
  ok: boolean
  status: number
  type: string
  clone: () => FakeResponse
  body: string
}

function response(body: string, { ok = true, status = 200, type = 'basic' } = {}): FakeResponse {
  const value: FakeResponse = { ok, status, type, body, clone: () => value }
  return value
}

interface WorkerOptions {
  /** What the network returns. Ignored when `networkFails` is set. */
  networkResponse?: FakeResponse
  /** Simulates being offline, so the worker's fallback path is exercised. */
  networkFails?: boolean
  /** What `caches.match` finds. Undefined means an empty cache. */
  cached?: FakeResponse
}

interface FetchResult {
  respondedWith: boolean
  body: string | undefined
  wentToNetwork: boolean
}

/**
 * Runs public/sw.js with fake service-worker globals and returns handles for driving it.
 * `stored` records every URL the worker asks the Cache API to keep, which is what most of
 * the assertions below are really about.
 */
function loadServiceWorker(options: WorkerOptions = {}) {
  const { networkResponse = response('from the network'), networkFails = false, cached } = options

  const listeners = new Map<string, Listener>()
  const stored: string[] = []
  let networkCalls = 0

  const cache = {
    addAll: async () => undefined,
    // The real Cache API rejects any scheme that is not http(s). Reproducing that here is
    // the whole point: without it a worker that "successfully" caches a chrome-extension
    // request would look fine in this suite and throw in a real browser.
    put: async (request: string | { url: string }, _response: FakeResponse) => {
      const href = typeof request === 'string' ? new URL(request, ORIGIN).href : request.url
      const scheme = new URL(href).protocol
      if (scheme !== 'http:' && scheme !== 'https:') {
        throw new TypeError(
          `Failed to execute 'put' on 'Cache': Request scheme '${scheme.replace(':', '')}' is unsupported`,
        )
      }
      stored.push(href)
    },
  }

  const caches = {
    open: async () => cache,
    match: async () => cached,
    keys: async () => [],
    delete: async () => true,
  }

  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
    location: { origin: ORIGIN },
  }

  const fetchImpl = async () => {
    networkCalls += 1
    if (networkFails) throw new TypeError('Failed to fetch')
    return networkResponse
  }

  // `new Function` on purpose, and only here: the service worker ships as a plain script
  // that no bundler processes, so the only way to test the real file is to evaluate the real
  // file. The source is read from disk in this repository, not from anywhere a caller could
  // influence.
  //
  // A comment rather than an `eslint-disable`, since there is no ESLint in this project to
  // disable -- see the effects in `ui/room/RoomShell.tsx` for why.
  new Function('self', 'caches', 'fetch', SW_SOURCE)(self, caches, fetchImpl)

  return {
    stored: () => stored,
    fetchEvent: async (
      url: string,
      { method = 'GET', mode = 'no-cors' } = {},
    ): Promise<FetchResult> => {
      const handler = listeners.get('fetch')
      if (!handler) throw new Error('the worker registered no fetch handler')

      const before = networkCalls
      let responded: Promise<FakeResponse | undefined> | undefined
      handler({
        request: { method, url, mode },
        respondWith: (value: Promise<FakeResponse | undefined>) => {
          responded = value
        },
        waitUntil: () => undefined,
      })

      const result = responded ? await responded : undefined
      // Let the worker's own detached cache write settle before the assertion reads the
      // store, and surface any rejection it produced rather than letting it become an
      // unhandled promise the way the reported bug did.
      await new Promise((r) => setTimeout(r, 0))

      return {
        respondedWith: responded !== undefined,
        body: result?.body,
        wentToNetwork: networkCalls > before,
      }
    },
  }
}

describe('the service worker decides what it may cache', () => {
  let unhandled: unknown[]

  beforeEach(() => {
    unhandled = []
    const onRejection = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onRejection)
    return () => process.off('unhandledRejection', onRejection)
  })

  it('never caches a browser-extension request', async () => {
    // The originally reported bug: an extension's GET reached cache.put, which rejects on
    // any scheme that is not http(s), and surfaced as an uncaught console error.
    const worker = loadServiceWorker()

    await worker.fetchEvent('chrome-extension://abcdefghijklmnop/inject.js')

    expect(worker.stored()).toEqual([])
  })

  /**
   * The bug this pair exists to stop, reported as "the calendar link keeps expiring".
   *
   * `/api/google-connect?begin=1` is a same-origin GET that is not a navigation, so it fell
   * into the cache-first branch below. The first press stored the JSON naming a consent URL,
   * and that URL carries a `state` signed at that exact moment and valid for ten minutes.
   * Every later press was then answered from the cache with the *first* press's state --
   * so the connection failed with "That calendar link has expired" from ten minutes after
   * the first attempt onwards, permanently, and signing out changed nothing because the
   * Cache API is keyed by origin and not by session.
   *
   * The worker already refused to cache cross-origin API reads for exactly this reason. The
   * hole was that this app's own API is same-origin: the functions in `api/` are served from
   * the same Vercel domain as the shell, so the rule that named the hazard did not cover the
   * place it actually happened.
   */
  it("never caches a request to this app's own API", async () => {
    const worker = loadServiceWorker()

    await worker.fetchEvent(`${ORIGIN}/api/google-connect?begin=1`)

    expect(worker.stored()).toEqual([])
  })

  it('never answers an API read from the cache, however full the cache is', async () => {
    // The half that actually broke the calendar. Refusing to *write* is not enough on its
    // own: a cache already filled by the previous version of this worker would go on being
    // served ahead of the network forever, so the read side has to decline it too.
    //
    // Asserted as "the worker does not respond" rather than "the worker fetched", because
    // declining is precisely the mechanism: `return` from the fetch handler hands the
    // request back to the browser, which performs a normal uncached fetch the worker never
    // sees. A worker that fetched on the app's behalf here would pass an assertion about
    // network calls while still sitting in a path this file is trying to keep it out of.
    const worker = loadServiceWorker({
      cached: response('a stale consent url from hours ago'),
      networkResponse: response('a consent url signed just now'),
    })

    const result = await worker.fetchEvent(`${ORIGIN}/api/google-connect?begin=1`)

    expect(result.respondedWith).toBe(false)
    expect(result.body).toBeUndefined()
  })

  /** The exclusion is the API prefix and nothing wider: the hashed assets the shell needs
   *  must still be served from the cache, or an offline open shows a blank page. */
  it('still caches a fingerprinted asset', async () => {
    const worker = loadServiceWorker()

    await worker.fetchEvent(`${ORIGIN}/assets/index-a1b2c3d4.js`)

    expect(worker.stored()).toEqual([`${ORIGIN}/assets/index-a1b2c3d4.js`])
  })

  it('never caches a cross-origin request', async () => {
    // A cache-first worker that stores API reads serves them from the cache forever, so a
    // live projection would quietly show yesterday's numbers until the cache name changed.
    const worker = loadServiceWorker({ networkResponse: response('{"reserve":42}') })

    await worker.fetchEvent('https://project.supabase.co/rest/v1/blocks?select=*')

    expect(worker.stored()).toEqual([])
  })

  it('never caches an unsuccessful response', async () => {
    // Caching a 404 under a cache-first strategy makes the failure permanent.
    const worker = loadServiceWorker({
      networkResponse: response('Not found', { ok: false, status: 404 }),
    })

    await worker.fetchEvent(`${ORIGIN}/favicon.ico`)

    expect(worker.stored()).toEqual([])
  })

  it('caches a successful same-origin asset', async () => {
    // The guards above must not cost the worker its actual job.
    const worker = loadServiceWorker()

    await worker.fetchEvent(`${ORIGIN}/assets/index-abc123.js`)

    expect(worker.stored()).toEqual([`${ORIGIN}/assets/index-abc123.js`])
  })

  it('leaves a non-GET request entirely alone', async () => {
    const worker = loadServiceWorker()

    const { respondedWith } = await worker.fetchEvent(`${ORIGIN}/api/session`, { method: 'POST' })

    expect(respondedWith).toBe(false)
    expect(worker.stored()).toEqual([])
  })

  it('produces no unhandled rejection for a request it refuses to cache', async () => {
    const worker = loadServiceWorker()

    await worker.fetchEvent('chrome-extension://abcdefghijklmnop/inject.js')
    await new Promise((r) => setTimeout(r, 0))

    expect(unhandled).toEqual([])
  })
})

describe('the service worker keeps the app shell fresh', () => {
  // The failure these cover, seen in production: index.html was cached first and served
  // ahead of the network, so after a deploy the browser was handed an old shell naming
  // hashed bundles the new build had already deleted -- `index-BzvOMcrj.js 404`, and a
  // blank app. A shell that references content-hashed assets can never be cache-first.

  it('serves a navigation from the network even when a copy is cached', async () => {
    const worker = loadServiceWorker({
      networkResponse: response('the new shell'),
      cached: response('the stale shell'),
    })

    const result = await worker.fetchEvent(`${ORIGIN}/`, { mode: 'navigate' })

    expect(result.wentToNetwork).toBe(true)
    expect(result.body).toBe('the new shell')
  })

  it('refreshes the stored shell on every successful navigation', async () => {
    // Storing it under /index.html rather than the visited URL keeps one shell entry for
    // the whole single-page app, instead of one per deep link the user happens to open.
    const worker = loadServiceWorker({ networkResponse: response('the new shell') })

    await worker.fetchEvent(`${ORIGIN}/some/deep/link`, { mode: 'navigate' })

    expect(worker.stored()).toEqual([`${ORIGIN}/index.html`])
  })

  it('falls back to the cached shell when the network is gone', async () => {
    // The offline promise still has to hold: an installed app must open, not show the
    // browser's error page.
    const worker = loadServiceWorker({ networkFails: true, cached: response('the last shell') })

    const result = await worker.fetchEvent(`${ORIGIN}/`, { mode: 'navigate' })

    expect(result.body).toBe('the last shell')
  })

  it('still serves a cached asset without the network', async () => {
    // Hashed assets stay cache-first: their URL changes whenever their content does, so a
    // cached copy can never be stale.
    const worker = loadServiceWorker({ cached: response('cached bundle') })

    const result = await worker.fetchEvent(`${ORIGIN}/assets/index-abc123.js`)

    expect(result.wentToNetwork).toBe(false)
    expect(result.body).toBe('cached bundle')
  })
})
