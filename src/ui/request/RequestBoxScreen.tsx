import { useState } from 'react'
import type { Draft, ParsedItem } from '../../ai'
import { addItems } from '../../domain/addItems'
import { priceRequest, type RequestCost } from '../../domain/requestCost'
import { DEFAULT_PARAMS, project } from '../../engine'
import { toDayInputs, type Schedule } from '../../optimizer'
import { ItemChip } from '../planner/ItemChip'
import { RoomComparison } from '../room/RoomComparison'
import { roomModel } from '../room/roomModel'
import { DEFAULT_PROFILE } from '../../domain/calibration'

const TONE_LABELS: Record<Draft['tone'], string> = {
  decline: 'A soft no',
  defer: 'Not now, but later',
  accept: 'Yes, with the cost said out loud',
}

/** The comparison takes models now that the room does, so the two rooms carry their own
 *  controls rather than being inert pictures. */
const roomFor = (schedule: Schedule) =>
  roomModel({ schedule, profile: DEFAULT_PROFILE, today: 0 })

/**
 * §2.3's request box.
 *
 * Someone asks you for something; this prices it in what it costs, shows the room you would
 * be living in, and drafts the reply in three tones. The student decides.
 *
 * Nothing here sends anything. §2.3 rejected messaging integration outright -- a share
 * target is Android-only for PWAs and unsupported on iOS -- so the app does the *work* of
 * declining and hands over the words. There is deliberately no send button, and a test
 * asserts its absence.
 */
export function RequestBoxScreen({
  schedule,
  onAccept,
  onCancel,
}: {
  schedule: Schedule
  onAccept: (item: ParsedItem) => void
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const [item, setItem] = useState<ParsedItem | null>(null)
  const [cost, setCost] = useState<RequestCost | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  async function onPrice(source = text, existing: ParsedItem | null = null) {
    setWorking(true)
    setProblem(null)

    try {
      // Loaded on the tap, like the planner: the parser pulls Zod in with it and this is
      // never the first screen a student sees.
      const { readRequest, draftReplies } = await import('../../ai')

      const read = existing ?? (await readRequest(source))
      if (!read) {
        setProblem('I could not find a request in that. Try describing what you were asked for.')
        setItem(null)
        setCost(null)
        return
      }

      const priced = priceRequest(schedule, read, DEFAULT_PARAMS)
      setItem(read)
      setCost(priced)
      setEdited({})

      const outcome = await draftReplies(read, priced)
      setDrafts([...outcome.drafts])
    } finally {
      setWorking(false)
    }
  }

  async function onCopy(draft: Draft) {
    const body = edited[draft.tone] ?? draft.text

    try {
      await navigator.clipboard.writeText(body)
      setCopied(draft.tone)
    } catch {
      // Clipboard access can be denied outright. A copy button that silently does nothing
      // is worse than one that tells you to select the text yourself.
      setCopied(null)
      setProblem('I could not reach your clipboard — select the text and copy it yourself.')
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-screen-md flex-col gap-4 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Someone asked you for something</h1>
        <p className="text-sm opacity-70">
          Paste it here and see what saying yes would actually cost.
        </p>
      </header>

      <label className="flex flex-col gap-1 text-sm">
        What you were asked
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          className="rounded-lg border border-slate-300 p-3"
          placeholder="hey can you help with our FYP presentation next thursday, maybe 3 hours?"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onPrice()}
          disabled={working}
          className="rounded-lg bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
        >
          {working ? 'Working it out…' : 'What would this cost?'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-3 underline">
          Cancel
        </button>
      </div>

      {problem !== null && (
        <p data-testid="request-problem" role="status" className="text-sm text-amber-900">
          {problem}
        </p>
      )}

      {item !== null && cost !== null && (
        <>
          {/* Correctable before it counts: the student must be able to fix "3 hours" before
              being priced on it. */}
          <ul className="flex flex-col gap-3">
            <ItemChip
              item={item}
              onChange={(next) => void onPrice(text, next)}
              onRemove={() => {
                setItem(null)
                setCost(null)
                setDrafts([])
              }}
            />
          </ul>

          {/* Stated in reserve, the app's own unit. §2.3 says "pushes you to 105%", which is
              committed load against capacity -- a metric this app does not have, and a second
              percentage moving the opposite way would contradict the dial. */}
          <p data-testid="request-cost" role="status" className="text-sm">
            Saying yes takes you from {Math.round(cost.floorBefore)} to{' '}
            {Math.round(cost.floorAfter)} at your lowest point
            {cost.eveningsEquivalent >= 1 &&
              ` — about ${cost.eveningsEquivalent === 1 ? 'an evening' : `${cost.eveningsEquivalent} evenings`} of downtime`}
            .
            {cost.firstDeficitDayAfter !== null &&
              cost.firstDeficitDayAfter !== cost.firstDeficitDayBefore &&
              ` It brings your deficit forward to day ${cost.firstDeficitDayAfter}.`}
            {!cost.absorbable && ' Your fortnight cannot really take this.'}
          </p>

          {/* §2.3, via §1.3: the warning is shown as two rooms. */}
          <RoomComparison now={roomFor(schedule)} ifAccepted={roomFor(addItems(schedule, [item]))} />

          {drafts.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-medium">What you could say</h2>

              {drafts.map((draft) => (
                <div key={draft.tone} className="flex flex-col gap-1 rounded-lg bg-slate-100 p-3">
                  <label className="text-xs font-medium uppercase tracking-wide opacity-70">
                    {TONE_LABELS[draft.tone]}
                    <textarea
                      data-testid={`draft-${draft.tone}`}
                      value={edited[draft.tone] ?? draft.text}
                      onChange={(event) =>
                        setEdited({ ...edited, [draft.tone]: event.target.value })
                      }
                      rows={3}
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-sm font-normal normal-case tracking-normal"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void onCopy(draft)}
                    className="self-start text-sm underline"
                  >
                    {copied === draft.tone ? 'Copied' : 'Copy'}
                  </button>
                </div>
              ))}
            </section>
          )}

          {/* Separate from copying on purpose: a student may copy the decline and want
              nothing in their week. */}
          <button
            type="button"
            onClick={() => onAccept(item)}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-white sm:w-auto"
          >
            Take it on
          </button>
        </>
      )}
    </main>
  )
}
