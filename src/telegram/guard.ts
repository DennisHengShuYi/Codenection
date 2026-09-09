/**
 * What the webhook checks before it does anything at all.
 *
 * Kept here rather than in `api/telegram.ts` because `api/` is typechecked but not covered
 * by the unit suite -- vitest only sees `src/**` -- and these are the guards on the most
 * exposed surface in the product. They are exactly the code that should not be the
 * untested part.
 */
export interface TelegramConfig {
  readonly botToken: string | undefined
  readonly webhookSecret: string | undefined
  readonly serviceRoleKey: string | undefined
  readonly supabaseUrl: string | undefined
}

export type GuardResult = { ok: true } | { ok: false; status: number; body: string }

/**
 * Constant-time comparison.
 *
 * A plain `!==` returns as soon as two strings differ, so how long it takes leaks how much
 * of the secret was right, and enough attempts recover it a character at a time. The
 * lengths are compared first and the loop still runs over the whole expected value, so
 * neither the length nor the position of the first difference changes the work done.
 */
function matches(given: string, expected: string): boolean {
  let difference = given.length ^ expected.length

  for (let index = 0; index < expected.length; index += 1) {
    difference |= (given.charCodeAt(index) || 0) ^ expected.charCodeAt(index)
  }

  return difference === 0
}

export function checkRequest(
  request: { method: string; secretHeader: string | null },
  config: TelegramConfig,
): GuardResult {
  if (request.method !== 'POST') {
    return { ok: false, status: 405, body: 'Method not allowed' }
  }

  // Checked before the secret, deliberately. An unconfigured deployment answers the same
  // way whatever secret is offered, so it cannot be used to test a guess.
  if (
    config.botToken === undefined ||
    config.webhookSecret === undefined ||
    config.serviceRoleKey === undefined ||
    config.supabaseUrl === undefined
  ) {
    return { ok: false, status: 503, body: 'Telegram unavailable' }
  }

  if (request.secretHeader === null || !matches(request.secretHeader, config.webhookSecret)) {
    // Nothing about which value was wrong, or how close it was.
    return { ok: false, status: 403, body: 'Forbidden' }
  }

  return { ok: true }
}
