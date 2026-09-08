import { useState } from 'react'
import { parseBrainDump, type ParsedItem } from '../../ai'
import { ItemChip } from './ItemChip'

/**
 * §3.1 calls manual task entry the single largest reason students abandon planners. This is
 * the way in: type it however it comes out, in any order, with no formatting.
 *
 * Nothing typed here reaches the week until the chips are accepted (§3.2).
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
      const outcome = await parseBrainDump(text)
      setItems([...outcome.items])
    } finally {
      // In a finally block because parseBrainDump is built never to reject -- but if that
      // ever changes, the screen must not be left stuck on "Reading…" forever.
      setReading(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-screen-md flex-col gap-4 p-4">
      <header>
        <h1 className="text-2xl font-semibold">What are you carrying?</h1>
        <p className="text-sm opacity-70">Type it however it comes out. Any order, no formatting.</p>
      </header>

      <label className="flex flex-col gap-1 text-sm">
        What is on your mind
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
          className="rounded-lg border border-slate-300 p-3"
          placeholder="essay due friday 2000 words haven't started, mums birthday sunday, gym, laundry"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onRead()}
          disabled={reading}
          className="rounded-lg bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
        >
          {reading ? 'Reading…' : 'Read this'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-3 underline">
          Cancel
        </button>
      </div>

      {items !== null && items.length === 0 && (
        <p className="text-sm opacity-80">
          I could not find anything in that. Type something and try again.
        </p>
      )}

      {items !== null && items.length > 0 && (
        <>
          {/* A gate, not a preview. The list wraps rather than scrolling sideways, per
              §10's width requirement. */}
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

          <button
            type="button"
            onClick={() => onAccept(items)}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-white sm:w-auto"
          >
            Add these to my week
          </button>
        </>
      )}
    </main>
  )
}
