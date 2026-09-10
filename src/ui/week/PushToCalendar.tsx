import { useEffect, useMemo, useState } from 'react'
import { pushCalendar } from '../../google/client'
import { hasCalendarConnected } from '../../google/connection'
import { CALENDAR_NAME, plannedEvents } from '../../google/push'
import type { Schedule } from '../../optimizer'
import { isAnchored } from '../../domain/calendar'
import { Button } from '../kit/Button'

/**
 * Sending the week out to the student's Google Calendar, as a thing they press.
 *
 * Deliberately not a background sync. This writes into a real calendar that other people
 * may be looking at, and anything that appears there is something the student then has to
 * explain, move, or delete. So it says what it will do in numbers, waits, and reports what
 * actually happened rather than what was planned.
 *
 * The counts come from `plannedEvents`, which is also what the endpoint writes -- one pure
 * function, so the sentence shown here cannot drift from the events that land.
 */
export function PushToCalendar(props: { readonly schedule: Schedule; readonly today: number }) {
  const { schedule, today } = props
  const [connected, setConnected] = useState<boolean | null>(null)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void hasCalendarConnected().then((found) => {
      if (!cancelled) setConnected(found)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const events = useMemo(() => plannedEvents(schedule, today), [schedule, today])

  async function write() {
    if (busy) return

    setBusy(true)
    setProblem(null)

    try {
      // The zone comes from the browser because the browser is the only thing that knows
      // it: the week model has no timezone in it at all, and a block at 9 means 9 where the
      // student is.
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const result = await pushCalendar(events, zone)

      // Read back from what the endpoint counted, not from what was planned. A partial
      // write is a real outcome, and saying "your week is in your calendar" when a third of
      // it is not gives somebody no reason to look again.
      setDone(
        `${result.created} added, ${result.updated} updated, ${result.removed} removed in ${CALENDAR_NAME}.`,
      )
      setAsking(false)
    } catch {
      setProblem('I could not write to your calendar just now. Nothing was changed — try again.')
      setAsking(false)
    }

    setBusy(false)
  }

  // Still asking. Nothing is claimed either way until it answers.
  if (connected === null || !connected) return null

  /**
   * A week with no anchor has no real dates, so there is nowhere truthful to write it.
   * Offering the button and then writing nothing would be worse than saying so -- the
   * student would believe their calendar had been filled.
   */
  if (!isAnchored(schedule)) {
    return (
      <p data-testid="push-undated" className="text-sm text-ink-soft">
        This week has no dates on it yet, so there is nothing I can put in a calendar.
        Rebalance once and it will pick up today's date.
      </p>
    )
  }

  if (events.length === 0) {
    return (
      <p data-testid="push-nothing" className="text-sm text-ink-soft">
        Nothing left in this week to send to your calendar.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {done !== null && (
        <p data-testid="push-done" role="status" className="text-sm text-ink-soft">
          {done}
        </p>
      )}

      {problem !== null && (
        <p data-testid="push-problem" role="status" className="text-sm text-attention">
          {problem}
        </p>
      )}

      {!asking && (
        <Button
          variant="quiet"
          size="sm"
          className="self-start"
          data-testid="push-calendar"
          onClick={() => setAsking(true)}
        >
          Send this week to my calendar
        </Button>
      )}

      {asking && (
        <>
          {/* Said in numbers, and said before rather than after. The count is the same one
              that gets written, because both come from `plannedEvents`. */}
          <p className="text-sm text-ink-soft">
            I will write {events.length} block{events.length === 1 ? '' : 's'} to a calendar
            called <strong>{CALENDAR_NAME}</strong>, which this app made for exactly this.
            Nothing else in your calendar is touched, and days before today are left alone.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" data-testid="push-confirm" disabled={busy} onClick={() => void write()}>
              {busy ? 'Writing…' : 'Send it'}
            </Button>
            <Button variant="quiet" size="sm" disabled={busy} onClick={() => setAsking(false)}>
              Not now
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
