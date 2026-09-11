import { describe, expect, it } from 'vitest'
import { bearerFrom, callerFrom } from './sessionCheck'

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

/**
 * The regression that cost a day. Every endpoint verified a session by handing the student's
 * token to `createClient` as a global `authorization` header. supabase-js sets its own
 * `Authorization: Bearer <anon key>` on the auth client and then spreads the caller's headers
 * over it -- and `Authorization` and `authorization` are different object keys, so both
 * survived and the wire carried
 *
 *     Authorization: Bearer <anon key>, Bearer <user JWT>
 *
 * which Supabase refuses. Not a bad session, not a bad deployment: a malformed header, 401
 * every time, for everybody, on every deployment. `auth.getUser(jwt)` takes the token as an
 * argument and sets the header itself, which is why the token has to be lifted out of the
 * header the browser sent.
 */
describe('the token inside an Authorization header', () => {
  it('is the part after the scheme', () => {
    expect(bearerFrom('Bearer abc.def.ghi')).toBe('abc.def.ghi')
  })

  it('does not mind how the scheme was cased or spaced', () => {
    expect(bearerFrom('bearer   abc.def.ghi')).toBe('abc.def.ghi')
    expect(bearerFrom('BEARER abc.def.ghi')).toBe('abc.def.ghi')
  })

  it('never keeps the scheme, which is what put two bearers on one header', () => {
    expect(bearerFrom('Bearer abc')).not.toMatch(/bearer/i)
  })

  it('is nothing at all when there is no header, or nothing after the scheme', () => {
    expect(bearerFrom(null)).toBeNull()
    expect(bearerFrom('')).toBeNull()
    expect(bearerFrom('Bearer   ')).toBeNull()
  })

  /** A header this endpoint does not understand is not a session. Guessing at it is how
   *  something that is not a token ends up being sent to Supabase as one. */
  it('is nothing when the scheme is not Bearer', () => {
    expect(bearerFrom('Basic abc')).toBeNull()
    expect(bearerFrom('abc.def.ghi')).toBeNull()
  })
})
