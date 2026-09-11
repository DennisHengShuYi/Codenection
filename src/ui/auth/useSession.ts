import { useCallback, useEffect, useState } from 'react'
import { getSession, onSessionChange, type Session } from '../../data'
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
/**
 * Whether two sessions describe the same account in the same way.
 *
 * Compared field by field rather than by identity, because Supabase builds a fresh object
 * for every announcement it makes -- and it announces the same account often: on a token
 * refresh, when a second tab signs in, and whenever another client is constructed. Handing
 * each of those to React as a new object rebuilds the repository in App's `useMemo` and
 * reloads the week, which is how routine chatter becomes a render loop.
 */
const sameAccount = (a: Session | null, b: Session | null): boolean =>
  a !== null &&
  b !== null &&
  a.userId === b.userId &&
  a.email === b.email &&
  a.name === b.name &&
  a.avatarUrl === b.avatarUrl

export function useSession(): {
  session: Session | null
  loading: boolean
  setSession: (next: Session | null) => void
  signedIn: (next: Session) => void
} {
  const [session, setSessionState] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  /** Keeps the existing object when nothing about the account changed, so everything keyed
   *  on the session -- the repository above all -- is not rebuilt for no reason. */
  const setSession = useCallback((next: Session | null) => {
    setSessionState((current) => (sameAccount(current, next) ? current : next))
  }, [])


  /**
   * A sign-in, whichever door it came through.
   *
   * This used to copy the signed-out preview into the account as well, and that is
   * deliberately gone: **the preview is only ever a preview.** The copy could not tell a
   * fortnight a student had actually built from the demo week the app seeds them, and
   * `RoomShell`'s anchor effect persists that seed on the very first render -- so there was
   * always one waiting, and every new account was born holding `umCrunchWeek`'s UM
   * timetable over a dial reading somebody else's depletion.
   *
   * What it costs is real and worth stating: somebody who builds a genuine week while
   * looking around, then signs up, now starts their account empty. That is the trade the
   * old comment here was refusing -- and the reason to take it anyway is that the failure
   * runs the other way. Losing a preview is an annoyance the student can see and redo;
   * being handed a stranger's fortnight as a measurement of your own week is the app
   * lying about the one thing it exists to report.
   */
  const signedIn = useCallback((next: Session) => {
    scrubAuthFragmentFromUrl()
    setSession(next)
  }, [setSession])

  useEffect(() => {
    let cancelled = false

    void getSession().then((found) => {
      if (cancelled) return

      // Set directly rather than through `signedIn`: a session that was already there is
      // somebody returning, not somebody arriving back from a redirect, so there is no
      // token in the address to clean out.
      setSession(found)
      setLoading(false)
    })

    // Sign-ins and sign-outs elsewhere. Without this, signing out in one tab leaves
    // another holding a stale session and writing to a store it no longer has access to.
    const stop = onSessionChange((next) => {
      if (cancelled) return

      if (next === null) {
        setSession(null)
        return
      }

      signedIn(next)
    })

    return () => {
      cancelled = true
      stop()
    }
  }, [signedIn, setSession])

  return { session, loading, setSession, signedIn }
}
