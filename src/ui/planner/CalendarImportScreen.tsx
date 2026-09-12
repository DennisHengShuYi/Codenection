import { useState } from 'react'
import type { ParsedItem } from '../../ai'
import { Button } from '../kit/Button'
import { Sheet } from '../kit/Sheet'
import { ItemChip } from './ItemChip'
import { saysWhen } from './when'

/**
 * §1.4's optional calendar supplement, as a fourth way in.
 *
 * Modelled on `PhotoImportScreen`, deliberately and closely: the same loading state, the
 * same human failure sentence, the same chips, and nothing accepted until the student
 * presses the button. §1.4 is blunt about why -- "Never import silently. Confirm screen,
 * low-confidence rows flagged, one-tap correction. A wrong class time silently poisoning
 * every prediction is the fastest way to lose trust, and users cannot debug what they never
 * saw" -- and a calendar can bring in fifty rows at once, so it matters more here than for a
 * photo, not less.
 *
 * The screen owns its own `Sheet`, as the other import screens do, because its actions
 * depend on state only it holds.
 */
export function CalendarImportScreen({
  connected,
  onConnect,
  onRead,
  onAccept,
  onBack,
  onClose,
  dayLabels,
  suggestRepeat = () => null,
}: {
  /** Whether this student has already granted calendar access. */
  readonly connected: boolean
  /** Sends them to Google's consent screen. */
  /**
   * Starts the consent flow, and returns what to tell the student when it could not start
   * -- null while it is going ahead (Ruling 63).
   *
   * It returned nothing at all before, and `AddSheet` discarded the promise, so a refusal
   * reached a browser console and a missing session reached nobody.
   */
  readonly onConnect: () => Promise<string | null>
  /** Reads the fortnight. Returns the items, plus how many were left out for being outside
   *  it -- said out loud rather than quietly dropped. */
  readonly onRead: () => Promise<{ items: readonly ParsedItem[]; skipped: number }>
  readonly onAccept: (items: readonly ParsedItem[]) => void
  /** Ruling 60: one level up, to the chooser this was chosen from. */
  readonly onBack: () => void
  /** Done entirely -- straight to the room, whatever depth this was opened to. Distinct
   *  from `onBack`, which is what a single `onCancel` used to conflate. */
  readonly onClose: () => void
  /** Ruling 43: the horizon's days in a student's words, for the chip's "when" question. */
  readonly dayLabels: readonly string[]
  readonly suggestRepeat?: (item: ParsedItem) => ParsedItem['repeat']
}) {
  const [items, setItems] = useState<ParsedItem[] | null>(null)
  const [skipped, setSkipped] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const [reading, setReading] = useState(false)

  async function read() {
    setReading(true)
    setProblem(null)
    setItems(null)

    try {
      const outcome = await onRead()
      setItems(outcome.items.map((item) => ({ ...item, repeat: item.repeat ?? suggestRepeat(item) })))
      setSkipped(outcome.skipped)
    } catch (failure) {
      /*
       * The reason where there is one, "try again" where there is not.
       *
       * Every failure used to become the sentence below, which is right for a network that
       * died or for Google being briefly unwell -- and wrong for the two the endpoint can
       * now name: a grant that does not carry the scope, and a deployment whose Calendar API
       * was never switched on. For both, trying again is not what fixes it, and telling
       * somebody to wait when waiting cannot help is worse than saying nothing.
       *
       * Only a sentence written for a student is shown. `could not read calendar` is this
       * app's own internal wording and a `TypeError` is the browser's, so anything that did
       * not come from the endpoint falls through to the honest general answer.
       */
      const said = failure instanceof Error ? failure.message : ''
      const forAStudent = said !== '' && said !== 'could not read calendar' && said.includes(' ') && /[.!?]$/.test(said)

      setProblem(
        forAStudent ? said : 'I could not read your calendar just now. Try again in a moment.',
      )
    } finally {
      setReading(false)
    }
  }

  /**
   * Ruling 43, as in the other two import screens. A calendar row almost always says when it
   * happens -- that is the whole reason to read one -- but almost always is not always, and
   * a row that arrived without a day must be asked about rather than placed on a day nobody
   * named.
   */
  const missingWhen = (items ?? []).filter((item) => !saysWhen(item))
  const canAccept = items !== null && items.length > 0 && missingWhen.length === 0

  const actions = (
    <>
      {items !== null && items.length > 0 && (
        <Button data-testid="calendar-accept" onClick={() => onAccept(items)} disabled={!canAccept}>
          Add these to my week
        </Button>
      )}
    </>
  )

  return (
    <Sheet title="From my calendar" onClose={onClose} onBack={onBack} actions={actions}>
      <div className="flex flex-col gap-4">
        {!connected && (
          <>
            {/* Said before the button, not after. A student about to hand over access to
                their calendar should know what is being asked for and what will be done
                with it while they can still decline. */}
            <p className="text-sm text-ink-soft">
              I will read the next three weeks of your calendar and show you what I found. You
              choose what becomes part of your week — nothing is added until you say so.
            </p>
            <p className="text-sm text-ink-soft">
              I never change anything in your existing calendars.
            </p>
            <Button
              data-testid="calendar-connect"
              onClick={() => {
                // Cleared first: a message about a previous attempt, still on screen while
                // a new one is under way, is a complaint about something that may have
                // just succeeded.
                setProblem(null)
                void onConnect().then((reason) => setProblem(reason))
              }}
            >
              Connect Google Calendar
            </Button>
          </>
        )}

        {connected && items === null && !reading && (
          <>
            <p className="text-sm text-ink-soft">
              Your calendar is connected. This reads the fortnight you are in — nothing
              before it, nothing after.
            </p>
            <Button data-testid="calendar-read" onClick={() => void read()}>
              Read my calendar
            </Button>
          </>
        )}

        {reading && (
          <p data-testid="calendar-reading" className="text-sm text-ink-soft">
            Reading your calendar…
          </p>
        )}

        {problem !== null && (
          <p data-testid="calendar-problem" className="text-sm text-attention">
            {problem}
          </p>
        )}

        {items !== null && items.length === 0 && (
          <p data-testid="calendar-empty" className="text-sm text-ink-soft">
            Nothing in your calendar falls inside this fortnight. Photograph your timetable or
            type it out instead — both work without a calendar.
          </p>
        )}

        {skipped > 0 && (
          <p data-testid="calendar-skipped" className="text-xs text-ink-soft">
            {skipped === 1
              ? 'One event was outside this fortnight, so I left it out.'
              : `${skipped} events were outside this fortnight, so I left them out.`}
          </p>
        )}

        {items !== null && items.length > 0 && (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <ItemChip
                key={item.id}
                item={item}
                dayLabels={dayLabels}
                onChange={(next) =>
                  setItems(items.map((existing) => (existing.id === next.id ? next : existing)))
                }
                onRemove={(id) => setItems(items.filter((existing) => existing.id !== id))}
              />
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  )
}
