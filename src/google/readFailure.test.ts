import { describe, expect, it } from 'vitest'
import { readFailureFor } from './readFailure'

/**
 * Telling apart the reasons Google refuses a calendar.
 *
 * The endpoint answered every failed read with a flat 502 and threw the reason away, so the
 * screen told a student "try again in a moment" for two failures where trying again is not
 * what fixes it -- and left nobody any way of knowing which had happened.
 */
const googleSaid = (status: string, message: string, reason?: string) => ({
  error: {
    code: 403,
    status,
    message,
    ...(reason === undefined ? {} : { errors: [{ reason }] }),
  },
})

describe('readFailureFor', () => {
  /**
   * The Calendar API is not switched on for the project. Nothing a student can do, and "try
   * again in a moment" is a lie: trying again is not what fixes it.
   */
  it('names a deployment whose Calendar API was never enabled', () => {
    const failure = readFailureFor(
      403,
      googleSaid(
        'PERMISSION_DENIED',
        'Google Calendar API has not been used in project 123 before or it is disabled.',
        'accessNotConfigured',
      ),
    )

    expect(failure.status).toBe(503)
    expect(failure.message ?? '').toMatch(/not switched on|ours to fix/i)
  })

  /** A grant made before `calendar.readonly` was asked for. Reconnecting fixes it, because
   *  consent asks again; retrying never will. */
  it('names a grant that does not carry the scope', () => {
    const failure = readFailureFor(
      403,
      googleSaid(
        'PERMISSION_DENIED',
        'Request had insufficient authentication scopes.',
        'insufficientPermissions',
      ),
    )

    expect(failure.status).toBe(409)
    expect(failure.message ?? '').toMatch(/connect it again/i)
  })

  /** Same story told with a different status: the token is real and does not carry what this
   *  call needs. */
  it('treats a 401 on a freshly minted token as a missing scope', () => {
    expect(readFailureFor(401, { error: { message: 'Invalid Credentials' } }).status).toBe(409)
  })

  /** Google being briefly unwell. Here "try again in a moment" is the truth, so the screen's
   *  own sentence stands and nothing is added to it. */
  it('says nothing extra about a fault that may simply pass', () => {
    const failure = readFailureFor(500, { error: { message: 'Backend Error' } })

    expect(failure.status).toBe(502)
    expect(failure.message).toBeNull()
  })

  it('does not fall over on a body that is not what Google usually sends', () => {
    expect(readFailureFor(500, null).status).toBe(502)
    expect(readFailureFor(500, 'gateway timeout').status).toBe(502)
    expect(readFailureFor(500, { error: { errors: [{}] } }).status).toBe(502)
  })

  /** Both of the actionable failures arrive as 403, which is why the reason decides and not
   *  the status. Getting this the other way round would send every deployment problem to the
   *  student as something to reconnect. */
  it('tells the two 403s apart by what Google said, not by the code', () => {
    const notEnabled = readFailureFor(403, googleSaid('PERMISSION_DENIED', 'x', 'accessNotConfigured'))
    const noScope = readFailureFor(403, googleSaid('PERMISSION_DENIED', 'x', 'insufficientPermissions'))

    expect(notEnabled.status).toBe(503)
    expect(noScope.status).toBe(409)
  })
})
