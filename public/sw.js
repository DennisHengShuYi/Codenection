// Cache-first for the app shell, network-with-cache-fill for everything else.
//
// Deliberately small and hand-written. A build plugin here would be a dependency capable
// of invalidating a whole deploy, and there is nothing in twenty lines of fetch handling
// worth that risk.
//
// Bump CACHE when the shell changes; the old one is deleted on activate.
const CACHE = 'codenection-v1'
const SHELL = ['/', '/index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
  // Take over immediately rather than waiting for every tab to close, so a deploy is at
  // most one reload behind rather than stuck until the browser is restarted.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  // Only same-origin traffic belongs in the shell cache, for two separate reasons.
  //
  // Browser extensions issue chrome-extension:// GETs through the page. The Cache API
  // accepts http(s) only and rejects every other scheme, so those reached cache.put and
  // threw -- surfacing as an uncaught console error on every page load with an extension
  // installed.
  //
  // The stronger reason is cross-origin reads. This worker is cache-first, so an API
  // response that once entered the cache would be served ahead of the network on every
  // later load, and the app would show stale numbers until CACHE was renamed. Live data
  // must always come from the network.
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request)
          .then((response) => {
            // Successful responses only. Under a cache-first strategy a stored 404 or 500
            // is served back forever, which turns a transient failure into a permanent one.
            if (response.ok && response.type === 'basic') {
              const copy = response.clone()
              void caches
                .open(CACHE)
                .then((cache) => cache.put(event.request, copy))
                // A cache write is an optimisation, never a correctness requirement. If it
                // fails the response has already been returned, so swallow it rather than
                // letting it become an unhandled rejection in the console.
                .catch(() => undefined)
            }
            return response
          })
          // Offline and not cached: fall back to the shell, so an installed app opens
          // rather than showing the browser's error page.
          .catch(() => caches.match('/index.html')),
    ),
  )
})
