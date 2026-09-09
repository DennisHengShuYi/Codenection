import { describe, expect, it } from 'vitest'
import { checkRequest, type TelegramConfig } from './guard'

const configured: TelegramConfig = {
  botToken: 'bot-token',
  webhookSecret: 'the-secret',
  serviceRoleKey: 'service-key',
  supabaseUrl: 'https://example.supabase.co',
}

const good = { method: 'POST', secretHeader: 'the-secret' }

describe('checkRequest', () => {
  it('accepts a properly signed POST when everything is configured', () => {
    expect(checkRequest(good, configured)).toEqual({ ok: true })
  })

  it('refuses anything that is not a POST', () => {
    const result = checkRequest({ ...good, method: 'GET' }, configured)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.status).toBe(405)
  })

  // Telegram sends the secret back on every call. Without this check the address is an
  // open endpoint that anyone on the internet can drive.
  it('refuses a request with no secret at all', () => {
    const result = checkRequest({ ...good, secretHeader: null }, configured)

    expect(result.ok === false && result.status).toBe(403)
  })

  it('refuses a request with the wrong secret', () => {
    const result = checkRequest({ ...good, secretHeader: 'not-the-secret' }, configured)

    expect(result.ok === false && result.status).toBe(403)
  })

  it('refuses a secret that is merely a prefix of the real one', () => {
    const result = checkRequest({ ...good, secretHeader: 'the-secr' }, configured)

    expect(result.ok === false && result.status).toBe(403)
  })

  /**
   * Unconfigured answers 503 rather than erroring, the same shape api/plan.ts uses. That is
   * the state CI runs in and the state a deployment is in before its variables are set, and
   * neither should look like a crash.
   */
  it.each([
    ['botToken', { ...configured, botToken: undefined }],
    ['webhookSecret', { ...configured, webhookSecret: undefined }],
    ['serviceRoleKey', { ...configured, serviceRoleKey: undefined }],
    ['supabaseUrl', { ...configured, supabaseUrl: undefined }],
  ])('answers 503 rather than erroring when %s is missing', (_name, partial) => {
    const result = checkRequest(good, partial as TelegramConfig)

    expect(result.ok === false && result.status).toBe(503)
  })

  // Checked before the secret, so an unconfigured deployment cannot be probed for whether a
  // guessed secret was right.
  it('reports being unconfigured even when the secret is also wrong', () => {
    const result = checkRequest(
      { ...good, secretHeader: 'wrong' },
      { ...configured, botToken: undefined },
    )

    expect(result.ok === false && result.status).toBe(503)
  })

  // A refusal tells a caller nothing it does not already know. Anything about which value
  // was missing, or how close a secret was, is a hint worth withholding.
  it('says nothing about why beyond the status', () => {
    const results = [
      checkRequest({ ...good, secretHeader: 'wrong' }, configured),
      checkRequest(good, { ...configured, serviceRoleKey: undefined }),
    ]

    for (const result of results) {
      expect(result.ok).toBe(false)
      expect(result.ok === false && result.body).not.toMatch(/secret|token|key|supabase/i)
    }
  })
})
