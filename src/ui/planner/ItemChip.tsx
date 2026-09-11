import { WEEKDAY_NAMES } from '../../domain/calendar'
import type { ParsedItem } from '../../ai'
import { BLOCK_KINDS, LOAD_TYPES, type ActivityKind, type LoadType } from '../../engine'
import { Button } from '../kit/Button'
import { CARD_TONES } from '../kit/Card'
import { Field } from '../kit/Field'
import { BLOCK_KIND_LABELS, LOAD_TYPE_LABELS } from '../kit/labels'
import { saysWhen } from './when'


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

/** Every hour of the day, offered as a real clock rather than a free-text box: a typed
 *  "half nine" is a parsing problem the student would have to solve twice. */
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

/** §40's whole vocabulary needs names a student reads, and `Date.getUTCDay`'s ordering is
 *  what `expandRecurring` matches against -- so this is that order, not a prettier one. */


export function ItemChip({
  item,
  onChange,
  onRemove,
  dayLabels,
}: {
  item: ParsedItem
  onChange: (next: ParsedItem) => void
  onRemove: (id: string) => void
  /**
   * §43: the horizon's days, named the way a student recognises them.
   *
   * Passed in rather than derived, because the names depend on when the week started and
   * this component holds no week. Index is the day index the item carries, so the select's
   * value is the domain's own number and nothing has to be translated back.
   */
  dayLabels: readonly string[]
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
                {LOAD_TYPE_LABELS[type]}
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
                {BLOCK_KIND_LABELS[kind]}
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

        {/* §43: the one thing a calendar entry is for, and the one thing this chip did not
            say. The day and the hour used to be decided AFTER the accept, by `placement.ts`
            -- so a student confirmed an entry without being told when it would land, and
            met it later in the week. */}
        <Field label="Day">
          <select
            data-testid={`when-day-${item.id}`}
            value={item.deadlineDay === null ? '' : String(item.deadlineDay)}
            onChange={(event) =>
              onChange({
                ...item,
                deadlineDay: event.target.value === '' ? null : Number(event.target.value),
              })
            }
            className="min-h-11 rounded border border-line bg-surface px-2 py-1 text-sm text-ink"
          >
            {/* Only while it is the answer. Once a day is chosen, offering "not said" back
                would invite undoing the thing this chip just asked for. */}
            {item.deadlineDay === null && <option value="">Pick a day</option>}
            {dayLabels.map((label, dayIndex) => (
              <option key={label} value={String(dayIndex)}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Time">
          <select
            data-testid={`when-hour-${item.id}`}
            value={item.startHour === null ? '' : String(item.startHour)}
            onChange={(event) =>
              onChange({
                ...item,
                startHour: event.target.value === '' ? null : Number(event.target.value),
              })
            }
            className="min-h-11 rounded border border-line bg-surface px-2 py-1 text-sm text-ink"
          >
            {/* "Any time" is a real answer, not a missing one: an essay due Friday has a day
                and no hour, and pinning one would take away the freedom the rebalancer needs
                to place it. Stating an hour is what pins a block (§43). */}
            <option value="">Any time</option>
            {HOURS.map((hour) => (
              <option key={hour} value={String(hour)}>
                {String(hour).padStart(2, '0')}:00
              </option>
            ))}
          </select>
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

      {/* §43's ask. Extraction that found no day is a question, not a failure to be
          hidden: the alternative is a default nobody chose, landing an entry on a day the
          student never said. `PlannerScreen` holds the accept shut until this is answered. */}
      {!saysWhen(item) && (
        <p data-testid={`when-missing-${item.id}`} className="text-xs text-attention">
          When is this? Pick a day before adding it.
        </p>
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
