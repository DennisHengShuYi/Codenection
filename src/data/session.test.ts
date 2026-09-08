import { describe, expect, it } from 'vitest'
import { explainAuthError, MIN_PASSWORD_LENGTH } from './session'

/**
 * Supabase's messages are written for developers. These are the translations a student
 * reads, and the distinctions are the point: a wrong password and an unconfirmed address
 * need completely different actions, and collapsing them into "sign-in failed" is how an
 * auth form becomes something people abandon.
 */
describe('explainAuthError', () => {
  it('points an existing account at signing in instead', () => {
    expect(explainAuthError('User already registered')).toMatch(/already has an account/i)
  })

  it('sends an unconfirmed address to their inbox', () => {
    expect(explainAuthError('Email not confirmed')).toMatch(/inbox/i)
  })

  it('says plainly when the credentials are wrong', () => {
    expect(explainAuthError('Invalid login credentials')).toMatch(/not right/i)
  })

  it('names the minimum length for a password complaint', () => {
    expect(explainAuthError('Password should be at least 6 characters')).toContain(
      String(MIN_PASSWORD_LENGTH),
    )
  })

  // Anything unrecognised is passed through rather than replaced with something vague:
  // an unfamiliar message the student can search for beats "something went wrong".
  it('passes an unrecognised message through unchanged', () => {
    expect(explainAuthError('Service temporarily unavailable')).toBe(
      'Service temporarily unavailable',
    )
  })

  it('matches regardless of how the message is capitalised', () => {
    expect(explainAuthError('INVALID LOGIN CREDENTIALS')).toMatch(/not right/i)
  })
})
