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
  const value: FakeResponse = {
    ok,
    status,
    type,
    body,
    clone: () => value,
  }
  return value
}

interface Harness {
  fetchEvent: (url: string, method?: string) => Promise<{ respondedWith: boolean }>
  cached: () => string[]
  networkResponse: FakeResponse
}

/**
 * Runs public/sw.js with fake service-worker globals and returns handles for driving it.
 * `cacheStore` records every URL the worker asks the Cache API to store, which is what the
 * assertions below are really about.
 */
function loadServiceWorker(networkResponse: FakeResponse): Harness {
  const listeners = new Map<string, Listener>()
  const cacheStore: string[] = []

  const cache = {
    addAll: async () => undefined,
    // The real Cache API rejects any scheme that is not http(s). Reproducing that here is
    // the whole point: without it a worker that "successfully" caches a chrome-extension
    // request would look fine in this suite and throw in a real browser.
    put: async (request: { url: string }) => {
      const scheme = new URL(request.url).protocol
      if (scheme !== 'http:' && scheme !== 'https:') {
        throw new TypeError(`Failed to execute 'put' on 'Cache': Request scheme '${scheme.replace(':', '')}' is unsupported`)
      }
      cacheStore.push(request.url)
    },
  }

  const caches = {
    open: async () => cache,
    match: async () => undefined,
    keys: async () => [],
    delete: async () => true,
  }

  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
    location: { origin: ORIGIN },
  }

  const fetchImpl = async () => networkResponse

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('self', 'caches', 'fetch', SW_SOURCE)(self, caches, fetchImpl)

  return {
    networkResponse,
    cached: () => cacheStore,
    fetchEvent: async (url: string, method = 'GET') => {
      const handler = listeners.get('fetch')
      if (!handler) throw new Error('the worker registered no fetch handler')

      let responded: Promise<unknown> | undefined
      handler({
        request: { method, url },
        respondWith: (value: Promise<unknown>) => {
          responded = value
        },
        waitUntil: () => undefined,
      })

      // Let the worker's own detached cache write settle before the assertion reads the
      // store, and surface any rejection it produced rather than letting it become an
      // unhandled promise the way the reported bug did.
      if (responded) await responded
      await new Promise((resolve) => setTimeout(resolve, 0))

      return { respondedWith: responded !== undefined }
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
    // The reported bug: an extension's GET reached cache.put, which rejects on any scheme
    // that is not http(s), and the rejection surfaced as an uncaught console error.
    const worker = loadServiceWorker(response('from an extension'))

    await worker.fetchEvent('chrome-extension://abcdefghijklmnop/inject.js')

    expect(worker.cached()).toEqual([])
  })

  it('never caches a cross-origin request', async () => {
    // A cache-first worker that stores API reads serves them from the cache forever, so a
    // live projection would quietly show yesterday's numbers until the cache name changed.
    const worker = loadServiceWorker(response('{"reserve":42}'))

    await worker.fetchEvent('https://project.supabase.co/rest/v1/blocks?select=*')

    expect(worker.cached()).toEqual([])
  })

  it('never caches an unsuccessful response', async () => {
    // Caching a 404 under a cache-first strategy makes the failure permanent.
    const worker = loadServiceWorker(response('Not found', { ok: false, status: 404 }))

    await worker.fetchEvent(`${ORIGIN}/favicon.ico`)

    expect(worker.cached()).toEqual([])
  })

  it('caches a successful same-origin response', async () => {
    // The guards above must not cost the worker its actual job.
    const worker = loadServiceWorker(response('<!doctype html>'))

    await worker.fetchEvent(`${ORIGIN}/index.html`)

    expect(worker.cached()).toEqual([`${ORIGIN}/index.html`])
  })

  it('leaves a non-GET request entirely alone', async () => {
    const worker = loadServiceWorker(response('created'))

    const { respondedWith } = await worker.fetchEvent(`${ORIGIN}/api/session`, 'POST')

    expect(respondedWith).toBe(false)
    expect(worker.cached()).toEqual([])
  })

  it('produces no unhandled rejection for a request it refuses to cache', async () => {
    const worker = loadServiceWorker(response('from an extension'))

    await worker.fetchEvent('chrome-extension://abcdefghijklmnop/inject.js')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(unhandled).toEqual([])
  })
})
