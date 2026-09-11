import { getClient } from '../data/auth'

/**
 * Whether this student has a calendar connected, asked of the database rather than of Google.
 *
 * `has_google_calendar()` returns a boolean and nothing else -- not the token, not the
 * scopes, not the calendar id (see migration 0007). The app needs to know whether to offer
 * "Connect" or "Disconnect" and has no use whatever for the rest, so not returning it keeps
 * those out of the browser by construction rather than by everybody remembering not to
 * select them.
 *
 * Answers false rather than throwing when it cannot tell, exactly as `hasTelegramLink` does.
 * Claiming a connection that may not exist would show a Disconnect button for nothing and an
 * import that then fails; claiming none is honest and recoverable, since connecting again is
 * one tap.
 */
export async function hasCalendarConnected(): Promise<boolean> {
  try {
    const client = await getClient()
    const { data, error } = await client.rpc('has_google_calendar')

    return error ? false : data === true
  } catch {
    return false
  }
}
