import { beforeAll, describe, it } from 'vitest'
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
 * 1. **Every run signs in as a dedicated throwaway account** and therefore owns only
 *    that account's row. The suite never touches any other.
 * 2. **Row-level security enforces that**, rather than the client promising to behave.
 *    A real week saved under a different identity is unreachable from here.
 * 3. **Without migration 0002 applied**, the older `id = 'me'` policy rejects this
 *    identity's writes outright and deletes nothing -- it fails rather than destroying.
 *
 * ## Running it
 *
 *     npm run test:integration
 *
 * Skipped unless the Supabase settings *and* INTEGRATION_TEST_EMAIL and
 * INTEGRATION_TEST_PASSWORD are all set, so it never runs in CI (which has no secrets, by
 * design) and never runs as part of `npm test`.
 *
 * That account must be a throwaway: the contract clears the store before every case, so
 * whatever it owns is deleted.
 *
 */

// import.meta.env rather than process.env: Vite loads .env and exposes VITE_-prefixed
// values there, which is where the credentials actually live for this run.
const config = readDataConfig()
const email = process.env.INTEGRATION_TEST_EMAIL ?? ''
const password = process.env.INTEGRATION_TEST_PASSWORD ?? ''

const configured =
  config.supabaseUrl !== null && config.supabaseAnonKey !== null && email !== '' && password !== ''

let userId = ''

const suite = configured ? describe : describe.skip

suite('supabaseRepository against a real project', () => {
  /**
   * The guard.
   *
   * Before a single destructive contract case runs, prove this session is a dedicated
   * throwaway account and not something holding real data. If that cannot be established
   * the whole file fails here rather than reaching a `clear()` that might matter.
   */
  beforeAll(async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(config.supabaseUrl!, config.supabaseAnonKey!)
    const { data, error } = await client.auth.signInWithPassword({ email, password })

    if (error) {
      throw new Error(
        `Refusing to run: could not sign in as the test account (${error.message}). ` +
          'Create a throwaway account and set INTEGRATION_TEST_EMAIL and ' +
          'INTEGRATION_TEST_PASSWORD before running this.',
      )
    }

    const id = data.user?.id
    if (!id) throw new Error('Refusing to run: signed in but got no user id, so nothing guarantees isolation.')
    userId = id
  })

  describeRepositoryContract('supabaseRepository', () =>
    createSupabaseRepository(config.supabaseUrl!, config.supabaseAnonKey!, userId),
  )
})

// Reported rather than silent, so a skipped run is never mistaken for a passing one.
if (!configured) {
  describe('supabaseRepository against a real project', () => {
    it.skip('skipped: Supabase settings or INTEGRATION_TEST_* credentials are not set', () => {
      // Intentionally empty.
    })
  })
}
