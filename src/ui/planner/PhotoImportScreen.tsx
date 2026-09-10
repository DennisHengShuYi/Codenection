import { useState } from 'react'
import type { ParsedItem } from '../../ai'
import { Button } from '../kit/Button'
import { Field } from '../kit/Field'
import { Sheet } from '../kit/Sheet'
import { ItemChip } from './ItemChip'

/**
 * §1.4's primary input path: one button, camera or gallery, and the model works out what it
 * is looking at. §1.4 ranks it above typing because deadlines cause the pile-up and a brief
 * is where the deadlines are.
 *
 * `capture` is deliberately absent from the input. With it, a laptop offers a webcam and
 * nothing else; without it, a phone still offers the camera alongside the gallery, and a
 * laptop offers the file picker -- which is the machine this gets demonstrated on.
 *
 * Owns its own `Sheet`, the same as `PlannerScreen` -- the action bar depends on `reading`
 * and on whether there is anything to accept, both held only here.
 */
export function PhotoImportScreen({
  onAccept,
  suggestRepeat = () => null,
  onCancel,
}: {
  onAccept: (items: readonly ParsedItem[]) => void
  /** §37, as `PlannerScreen` takes it: a timetable photo is the likeliest place a repeating
   *  class arrives one instance at a time. */
  suggestRepeat?: (item: ParsedItem) => ParsedItem['repeat']
  onCancel: () => void
}) {
  const [items, setItems] = useState<ParsedItem[] | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [reading, setReading] = useState(false)

  async function onChoose(file: File | undefined) {
    if (!file) return

    setReading(true)
    setProblem(null)
    setItems(null)
    setPreview(null)

    try {
      // Imported here rather than at the top of the file, for the same reason the planner
      // does it: the parser pulls Zod in with it, and neither screen is the first one a
      // student sees.
      const { readImageFile, readPhoto } = await import('../../ai')

      // Read for the preview separately, so the photo is on screen even when the reading
      // itself fails. Seeing the shot is how a student tells a blurry photo from a missing
      // key, and that only works if the preview does not depend on the reading succeeding.
      const image = await readImageFile(file)
      if (image.ok) setPreview(image.dataUrl)

      const outcome = await readPhoto(file)
      if (outcome.ok) {
        setItems(outcome.items.map((item) => ({ ...item, repeat: item.repeat ?? suggestRepeat(item) })))
      }
      else setProblem(outcome.reason)
    } finally {
      setReading(false)
    }
  }

  const canAccept = items !== null && items.length > 0

  const actions = (
    <>
      <Button variant="quiet" onClick={onCancel}>
        Cancel
      </Button>
      {canAccept && <Button onClick={() => onAccept(items)}>Add these to my week</Button>}
    </>
  )

  return (
    <Sheet title="Photograph it" onClose={onCancel} actions={actions}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-soft">
          An assignment brief, your planner page, a whiteboard, a slide with dates on it.
        </p>

        <Field label="Choose a photo">
          <input
            type="file"
            accept="image/*"
            data-testid="photo-input"
            disabled={reading}
            onChange={(event) => void onChoose(event.target.files?.[0])}
            className="rounded-lg border border-line bg-surface p-3 text-ink"
          />
        </Field>

        {reading && <p className="text-sm text-ink-soft">Reading it…</p>}

        {problem !== null && (
          <p data-testid="photo-problem" role="status" className="text-sm text-attention">
            {problem}
          </p>
        )}

        {/* §1.4: the photo stays beside what was read, so a misread date can be checked
            against the page it came from. Stacks at phone width rather than shrinking both. */}
        <div className="flex flex-col gap-4 sm:flex-row-reverse sm:items-start">
          {preview !== null && (
            <img
              src={preview}
              alt="The photo you chose"
              data-testid="photo-preview"
              className="max-h-64 w-full rounded-lg border border-line object-contain sm:w-48"
            />
          )}

          {items !== null && items.length > 0 && (
            <ul className="flex flex-1 flex-col gap-3">
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

        {items !== null && items.length === 0 && (
          <p className="text-sm text-ink-soft">I could not find anything to do in that photo.</p>
        )}
      </div>
    </Sheet>
  )
}
