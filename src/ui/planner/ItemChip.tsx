import type { ParsedItem } from '../../ai'
import { BLOCK_KINDS, LOAD_TYPES, type ActivityKind, type LoadType } from '../../engine'
import { Button } from '../kit/Button'
import { CARD_TONES } from '../kit/Card'
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

/**
 * Every kind a *block* may carry, from the engine's own list rather than a local filter.
 *
 * It was `ACTIVITY_KINDS.filter(kind => kind !== 'sleep')` here, which was right and was
 * also the only place the rule was written down -- so `ai/schema.ts` went on accepting
 * `kind: 'sleep'` from a model reply after the picker stopped offering it. `BLOCK_KINDS`
 * is now the single list both use (Ruling 46), guarded against drifting from
 * `ACTIVITY_KINDS` by `engine/types.test.ts`.
 */
const SELECTABLE_KINDS = BLOCK_KINDS

/** §40's whole vocabulary needs names a student reads, and `Date.getUTCDay`'s ordering is
 *  what `expandRecurring` matches against -- so this is that order, not a prettier one. */
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

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
  // screens' `<ul>` of chips, where a `<div>` would be invalid list markup. `CARD_TONES` is
  // `Card`'s own tone map, borrowed rather than retyped, so a flagged chip still reads as
  // the same "needs you" state used everywhere else (§1.5).
  return (
    <li
      data-testid={`chip-${item.id}`}
      className={`flex flex-col gap-3 rounded-xl border p-3 ${
        item.confident ? 'border-line bg-surface' : CARD_TONES.attention
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
            {SELECTABLE_KINDS.map((kind) => (
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

      {/* §5.1's boundary, drawn where the student can see it. A pinned block is one the
          optimizer may never move, so the model's reading of the page arrives as a ticked
          box rather than as a fact -- the accept is what commits it. A plain checkbox
          rather than a `Field`+`select`: this is one yes/no about the row, and the two
          selects above already carry the row's structure. */}
      <label className="flex items-center gap-2 text-xs text-ink-soft">
        <input
          type="checkbox"
          data-testid={`fixed-${item.id}`}
          checked={item.fixed}
          onChange={(event) => onChange({ ...item, fixed: event.target.checked })}
          className="size-4 rounded border-line"
        />
        Fixed time — a class, lab or shift the week has to work around
      </label>

      {/* §41: recurrence is a property confirmed on the thing they were already adding, not
          a screen of its own -- a form with weekday checkboxes and an until-date picker is
          the setup burden this design cuts everywhere else. Shown only when the parse
          actually read a repeat, and undoable in one tap, because a repeat invented from a
          one-off fills three weeks with a class that meets once. */}
      {item.repeat !== null && (
        <div
          data-testid={`repeat-${item.id}`}
          className="flex flex-wrap items-center gap-2 text-xs text-ink-soft"
        >
          <span>
            Repeats every week on {item.repeat.weekdays.map((day) => WEEKDAY_NAMES[day]).join(' and ')}
          </span>
          <Button variant="quiet" size="sm" onClick={() => onChange({ ...item, repeat: null })}>
            Just once
          </Button>
        </div>
      )}

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
