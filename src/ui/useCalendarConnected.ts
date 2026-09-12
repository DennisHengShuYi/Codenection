import { useCallback, useEffect, useState } from 'react'
import { hasCalendarConnected } from '../google/connection'

/**
 * Whether this student has a calendar connected, where the add flow can see it.
 *
 * `CalendarConnection` in settings has asked this since the feature shipped, and the import
 * screen -- the one place a student actually connects from -- never did. `RoomShell` passed
 * no `calendarConnected`, so `AddSheet`'s default of `false` stood for everybody, always:
 * the screen offered "Connect Google Calendar" to somebody who had already connected, and
 * offered "Read my calendar" to nobody, which is why no calendar event ever reached a week.
 *
 * False while it is still asking and false when it cannot tell, which is the same choice
 * `hasCalendarConnected` makes one layer down and for its reason. The two mistakes are not
 * equal: offering the connect step to somebody already connected costs them one redirect
 * that lands straight back here, where claiming a connection that is not there offers a Read
 * button that can only fail.
 *
 * Takes whether there is a session rather than reading one, because the shell already holds
 * it and a grant belongs to an account -- asking on behalf of a signed-out visitor is a round
 * trip that can only answer no.
 */
export function useCalendarConnected(signedIn: boolean): {
  readonly connected: boolean
  /** Ask again. Disconnecting happens on another screen entirely, so this cannot hold
   *  whatever was true when the room mounted. */
  readonly refresh: () => void
} {
  const [connected, setConnected] = useState(false)
  const [asked, setAsked] = useState(0)

  const refresh = useCallback(() => setAsked((count) => count + 1), [])

  useEffect(() => {
    if (!signedIn) {
      setConnected(false)
      return
    }

    let live = true

    void hasCalendarConnected().then((found) => {
      // A late answer landing on an unmounted room is a React warning and a write to state
      // nothing is watching.
      if (live) setConnected(found)
    })

    return () => {
      live = false
    }
  }, [signedIn, asked])

  return { connected, refresh }
}
