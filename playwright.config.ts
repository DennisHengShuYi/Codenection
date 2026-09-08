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
  // CI. Point this at the real dev server once the app has one.
  webServer: {
    command: 'node scripts/serve.mjs',
    url: BASE_URL,
    env: { PORT: String(PORT) },
    // Never reuse: if something else is already on this port, that is a problem to be
    // told about, not to silently test against. Playwright fails with a clear message
    // instead of running the suite on a stranger's app.
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
