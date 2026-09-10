import { useEffect, useState } from 'react'
import { disconnectCalendar } from '../../google/client'
import { hasCalendarConnected } from '../../google/connection'
import { Button } from '../kit/Button'

/**
 * Withdrawing calendar access, in settings beside the Telegram unlink.
 *
 * This ships with the feature rather than after it, and the reason is not politeness: a
 * stored refresh token is standing access to somebody's calendar until it is revoked, and
 * asking for that without an in-app way to take it back would leave a student's only route
 * out on a Google settings page they do not know exists.
 *
 * Shown only to a signed-in student, like `LinkTelegram` -- a grant belongs to an account,
 * and there is no account to hold one otherwise.
 */
export function CalendarConnection() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [asking, setAsking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false

    void hasCalendarConnected().then((found) => {
      if (!cancelled) setConnected(found)
    })

    return () => {
      cancelled = true
    }
  }, [])

  async function withdraw() {
    if (busy) return

    setBusy(true)
    setProblem(null)

    const ok = await disconnectCalendar()

    if (ok) {
      setConnected(false)
      setAsking(false)
    } else {
      // The endpoint leaves the row in place when Google refuses, so both sides still agree.
      // Reporting success here would tell a student the permission was gone when it is not,
      // and they would never think to check.
      //
      // Back to the resting state, carrying the reason: leaving the confirmation open would
      // show a "Yes, disconnect" button directly beneath an explanation of why disconnecting
      // has just failed.
      setAsking(false)
      setProblem('I could not withdraw the permission just now. Nothing changed — try again.')
    }

    setBusy(false)
  }

  // Still asking the database. Nothing is claimed either way until it answers.
  if (connected === null) return null

  if (!connected) {
    return (
      <p data-testid="calendar-none" className="text-sm text-ink-soft">
        No calendar connected. You can connect one from the <strong>+</strong> button.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">Google Calendar is connected.</p>

      {problem !== null && (
        <p data-testid="calendar-problem" className="text-sm text-attention">
          {problem}
        </p>
      )}

      {!asking && (
        <Button
          variant="quiet"
          size="sm"
          className="self-start"
          data-testid="calendar-disconnect"
          onClick={() => setAsking(true)}
        >
          Disconnect it
        </Button>
      )}

      {asking && (
        <>
          {/* Both halves, because the fear is the wrong one. Somebody who thinks this
              deletes the week they imported will not press it, and will be left with a
              permission they wanted gone. */}
          <p className="text-sm text-ink-soft">
            I will withdraw the permission at Google and forget it here. The blocks you
            already added stay in your week — nothing is removed from it.
          </p>
          <p className="text-xs text-ink-soft">
            You can also remove it yourself at any time at myaccount.google.com/permissions.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" data-testid="calendar-confirm" disabled={busy} onClick={() => void withdraw()}>
              {busy ? 'Withdrawing…' : 'Yes, disconnect'}
            </Button>
            <Button variant="quiet" size="sm" disabled={busy} onClick={() => setAsking(false)}>
              Keep it
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
