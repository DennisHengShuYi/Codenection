import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Not 3000, for the reason playwright.config.ts already gives: that port is the default
// for half the JavaScript ecosystem, so on a machine running any other project it is
// usually taken. Both dev and preview answer on the same port so the browser suite can
// point at one URL regardless of which one is serving.
const PORT = Number(process.env.PORT ?? 5180)

/**
 * Directories the dev server must not watch.
 *
 * Vite ignores `.git`, `node_modules` and its own `build.outDir` already, so `dist/` is
 * covered. `coverage/` and `test-results/` are not, and both are written by the test
 * scripts -- a coverage report is around two hundred HTML files. With one on disk the
 * watcher fires a full page reload roughly once a second, indefinitely: the dev server
 * spends its life reloading a report nothing is looking at, and it took about three
 * minutes of that to die outright.
 *
 * Every path here is gitignored build output. Nothing a student's browser loads comes from
 * one of them, so there is nothing to lose by not watching them.
 */
const NOT_SOURCE = ['**/coverage/**', '**/test-results/**', '**/playwright-report/**']

export default defineConfig({
  plugins: [react()],
  server: { port: PORT, host: '127.0.0.1', watch: { ignored: NOT_SOURCE } },
  preview: { port: PORT, host: '127.0.0.1' },
})
