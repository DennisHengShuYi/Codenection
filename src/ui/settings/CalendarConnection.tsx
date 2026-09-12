import { useEffect, useState } from 'react'
import { beginConnect, disconnectCalendar } from '../../google/client'
import { hasCalendarConnected } from '../../google/connection'
import { Button } from '../kit/Button'

/**
 * Connecting and withdrawing calendar access, in settings beside the Telegram card.
 *
 * The withdrawing half ships with the feature rather than after it, and the reason is not
 * politeness: a stored refresh token is standing access to somebody's calendar until it is
 * revoked, and asking for that without an in-app way to take it back would leave a student's
 * only route out on a Google settings page they do not know exists.
 *
 * The connecting half is newer, and was a sentence: "No calendar connected. You can connect
 * one from the + button." True, and an odd thing to find in a panel whose neighbour offers
 * Link Telegram in place. A student looking for their integrations found one they could act
 * on and one they had to be told where to look for.
 *
 * `beginConnect` is the same door the import screen presses, not a second copy of it: one
 * consent flow, one set of failure sentences. It navigates away on success, which is why
 * nothing here reports one -- the page is leaving.
 *
 * Shown only to a signed-in student, like `LinkTelegram` -- a grant belongs to an account,
 * and there is no account to hold one otherwise.
 */
export function CalendarConnection() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [asking, setAsking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    let cancelled = false

    void hasCalendarConnected().then((found) => {
      if (!cancelled) setConnected(found)
    })

    return () => {
      cancelled = true
    }
  }, [])

  async function connect() {
    if (connecting) return

    setConnecting(true)
    // Cleared first: a message about a previous attempt, still on screen while a new one is
    // under way, is a complaint about something that may have just succeeded.
    setProblem(null)

    const outcome = await beginConnect()

    // Only a refusal lands here. Success is a navigation to Google, so the component is
    // already on its way out and a state update would be about a page nobody is looking at.
    if (!outcome.ok) {
      setProblem(outcome.reason)
      setConnecting(false)
    }
  }

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
      <section
        data-testid="calendar-card"
        className="flex flex-col gap-2 rounded-lg border border-line p-3 text-sm"
      >
        <h2 className="font-medium">Google Calendar</h2>

        {/* Said before the button, not after, and in the same words the import screen uses:
            somebody about to hand over access should know what is being asked for and what
            will be done with it while they can still decline. */}
        <p className="text-ink-soft">
          Read the next three weeks and choose what becomes part of your week. I never change
          anything in your existing calendars.
        </p>

        <Button
          size="sm"
          className="self-start"
          data-testid="calendar-connect"
          disabled={connecting}
          onClick={() => void connect()}
        >
          {connecting ? 'Opening Google…' : 'Connect Google Calendar'}
        </Button>

        {problem !== null && (
          <p role="alert" data-testid="calendar-problem" className="text-attention">
            {problem}
          </p>
        )}
      </section>
    )
  }

  return (
    <section
      data-testid="calendar-card"
      className="flex flex-col gap-2 rounded-lg border border-line p-3 text-sm"
    >
      <h2 className="font-medium">Google Calendar</h2>
      <p className="text-ink-soft">Connected. Read it from the <strong>+</strong> button.</p>

      {problem !== null && (
        <p role="alert" data-testid="calendar-problem" className="text-attention">
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
          <p className="text-ink-soft">
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
    </section>
  )
}
