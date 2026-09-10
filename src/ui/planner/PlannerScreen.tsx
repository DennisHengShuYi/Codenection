import { useState } from 'react'
import type { ParsedItem } from '../../ai'
import { Button } from '../kit/Button'
import { Field } from '../kit/Field'
import { Sheet } from '../kit/Sheet'
import { ItemChip } from './ItemChip'

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
  onCancel,
}: {
  onAccept: (items: readonly ParsedItem[]) => void
  onCancel: () => void
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
      const outcome = await parseBrainDump(text)
      setItems([...outcome.items])
    } finally {
      // In a finally block because parseBrainDump is built never to reject -- but if that
      // ever changes, the screen must not be left stuck on "Reading…" forever.
      setReading(false)
    }
  }

  const canAccept = items !== null && items.length > 0

  const actions = (
    <>
      <Button variant="quiet" onClick={onCancel}>
        Cancel
      </Button>
      <Button onClick={() => void onRead()} disabled={reading}>
        {reading ? 'Reading…' : 'Read this'}
      </Button>
      {canAccept && (
        <Button variant="primary" onClick={() => onAccept(items)}>
          Add these to my week
        </Button>
      )}
    </>
  )

  return (
    <Sheet title="What are you carrying?" onClose={onCancel} actions={actions}>
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
