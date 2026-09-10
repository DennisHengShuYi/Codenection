import type { ParsedItem } from '../../ai'
import { ACTIVITY_KINDS, LOAD_TYPES, type ActivityKind, type LoadType } from '../../engine'
import { Button } from '../kit/Button'
import { Field } from '../kit/Field'

/** The engine's vocabulary in a student's words. "Mental load" is a modelling term; "study
 *  and thinking" is what someone recognises as their own week. */
const LABELS: Record<LoadType, string> = {
  mental: 'Study & thinking',
  physical: 'Body & movement',
  social: 'People',
  errands: 'Life admin',
}

/** §6.6's kinds in a student's words -- what the activity leaves behind, not the modelling
 *  term for it. A gym session and a walk are both "Body & movement" above, but this is
 *  where the student says which one it actually was. */
const KIND_LABELS: Record<ActivityKind, string> = {
  hardExercise: 'Hard exercise',
  lightExercise: 'Light exercise',
  studyBlock: 'Study',
  socialDraining: 'Seeing people (draining)',
  socialRestorative: 'Seeing people (restorative)',
  errands: 'Life admin',
  rest: 'Rest',
  sleep: 'Sleep',
}

export function ItemChip({
  item,
  onChange,
  onRemove,
}: {
  item: ParsedItem
  onChange: (next: ParsedItem) => void
  onRemove: (id: string) => void
}) {
  // A list item, not `Card` -- `Card` renders a `<div>`, and this always sits inside the
  // screens' `<ul>` of chips, where a `<div>` would be invalid list markup. The border/tone
  // classes mirror `Card`'s own so a flagged chip still reads as the same "needs you" state
  // used everywhere else (§1.5).
  return (
    <li
      data-testid={`chip-${item.id}`}
      className={`flex flex-col gap-3 rounded-xl border p-3 ${
        item.confident ? 'border-line bg-surface' : 'border-attention bg-attention-soft'
      }`}
    >
      <Field label="What">
        <input
          value={item.title}
          onChange={(event) => onChange({ ...item, title: event.target.value })}
          className="rounded border border-line bg-surface px-2 py-1 text-sm text-ink"
        />
      </Field>

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Kind">
          <select
            value={item.type}
            onChange={(event) => onChange({ ...item, type: event.target.value as LoadType })}
            className="min-h-11 rounded border border-line bg-surface px-2 py-1 text-sm text-ink"
          >
            {LOAD_TYPES.map((type) => (
              <option key={type} value={type}>
                {LABELS[type]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Detail">
          <select
            value={item.kind}
            onChange={(event) => onChange({ ...item, kind: event.target.value as ActivityKind })}
            className="min-h-11 rounded border border-line bg-surface px-2 py-1 text-sm text-ink"
          >
            {ACTIVITY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Hours">
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={item.hours}
            onChange={(event) => onChange({ ...item, hours: Number(event.target.value) })}
            className="w-20 min-h-11 rounded border border-line bg-surface px-2 py-1 text-sm text-ink"
          />
        </Field>

        <Button variant="quiet" size="sm" className="ml-auto" onClick={() => onRemove(item.id)}>
          Remove
        </Button>
      </div>

      {/* §1.4: flagged rather than silently guessed. A student cannot correct what they
          were never shown. */}
      {!item.confident && (
        <p data-testid={`unsure-${item.id}`} className="text-xs text-attention">
          Not sure about this one — check it before adding.
        </p>
      )}
    </li>
  )
}
