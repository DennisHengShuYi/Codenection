import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
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
       * The initial floor, set just under what the suite reaches today (94.9 / 86.4 /
       * 93.6 / 95.8) so ordinary changes are not blocked by rounding while a real drop
       * fails the build.
       *
       * .claude/CLAUDE.md: these only ever go up. Lowering one to accommodate untested
       * new code defeats the point -- if a change cannot meet the line, the answer is a
       * test, not a smaller number.
       *
       * What keeps this from being higher is supabaseRepository.ts at ~56%, counted here
       * rather than excluded. It cannot be exercised without credentials, and hiding it
       * would make the number flatter and less true. Point the repository contract suite
       * at a disposable project and this floor should rise.
       */
      thresholds: {
        statements: 94,
        branches: 86,
        functions: 93,
        lines: 95,
      },
    },
  },
})
