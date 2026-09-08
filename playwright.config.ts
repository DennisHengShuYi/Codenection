import { defineConfig, devices } from '@playwright/test'

// Deliberately not 3000. That port is the default for half the JavaScript ecosystem, so
// on a machine running any other project it is usually already taken -- and combined
// with `reuseExistingServer`, Playwright would quietly run this suite against whatever
// unrelated app happened to answer, producing failures that have nothing to do with
// this repository.
const PORT = Number(process.env.PORT ?? 5180)
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',

  // No `--pass-with-no-tests` anywhere: an empty browser suite must fail, not report
  // success. See "Tests are part of the change" in .claude/CLAUDE.md.
  forbidOnly: !!process.env.CI,

  // A flaky browser test is worse than no browser test, because it teaches everyone to
  // re-run the job instead of reading it. One retry in CI absorbs genuine flake from
  // cold-start timing; locally, a failure is a failure.
  retries: process.env.CI ? 1 : 0,

  // Serial in CI: the runner has two cores, and parallel workers on a cold browser make
  // timing-sensitive assertions flaky for no wall-clock gain at this size.
  workers: process.env.CI ? 1 : undefined,

  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : [['list']],

  use: {
    baseURL: BASE_URL,
    // Kept only for failures -- a trace per passing test is minutes of upload for
    // something nobody opens.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Playwright boots the server itself, so the test command is the same locally and in
  // CI.
  //
  // Build-then-preview rather than `vite dev`: the suite should assert the artefact that
  // actually ships. A dev server transforms modules on the fly and serves sourcemaps and
  // an HMR client that production never sees, so a build-only failure -- a bad import
  // that only tree-shaking surfaces, a missing asset -- would pass here and break live.
  webServer: {
    command: 'npm run build && npm run preview',
    url: BASE_URL,
    env: {
      PORT: String(PORT),

      // Blanked so the build cannot inline real Supabase credentials.
      //
      // `vite build` reads .env and inlines every VITE_-prefixed value into the bundle,
      // so on a machine with credentials configured this suite would otherwise build an
      // app pointed at a real project -- and then drive it. The rebalance test clicks a
      // button that saves the week, so the browser suite would be writing to a real
      // database on every run. .claude/CLAUDE.md forbids testing against production data
      // or any path that can take an irreversible action.
      //
      // Set here rather than in a .env file because dotenv does not overwrite variables
      // that already exist in the environment, so these win over anything in .env. The
      // suite therefore always runs on browser storage, which is also what CI does.
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
    // Never reuse: if something else is already on this port, that is a problem to be
    // told about, not to silently test against. Playwright fails with a clear message
    // instead of running the suite on a stranger's app.
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
