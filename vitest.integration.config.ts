import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * `.env` into `process.env`, which Vite does not do on its own: it exposes only
 * `VITE_`-prefixed values, and `GROQ_API_KEY` may never gain that prefix (§10, constraint
 * 1 -- the prefix publishes a value into the browser bundle).
 *
 * The empty prefix asks for everything, which is safe *here* and nowhere else: this config
 * already exists to be the one place credentials are deliberately reachable, and
 * vitest.config.ts blanks the same variables so `npm test` can never wander into a paid
 * call. Anything added here is opt-in by virtue of needing its own command.
 */
const env = loadEnv('test', process.cwd(), '')

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
    // models.integration.test.ts skips itself without this, which is how CI and anyone
    // without a key runs it. With it, that file makes real, billable calls.
    env: { GROQ_API_KEY: env.GROQ_API_KEY ?? '' },
  },
})
