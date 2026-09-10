import { useState } from 'react'
import type { Calendar, Draft, ParsedItem } from '../../ai'
import { addItems } from '../../domain/addItems'
import type { EnergyPrediction } from '../../domain/predictions'
import type { BlockRecord } from '../../domain/blockLog'
import { priceRequest, type RequestCost } from '../../domain/requestCost'
import type { EngineParams } from '../../engine'
import { toDayInputs, type Schedule } from '../../optimizer'
import { Button } from '../kit/Button'
import { Card } from '../kit/Card'
import { Field } from '../kit/Field'
import { Sheet } from '../kit/Sheet'
import { ItemChip } from '../planner/ItemChip'
import { saysWhen } from '../planner/when'
import { RoomComparison } from '../room/RoomComparison'
import { roomModel } from '../room/roomModel'
import { DEFAULT_PROFILE } from '../../domain/calibration'

const TONE_LABELS: Record<Draft['tone'], string> = {
  decline: 'A soft no',
  defer: 'Not now, but later',
  accept: 'Yes, with the cost said out loud',
}

/** `today: 0` on purpose: both rooms are drawn from the same week at the same moment, so
 *  what differs between them is the request and nothing else.
 *
 *  The block log is not: Ruling 51 made `roomModel`'s `blockLog` required, and this call
 *  site was the one taking the old `[]` default -- so the gauge on both rooms quoted a
 *  reserve computed as though the student had answered nothing, beside a request cost
 *  computed from their real calibration. Two numbers for one week, on one screen. */
const roomFor = (
  schedule: Schedule,
  blockLog: readonly BlockRecord[],
  predictions: readonly EnergyPrediction[],
) => roomModel({ schedule, today: 0, blockLog, predictions })

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
 *
 * Owns its own `Sheet`, the same as the other two input paths -- its action bar depends on
 * `working` and on whether a request has been priced yet, both held only here.
 */
export function RequestBoxScreen({
  schedule,
  params,
  today,
  blockLog,
  predictions,
  onAccept,
  onBack,
  onClose,
  dayLabels,
  calendar,
}: {
  schedule: Schedule
  /** §2.4's calibrated params -- the student's own measured estimate bias, not the
   *  population default. `RoomShell` already computes these from the durable block log for
   *  every other screen; this one must be priced against the same numbers. */
  params: EngineParams
  /** Injected rather than read, so this stays pure -- `RoomShell` supplies it. */
  today: number
  /** §6.5/§8b's check-in evidence, threaded through so the price shown here is judged
   *  against the same silence-aware projection the room and the dial already show. */
  blockLog: readonly BlockRecord[]
  /** §8.1's resolved predictions, for the same reason the block log is here: both rooms
   *  drawn on this screen must run the model the rest of the app runs, not the population
   *  one. This is the call site the identical mistake was made at once already. */
  predictions: readonly EnergyPrediction[]
  onAccept: (item: ParsedItem) => void
  /** Ruling 60: one level up, to the chooser this was chosen from. */
  onBack: () => void
  /** Done entirely -- straight to the room, whatever depth this was opened to.
   *  Wired to `onCancel` before Ruling 60, which meant the sheet's own close control
   *  quietly dropped the student at the chooser instead of closing. */
  onClose: () => void
  /** §43: the horizon's days in a student's words, for the chip's "when" question. */
  dayLabels: readonly string[]
  /** §44: which real day the horizon's day 0 is, so "next thursday" means that thursday. */
  calendar: Calendar
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

      const read = existing ?? (await readRequest(source, calendar))
      if (!read) {
        setProblem('I could not find a request in that. Try describing what you were asked for.')
        setItem(null)
        setCost(null)
        return
      }

      const priced = priceRequest(schedule, read, params, today, blockLog)
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

  const actions = (
    <>
      <Button onClick={() => void onPrice()} disabled={working}>
        {working ? 'Working it out…' : 'What would this cost?'}
      </Button>
      {/* Separate from copying on purpose: a student may copy the decline and want
          nothing in their week. */}
      {item !== null && cost !== null && (
        <Button onClick={() => onAccept(item)} disabled={!saysWhen(item)}>
          Take it on
        </Button>
      )}
    </>
  )

  return (
    <Sheet title="Someone asked you for something" onClose={onClose} onBack={onBack} actions={actions}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-soft">
          Paste it here and see what saying yes would actually cost.
        </p>

        <Field label="What you were asked">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={4}
            className="rounded-lg border border-line bg-surface p-3 text-ink"
            placeholder="hey can you help with our FYP presentation next thursday, maybe 3 hours?"
          />
        </Field>

        {problem !== null && (
          <p data-testid="request-problem" role="status" className="text-sm text-attention">
            {problem}
          </p>
        )}

        {item !== null && cost !== null && (
          <>
            {/* Correctable before it counts: the student must be able to fix "3 hours" before
                being priced on it. */}
            <ul className="flex flex-col gap-3">
              <ItemChip
                dayLabels={dayLabels}
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
            <RoomComparison
              now={roomFor(schedule, blockLog, predictions)}
              ifAccepted={roomFor(addItems(schedule, [item]), blockLog, predictions)}
            />

            {drafts.length > 0 && (
              <section className="flex flex-col gap-3">
                <h3 className="text-lg font-medium text-ink">What you could say</h3>

                {drafts.map((draft) => (
                  <Card key={draft.tone} className="flex flex-col gap-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                      {TONE_LABELS[draft.tone]}
                      <textarea
                        data-testid={`draft-${draft.tone}`}
                        value={edited[draft.tone] ?? draft.text}
                        onChange={(event) =>
                          setEdited({ ...edited, [draft.tone]: event.target.value })
                        }
                        rows={3}
                        className="mt-1 w-full rounded border border-line bg-surface p-2 text-sm font-normal normal-case tracking-normal text-ink"
                      />
                    </label>
                    <Button
                      variant="quiet"
                      size="sm"
                      className="self-start"
                      onClick={() => void onCopy(draft)}
                    >
                      {copied === draft.tone ? 'Copied' : 'Copy'}
                    </Button>
                  </Card>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}
