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

/**
 * More events than a fortnight of a plausible week could hold.
 *
 * Each one is a write into somebody's real calendar, so a payload that got away from
 * itself is not just a large response -- it is a large number of outward actions.
 */
export const MAX_PUSH_EVENTS = 300

/** A local wall clock with no offset and no zone: `2026-09-11T09:00:00`. The zone travels
 *  once, beside the list, rather than being restated on every event. */
const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/

/** The four things an event is, and deliberately nothing else. */
export interface PushRequestEvent {
  readonly blockId: string
  readonly summary: string
  readonly startsAt: string
  readonly endsAt: string
}

export type PushRequest =
  | { ok: true; events: readonly PushRequestEvent[]; timeZone: string }
  | { ok: false; status: number; body: string }

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0

const readEvent = (value: unknown): PushRequestEvent | null => {
  if (typeof value !== 'object' || value === null) return null

  const raw = value as Record<string, unknown>

  if (!text(raw.blockId) || !text(raw.summary)) return null
  if (!text(raw.startsAt) || !WALL_CLOCK.test(raw.startsAt)) return null
  if (!text(raw.endsAt) || !WALL_CLOCK.test(raw.endsAt)) return null

  // Rebuilt field by field rather than passed through. Whatever else was posted -- an
  // attendee list, a conference link, a visibility -- does not survive this line, so it can
  // never ride along into a request this app makes to Google on a student's behalf.
  return {
    blockId: raw.blockId,
    summary: raw.summary,
    startsAt: raw.startsAt,
    endsAt: raw.endsAt,
  }
}

/**
 * The posted body, checked before anything is written.
 *
 * The browser computes these events with the same pure function that produced the summary
 * the student agreed to, and that is the right place for the decision. It is not, however,
 * a reason to trust what arrives: what reaches this endpoint is whatever was actually
 * posted, by whatever was posting, and this is the boundary where that stops being an open
 * question. Nothing downstream re-checks it, so nothing downstream may assume it was
 * checked elsewhere.
 */
export function readPushRequest(body: unknown): PushRequest {
  const bad = { ok: false, status: 400, body: 'That is not a week I can write.' } as const

  if (typeof body !== 'object' || body === null) return bad

  const { events, timeZone } = body as Record<string, unknown>

  if (!Array.isArray(events) || events.length > MAX_PUSH_EVENTS) return bad
  if (!text(timeZone)) return bad

  const read = events.map(readEvent)

  // All or nothing. Writing the readable ones and silently dropping the rest would leave a
  // calendar holding part of a week while the student was told the week went out.
  if (read.some((event) => event === null)) return bad

  return { ok: true, events: read as PushRequestEvent[], timeZone }
}
