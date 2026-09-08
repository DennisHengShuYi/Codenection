import { beforeAll, describe, expect, it } from 'vitest'
import { readDataConfig } from './env'
import { describeRepositoryContract } from './repositoryContract'
import { createSupabaseRepository } from './supabaseRepository'

/**
 * The repository contract, run against a real Supabase project.
 *
 * Everything else in this suite talks to a stub. That proves the adapter's own reasoning
 * -- which row it reads, how it maps an error -- and proves nothing about whether it
 * works against actual Postgres. The things only this file can catch: a row-level
 * security policy silently rejecting a write, a Schedule not surviving a jsonb round
 * trip, `upsert` behaving differently than assumed on conflict, and anonymous sign-in
 * racing the first query.
 *
 * ## Why this is safe against a real project
 *
 * The contract calls `clear()` before every test, which is destructive by design -- so
 * pointing it at a project holding real data would normally be exactly the mistake
 * .claude/CLAUDE.md forbids. Three things make it safe here, and the guard below refuses
 * to run if the first of them does not hold:
 *
 * 1. **Every run signs in as a fresh anonymous user** and therefore owns a fresh row.
 *    The suite only ever touches the row keyed to that identity.
 * 2. **Row-level security enforces that**, rather than the client promising to behave.
 *    A real week saved under a different identity is unreachable from here.
 * 3. **Without migration 0002 applied**, the older `id = 'me'` policy rejects this
 *    identity's writes outright and deletes nothing -- it fails rather than destroying.
 *
 * ## Running it
 *
 *     npm run test:integration
 *
 * Skipped unless VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set, so it never runs
 * in CI (which has no secrets, by design) and never runs as part of `npm test`. It needs
 * anonymous sign-ins enabled: Authentication -> Providers -> Anonymous.
 *
 * ## One cost worth knowing
 *
 * Each run leaves behind an anonymous auth user. They accumulate, and the anon key
 * cannot delete them -- clearing them out is a dashboard job if it ever matters.
 */

// import.meta.env rather than process.env: Vite loads .env and exposes VITE_-prefixed
// values there, which is where the credentials actually live for this run.
const config = readDataConfig()
const configured = config.supabaseUrl !== null && config.supabaseAnonKey !== null

const suite = configured ? describe : describe.skip

suite('supabaseRepository against a real project', () => {
  /**
   * The guard.
   *
   * Before a single destructive contract case runs, prove this session is isolated: a
   * real anonymous identity, and emphatically not the shared 'me' row that 0001 created.
   * If that cannot be established the whole file fails here rather than reaching a
   * `clear()` that might touch something that matters.
   */
  beforeAll(async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(config.supabaseUrl!, config.supabaseAnonKey!)
    const { data, error } = await client.auth.signInAnonymously()

    if (error) {
      throw new Error(
        `Refusing to run: could not establish an isolated identity (${error.message}). ` +
          'Enable anonymous sign-ins under Authentication -> Providers before running this.',
      )
    }

    const id = data.user?.id
    if (!id || id === 'me') {
      throw new Error('Refusing to run: no isolated anonymous identity, so nothing guarantees isolation.')
    }
  })

  describeRepositoryContract('supabaseRepository', () =>
    createSupabaseRepository(config.supabaseUrl!, config.supabaseAnonKey!),
  )
})

// Reported rather than silent, so a skipped run is never mistaken for a passing one.
if (!configured) {
  describe('supabaseRepository against a real project', () => {
    it.skip('skipped: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set', () => {
      // Intentionally empty.
    })
  })
}
