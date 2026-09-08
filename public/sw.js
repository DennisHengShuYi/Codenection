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

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request)
          .then((response) => {
            const copy = response.clone()
            void caches.open(CACHE).then((cache) => cache.put(event.request, copy))
            return response
          })
          // Offline and not cached: fall back to the shell, so an installed app opens
          // rather than showing the browser's error page.
          .catch(() => caches.match('/index.html')),
    ),
  )
})
