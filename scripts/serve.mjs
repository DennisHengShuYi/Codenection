// Serves ./public over HTTP for the browser tests. Deliberately dependency-free: the
// browser suite should not be able to fail because a static-server package changed.
// Replace the `webServer.command` in playwright.config.ts with the real dev server
// once the app has one -- this exists only so the suite has something to load.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath, not `.pathname`: on Windows a file URL's pathname is `/C:/...`, with a
// leading slash that makes every subsequent path join invalid -- so the server answers
// 404 for everything and the browser suite hangs waiting for a page that never loads.
// Linux is unaffected, which is exactly why this has to be right here rather than left
// for CI to catch.
const ROOT = fileURLToPath(new URL('../public/', import.meta.url))
const PORT = Number(process.env.PORT ?? 3000)

const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
])

/**
 * Turns a request path into a path relative to ROOT. `normalize` first, so that any
 * `..` segments are resolved here rather than inside the join -- otherwise a request
 * for `/../package.json` escapes the served directory. Leading separators are stripped
 * without a regex, both slash kinds, so the result cannot re-root the join.
 */
function toRelativePath(requestPath) {
  const normalized = normalize(requestPath)
  let index = 0
  while (index < normalized.length && (normalized[index] === '/' || normalized[index] === '\\')) {
    index += 1
  }
  const stripped = normalized.slice(index)
  return stripped === '' ? 'index.html' : stripped
}

const server = createServer(async (req, res) => {
  const requestPath = decodeURIComponent((req.url ?? '/').split('?')[0])
  const path = join(ROOT, toRelativePath(requestPath))

  // Belt and braces: even with the normalising above, refuse anything that resolved
  // outside the served directory rather than trusting the sanitiser alone.
  if (!path.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('Forbidden')
    return
  }

  try {
    const body = await readFile(path)
    res.writeHead(200, { 'content-type': TYPES.get(extname(path)) ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found')
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`serving public/ on http://127.0.0.1:${PORT}`)
})
