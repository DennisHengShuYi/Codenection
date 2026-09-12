// Cache-first for the app shell, network-with-cache-fill for everything else.
//
// Deliberately small and hand-written. A build plugin here would be a dependency capable
// of invalidating a whole deploy, and there is nothing in twenty lines of fetch handling
// worth that risk.
//
// Bump CACHE when the shell changes; the old one is deleted on activate.
// v2 evicts every v1 cache on activate. That eviction is not cosmetic: v1 was written by a
// worker that cached the shell first and stored cross-origin and error responses, so an
// existing v1 cache can hold an index.html naming deleted bundles. Renaming is the only way
// to be rid of it on a browser that already has one.
// v3 evicts v2 for the same kind of reason: v2 stored same-origin API responses, so an
// existing v2 cache holds a consent URL whose `state` expired ten minutes after it was
// written. The rule below stops new ones being written, but only renaming clears the one a
// browser already has -- and without this line the calendar stays broken for exactly the
// people who already tried to connect one.
const CACHE = 'codenection-v3'
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

  // This app's own API, left entirely to the browser.
  //
  // The rule above names the hazard -- a cache-first worker serves a stored API response
  // ahead of the network forever -- but it only covered cross-origin reads, and the
  // functions in `api/` are served from this very origin on Vercel. So the reasoning
  // applied and the check did not.
  //
  // What that cost: `/api/google-connect?begin=1` answers with a consent URL carrying a
  // `state` signed at that moment and good for ten minutes. Cached, every later press
  // replayed the first press's state, and connecting a calendar failed with "that link has
  // expired" from ten minutes after the first attempt onwards -- for good, and unaffected
  // by signing out, because this cache is keyed by origin rather than by session.
  //
  // Returning rather than handling it: there is no offline answer worth giving for a live
  // read, and a fallback shell served where JSON was expected is worse than a failed fetch
  // the caller already knows how to report.
  if (url.pathname.startsWith('/api/')) return

  // Navigations are network-first, and must stay that way. index.html names the hashed
  // asset files the build produced, and every build produces different names -- so a shell
  // served from the cache after a deploy points at bundles that no longer exist, and the
  // app loads to a blank page with a 404 for a file nobody can find. The cache is the
  // offline fallback here, never the first answer.
  //
  // The fresh copy is stored under /index.html rather than the visited URL, so the whole
  // single-page app keeps one shell entry instead of one per deep link a user happens to
  // open.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            void caches
              .open(CACHE)
              .then((cache) => cache.put('/index.html', copy))
              .catch(() => undefined)
          }
          return response
        })
        // Offline: the last shell we saw is better than the browser's error page.
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  // Everything else stays cache-first. Vite fingerprints asset filenames with a content
  // hash, so a cached asset can never be stale -- if its content changes, its URL changes
  // and this lookup misses.
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
