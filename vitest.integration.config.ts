import { defineConfig } from 'vitest/config'

/**
 * Integration tests, run against a real Supabase project.
 *
 * Separate from vitest.config.ts for one reason: that config deliberately blanks the
 * Supabase variables so the ordinary suite can never reach a real database. This one
 * deliberately does not, which is the whole point of it -- so it must stay a separate,
 * explicitly-invoked command rather than something `npm test` can wander into.
 *
 * No jsdom: these talk to Postgres, not to a DOM. No coverage either -- coverage is
 * measured by the main suite, and folding a network-dependent run into that number would
 * make it depend on whether someone had credentials configured that day.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    environment: 'node',
    // Sequential: the contract clears the store before each case, and two files racing
    // on the same anonymous identity would delete each other's fixtures.
    fileParallelism: false,
    // Network round trips, so the default five seconds is too tight to be meaningful.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
