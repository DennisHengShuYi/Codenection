import { useEffect, useState } from 'react'
import { getSession, onSessionChange, type Session } from '../../data'

/**
 * The current session, and whether we have finished looking for one.
 *
 * `loading` matters more than it appears. Without it the app renders the signed-out
 * preview for a frame before the stored session resolves, so a signed-in student sees a
 * flash of "you are not signed in" every time they open the app.
 */
export function useSession(): {
  session: Session | null
  loading: boolean
  setSession: (next: Session | null) => void
} {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    void getSession().then((found) => {
      if (cancelled) return
      setSession(found)
      setLoading(false)
    })

    // Sign-ins and sign-outs elsewhere. Without this, signing out in one tab leaves
    // another holding a stale session and writing to a store it no longer has access to.
    const stop = onSessionChange((next) => {
      if (!cancelled) setSession(next)
    })

    return () => {
      cancelled = true
      stop()
    }
  }, [])

  return { session, loading, setSession }
}
