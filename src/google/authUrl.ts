/**
 * Where a student is sent to grant calendar access, built as a value.
 *
 * Pure, and in `src/` rather than `api/`, for the reason `telegram/guard.ts` gives about
 * itself: `api/` is typechecked but the unit suite never sees it, and this is the one place
 * the app states what access it is asking a person for. A scope list typed into a URL inside
 * a handler is a scope list nobody reviews.
 */

/**
 * Everything the feature asks for, and nothing else.
 *
 * `calendar.events` rather than the full `calendar` scope: it can read and write events,
 * which is the whole feature, and cannot delete a calendar or change its sharing.
 * `calendar.app.created` narrows the write side further -- it grants access only to
 * calendars this app itself created, which is what makes "we can never touch an event we did
 * not create" a fact about the grant rather than a promise about our code.
 *
 * `calendar.readonly` is separate and is what lets the import read the calendars a student
 * already keeps. Read from theirs, write only to ours.
 *
 * Adding anything here widens what every student is asked to hand over, so it should be
 * visible in a diff and argued for.
 */
export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.app.created',
] as const

const CONSENT_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'

export interface ConsentRequest {
  readonly clientId: string
  /** Where Google returns the code. Must match the value registered with Google exactly. */
  readonly redirectUri: string
  /**
   * An unguessable value tied to this student's attempt, checked again on the way back.
   *
   * Without it, anyone can hand a student a link that completes a connection to the
   * attacker's Google account -- and the student's week would then quietly be reading a
   * stranger's calendar, which looks like the feature working.
   */
  readonly state: string
}

export function consentUrl(request: ConsentRequest): string {
  const parameters = new URLSearchParams({
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    response_type: 'code',
    scope: CALENDAR_SCOPES.join(' '),
    state: request.state,
    // Without these two Google returns an access token and no refresh token, and the
    // connection dies silently the first time that token expires -- an hour later, long
    // after anyone would connect the failure to this line.
    access_type: 'offline',
    prompt: 'consent',
  })

  return `${CONSENT_ENDPOINT}?${parameters.toString()}`
}
