import { useState } from 'react'
import type { Calendar, ParsedItem } from '../../ai'
import { Button } from '../kit/Button'
import { Field } from '../kit/Field'
import { Sheet } from '../kit/Sheet'
import { ItemChip } from './ItemChip'
import { saysWhen } from './when'

/**
 * §3.1 calls manual task entry the single largest reason students abandon planners. This is
 * the way in: type it however it comes out, in any order, with no formatting.
 *
 * Nothing typed here reaches the week until the chips are accepted (§3.2).
 *
 * Owns its own `Sheet` -- the way `BlockSheet` does -- rather than being wrapped by one,
 * because its action bar depends on state (`reading`, whether there is anything to accept)
 * that only this component holds.
 */
export function PlannerScreen({
  onAccept,
  onBack,
  onClose,
  dayLabels,
  calendar,
  suggestRepeat = () => null,
}: {
  onAccept: (items: readonly ParsedItem[]) => void
  /** Ruling 60: one level up, to the chooser this was chosen from. */
  onBack: () => void
  /** Done entirely -- straight to the room, whatever depth this was opened to.
   *  Wired to `onCancel` before Ruling 60, which meant the sheet's own close control
   *  quietly dropped the student at the chooser instead of closing. */
  onClose: () => void
  /** §43: the horizon's days in a student's words, for the chip's own "when" question.
   *  Threaded from the caller because the names depend on when the week started. */
  dayLabels: readonly string[]
  /** §44: which real day the horizon's day 0 is, so a stated weekday lands on that weekday
   *  rather than on whatever `today % 7` produced. */
  calendar: Calendar
  /**
   * §37: given a freshly parsed item, a weekly series it looks like another instance of.
   *
   * Injected rather than imported, because the answer depends on the week and this screen
   * does not hold one. Applied as the chips land so the suggestion arrives *with* the row
   * the student is already checking -- §41's whole point is that recurrence is confirmed on
   * something they were adding anyway, and a suggestion made after the accept would be a
   * change made behind them. Defaults to suggesting nothing, so a caller that has no week
   * to compare against behaves exactly as before.
   */
  suggestRepeat?: (item: ParsedItem) => ParsedItem['repeat']
}) {
  const [text, setText] = useState('')
  const [items, setItems] = useState<ParsedItem[] | null>(null)
  const [reading, setReading] = useState(false)

  async function onRead() {
    setReading(true)
    try {
      /**
       * Imported here rather than at the top of the file, for the same reason the Supabase
       * client is: the parser pulls Zod in with it, and a static import put 86KB of
       * schema-validation code into the bundle every student downloads before they have
       * even seen the room. The planner is never the first screen, so the cost belongs on
       * the tap that needs it.
       */
      const { parseBrainDump } = await import('../../ai')
      const outcome = await parseBrainDump(text, calendar)
      setItems(outcome.items.map((item) => ({ ...item, repeat: item.repeat ?? suggestRepeat(item) })))
    } finally {
      // In a finally block because parseBrainDump is built never to reject -- but if that
      // ever changes, the screen must not be left stuck on "Reading…" forever.
      setReading(false)
    }
  }

  /**
   * §43: nothing reaches the week until it says when it happens.
   *
   * Most of what a student types implies no day -- "read chapter 3" -- and the old flow
   * accepted those anyway, letting `placement.ts` choose one. The entry then landed on a
   * day nobody had named. The chip asks the question; this is what makes it a question
   * rather than a suggestion.
   *
   * Only the day. An hour left at "any time" is a real answer that keeps the optimizer
   * free to place the block, and demanding one would pin everything.
   */
  const missingWhen = (items ?? []).filter((item) => !saysWhen(item))
  const canAccept = items !== null && items.length > 0 && missingWhen.length === 0

  const actions = (
    <>
      <Button onClick={() => void onRead()} disabled={reading}>
        {reading ? 'Reading…' : 'Read this'}
      </Button>
      {items !== null && items.length > 0 && (
        <Button variant="primary" onClick={() => onAccept(items)} disabled={!canAccept}>
          Add these to my week
        </Button>
      )}
    </>
  )

  return (
    <Sheet title="What are you carrying?" onClose={onClose} onBack={onBack} actions={actions}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-soft">Type it however it comes out. Any order, no formatting.</p>

        <Field label="What is on your mind">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={5}
            className="rounded-lg border border-line bg-surface p-3 text-ink"
            placeholder="essay due friday 2000 words haven't started, mums birthday sunday, gym, laundry"
          />
        </Field>

        {missingWhen.length > 0 && (
          <p data-testid="when-blocked" role="status" className="text-sm text-attention">
            {missingWhen.length === 1
              ? 'One of these does not say when it happens. Pick a day for it before adding.'
              : `${missingWhen.length} of these do not say when they happen. Pick a day for each before adding.`}
          </p>
        )}

        {items !== null && items.length === 0 && (
          <p className="text-sm text-ink-soft">
            I could not find anything in that. Type something and try again.
          </p>
        )}

        {items !== null && items.length > 0 && (
          // A gate, not a preview. The list wraps rather than scrolling sideways, per
          // §10's width requirement.
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
