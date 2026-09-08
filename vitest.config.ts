import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    // Integration tests are excluded here and run by vitest.integration.config.ts.
    // They talk to a real database, so they must never be reachable from `npm test`.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'src/**/*.integration.test.ts'],
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],

    /**
     * Blank the Supabase variables for every test run.
     *
     * Vite loads `.env` and exposes anything VITE_-prefixed, so on a machine with real
     * credentials configured the suite would otherwise pick them up and
     * `createRepository` would hand the tests a live client pointed at a real project.
     * .claude/CLAUDE.md forbids testing against real credentials, and the failure mode is
     * quiet: the tests would appear to pass while talking to a real database, and
     * `clear()` in the repository contract would delete whatever it found there.
     *
     * Blanking them here means the suite always runs on browser storage, which is also
     * the configuration CI runs in.
     */
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      // main.tsx is the composition root: three lines of wiring with nothing to assert
      // that the browser test does not already cover. test-setup.ts is the harness.
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/main.tsx', 'src/test-setup.ts'],

      /**
       * Set just under what the suite reaches today (98.1 / 92.2 / 98.0 / 98.8) so
       * ordinary changes are not blocked by rounding while a real drop fails the build.
       *
       * .claude/CLAUDE.md: these only ever go up. Lowering one to accommodate untested
       * new code defeats the point -- if a change cannot meet the line, the answer is a
       * test, not a smaller number.
       *
       * Raised from 94/86/93/95 once the Supabase adapter gained tests against a stubbed
       * client. That closed the gap which had been holding the floor down; what those
       * tests still do not prove is that the adapter works against a real Supabase, which
       * needs the contract suite pointed at a disposable project.
       */
      thresholds: {
        statements: 97,
        branches: 91,
        functions: 97,
        lines: 98,
      },
    },
  },
})
