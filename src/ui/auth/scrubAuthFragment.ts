/** The part of the fragment Supabase puts a session in. Matching on this rather than on
 *  "there is a fragment" is what keeps a genuine in-page link intact. */
const TOKEN_MARKER = 'access_token'

/**
 * Removes a session token from the address bar after a redirect sign-in.
 *
 * Google hands the session back in the part of the address after the `#`. Supabase's client
 * reads it from there and is supposed to clear it itself, but that cleanup can lag a paint
 * behind -- long enough to be caught in a screen share, and long enough to be left in the
 * address bar and the browser history.
 *
 * The fragment is never sent to any server either way, so this is not the difference
 * between safe and unsafe. It is the difference between a token being visible for a moment
 * and being visible for as long as the tab is open, and the second is not worth allowing
 * for the sake of two lines.
 *
 * Replaced rather than pushed: a new history entry would mean pressing back returns to an
 * address still carrying the token.
 */
export function scrubAuthFragmentFromUrl(): void {
  if (!window.location.hash.includes(TOKEN_MARKER)) return

  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}
