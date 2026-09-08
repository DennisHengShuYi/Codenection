import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createLocalRepository,
  createRepository,
  getSession,
  onSessionChange,
  type Session,
} from '../../data'
import { carryOverWeek } from '../../data/carryOver'
import { scrubAuthFragmentFromUrl } from './scrubAuthFragment'

/**
 * The current session, and whether we have finished looking for one.
 *
 * `loading` matters more than it appears. Without it the app renders the signed-out
 * preview for a frame before the stored session resolves, so a signed-in student sees a
 * flash of "you are not signed in" every time they open the app.
 *
 * This is also where a sign-in is *received*, whichever door it came through -- the form,
 * another tab, or the redirect back from Google. The redirect is the reason that has to be
 * true here rather than in the sign-in screen: it never touches that screen, so anything
 * living in its callback would simply not happen for a Google sign-in.
 */
export function useSession(): {
  session: Session | null
  loading: boolean
  setSession: (next: Session | null) => void
  signedIn: (next: Session) => void
} {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  /** The account whose preview week has already been copied across. Supabase reports the
   *  same session more than once in normal operation, and copying twice would put a
   *  preview over real data the second time. */
  const carriedOver = useRef<string | null>(null)

  const signedIn = useCallback((next: Session) => {
    if (carriedOver.current === next.userId) {
      setSession(next)
      return
    }

    carriedOver.current = next.userId
    scrubAuthFragmentFromUrl()

    // Not awaited before the session changes: a slow copy must not hold somebody on the
    // sign-in screen after they have successfully signed in.
    //
    // The target is a fallback repository, so its read can answer from browser storage --
    // the very place the preview lives. That is benign either way: with Supabase reachable
    // and the account new it reads null and the copy runs, which is the case that matters;
    // with Supabase unreachable it reads the preview back and skips, and the week is
    // already exactly where it would have been copied to.
    void carryOverWeek(createLocalRepository(), createRepository(next)).finally(() =>
      setSession(next),
    )
  }, [])

  useEffect(() => {
    let cancelled = false

    void getSession().then((found) => {
      if (cancelled) return

      // A session that was already there is somebody returning, not somebody signing in.
      // Marking it as carried is what stops the app copying browser storage over the
      // account's real week on every single load.
      if (found) carriedOver.current = found.userId

      setSession(found)
      setLoading(false)
    })

    // Sign-ins and sign-outs elsewhere. Without this, signing out in one tab leaves
    // another holding a stale session and writing to a store it no longer has access to.
    const stop = onSessionChange((next) => {
      if (cancelled) return

      if (next === null) {
        // Forgotten on sign-out, so that signing back in -- possibly after building a new
        // preview while signed out -- carries that preview across like any other sign-in.
        carriedOver.current = null
        setSession(null)
        return
      }

      signedIn(next)
    })

    return () => {
      cancelled = true
      stop()
    }
  }, [signedIn])

  return { session, loading, setSession, signedIn }
}
