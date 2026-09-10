/**
 * What the connect endpoints check before they do anything at all.
 *
 * Kept here rather than in `api/` for the reason `telegram/guard.ts` gives about itself:
 * `api/` is typechecked but the unit suite never sees it, and these are the guards on the
 * surface this feature exposes to the internet. They are exactly the code that should not be
 * the untested part.
 */

export interface GoogleConfig {
  readonly clientId: string | undefined
  readonly clientSecret: string | undefined
  /** Wraps the refresh token before it is stored. See `secretBox.ts`. */
  readonly tokenKey: string | undefined
  /** Signs the `state` carried through the round trip. See `state.ts`. */
  readonly stateSecret: string | undefined
}

export type GuardResult = { ok: true } | { ok: false; status: number; body: string }

/**
 * All four or none.
 *
 * A half-filled configuration is a misconfiguration -- `data/env.ts` takes the same line
 * about the Supabase pair. Starting a flow that cannot be finished would send a student to
 * Google, ask them to grant calendar access, and then fail on the way back having already
 * spent their consent.
 */
const configured = (config: GoogleConfig): boolean =>
  Boolean(config.clientId && config.clientSecret && config.tokenKey && config.stateSecret)

/** 503, never a throw: an unset variable is a deployment before its secrets are filled in,
 *  plus CI and local dev, which are ordinary states rather than a fault. */
const unavailable: GuardResult = {
  ok: false,
  status: 503,
  body: 'Calendar connection is not available on this deployment.',
}

/** Deliberately says nothing about which check refused. Which part of a defence somebody
 *  tripped is information about the defence. */
const refused = (status: number, body: string): GuardResult => ({ ok: false, status, body })

export function checkStart(
  request: { method: string; accountId: string | null },
  config: GoogleConfig,
): GuardResult {
  if (request.method !== 'GET') return refused(405, 'Method not allowed')
  if (!configured(config)) return unavailable

  // Nothing about an account happens for a request that has not proved who it is. Without
  // this, anyone could begin a flow that ends with tokens stored against somebody's row.
  if (request.accountId === null) return refused(401, 'Sign in first.')

  return { ok: true }
}

export function checkCallback(
  request: { method: string; code: string | null; error: string | null },
  config: GoogleConfig,
): GuardResult {
  if (request.method !== 'GET') return refused(405, 'Method not allowed')
  if (!configured(config)) return unavailable

  // A student who pressed "Cancel" at the consent screen has not hit an error -- they
  // changed their mind, which they are entitled to do, and nothing should read as a fault
  // or be left half-connected.
  if (request.error !== null) return refused(400, 'Your calendar was not connected.')

  if (request.code === null) return refused(400, 'Your calendar was not connected.')

  return { ok: true }
}
