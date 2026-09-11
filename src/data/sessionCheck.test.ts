import { describe, expect, it } from 'vitest'
import { callerFrom } from './sessionCheck'

/**
 * Telling apart "nobody is signed in" from "this deployment cannot verify anybody".
 *
 * Every endpoint that reads a session used to discard the error `auth.getUser()` returns and
 * keep only the user, so a deployment whose Supabase pair could not validate anything
 * answered every signed-in student with "Sign in first." That is the exact failure
 * `google/client.ts` complains about in its own comment -- the one person who needed to know
 * was the one not told -- and it cost an afternoon to place, because the endpoint said the
 * same thing to a valid token as to a junk one.
 *
 * Supabase answers 401 for both a bad session and a bad API key, so the message is the only
 * thing separating them. Matching on it is unlovely; being unable to tell a student's fault
 * from the deployment's is worse.
 */
describe('who an endpoint is talking to', () => {
  it('is the account when Supabase verified one', () => {
    expect(callerFrom('account-1', null)).toEqual({ accountId: 'account-1', verifiable: true })
  })

  it('is nobody when Supabase verified the session and found none', () => {
    expect(callerFrom(undefined, null)).toEqual({ accountId: null, verifiable: true })
  })

  /** A session Supabase actively refused. The student really does need to sign in again. */
  it('is nobody when the session itself was refused', () => {
    expect(callerFrom(undefined, { message: 'invalid claim: missing sub claim' })).toEqual({
      accountId: null,
      verifiable: true,
    })
  })

  /** The deployment's own fault, and the one this exists for: a key that does not belong to
   *  the project being addressed. Nothing the student does can fix it. */
  it('is unverifiable when Supabase refused the key rather than the session', () => {
    expect(callerFrom(undefined, { message: 'Invalid API key' })).toEqual({
      accountId: null,
      verifiable: false,
    })
  })

  it('is unverifiable when Supabase could not be reached at all', () => {
    expect(callerFrom(undefined, { message: 'Failed to fetch' })).toEqual({
      accountId: null,
      verifiable: false,
    })
  })

  /** An error alongside a user is still an error: nothing may read the account out of a
   *  result the library did not stand behind. */
  it('never keeps an account that came back with an error', () => {
    expect(callerFrom('account-1', { message: 'Invalid API key' }).accountId).toBeNull()
  })
})
