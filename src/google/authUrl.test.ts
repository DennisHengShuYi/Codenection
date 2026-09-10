import { describe, expect, it } from 'vitest'
import { CALENDAR_SCOPES, consentUrl } from './authUrl'

const url = (over: Partial<Parameters<typeof consentUrl>[0]> = {}) =>
  new URL(
    consentUrl({
      clientId: 'client-123.apps.googleusercontent.com',
      redirectUri: 'https://example.test/api/google-connect',
      state: 'state-abc',
      ...over,
    }),
  )

/**
 * The consent screen a student is sent to, built as a value rather than a string inside a
 * handler.
 *
 * This is the one place the app states what access it is asking a person for, so the scope
 * list is a tested constant rather than something typed into a URL. Anything added here is
 * something every student is asked to hand over, which is a decision that should be visible
 * in a diff.
 */
describe('consentUrl', () => {
  it('sends the student to Google, not anywhere else', () => {
    expect(url().origin).toBe('https://accounts.google.com')
  })

  /**
   * §1.4 makes the calendar an additive supplement, never the only path -- so the app asks
   * for the least that makes the feature work, and asks for it only when the student
   * chooses the feature.
   */
  it('asks for calendar access and nothing besides', () => {
    expect(url().searchParams.get('scope')).toBe(CALENDAR_SCOPES.join(' '))
  })

  it('asks for no other kind of Google data at all', () => {
    const scope = url().searchParams.get('scope') ?? ''

    expect(scope).not.toMatch(/gmail|drive|contacts|photos|youtube/i)
  })

  /**
   * The two parameters without which Google returns an access token and no refresh token,
   * and the feature silently stops working the moment the first one expires.
   */
  it('asks for access that outlives the browser tab', () => {
    expect(url().searchParams.get('access_type')).toBe('offline')
    expect(url().searchParams.get('prompt')).toBe('consent')
  })

  it('asks for a code to exchange, rather than a token in the address bar', () => {
    expect(url().searchParams.get('response_type')).toBe('code')
  })

  /**
   * Without `state`, anyone can hand a student a link that finishes a connection to
   * *their* Google account, and the student's week would then be reading a stranger's
   * calendar. It is checked again on the way back in `guard.ts`.
   */
  it('carries the state it will be checked against on the way back', () => {
    expect(url({ state: 'state-abc' }).searchParams.get('state')).toBe('state-abc')
  })

  it('carries the client and the exact address Google must return to', () => {
    const parameters = url().searchParams

    expect(parameters.get('client_id')).toBe('client-123.apps.googleusercontent.com')
    expect(parameters.get('redirect_uri')).toBe('https://example.test/api/google-connect')
  })

  it('encodes a redirect address that contains characters a URL cares about', () => {
    const redirectUri = 'https://example.test/api/google-connect?from=add%2Fcalendar'

    expect(url({ redirectUri }).searchParams.get('redirect_uri')).toBe(redirectUri)
  })

  it('builds the same address twice for the same inputs', () => {
    expect(url().toString()).toBe(url().toString())
  })
})
