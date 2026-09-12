import { WEEKDAY_NAMES } from '../../domain/calendar'
import type { ParsedItem } from '../../ai'
import { BLOCK_KINDS, LOAD_TYPES, type ActivityKind, type LoadType } from '../../engine'
import { Button } from '../kit/Button'
import type { Schedule } from '../../optimizer'
import { DayPicker } from '../week/DayPicker'
import { HourPicker } from '../week/HourPicker'
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

/** Ruling 40's whole vocabulary needs names a student reads, and `Date.getUTCDay`'s ordering is
 *  what `expandRecurring` matches against -- so this is that order, not a prettier one. */


export function ItemChip({
  item,
  onChange,
  onRemove,
  schedule,
  today,
}: {
  item: ParsedItem
  onChange: (next: ParsedItem) => void
  onRemove: (id: string) => void
  /**
   * The week, so the day can be picked on a calendar.
   *
   * This took a list of day NAMES and rendered a `<select>` of them -- Ruling 43's answer
   * when the chip held no week and could not turn a day index into a date. `DayPicker` can,
   * and the manual add form has used it since: the four ways in were the only place left
   * showing a dropdown of twenty-one days, which is a scrolling column on a phone and a
   * popup taller than the sheet on a laptop.
   *
   * The names have not gone anywhere. `DayPicker` falls back to exactly them where the week
   * has no `startedOn` -- an ordinary state, not an error -- so an unanchored fortnight
   * still offers the days it can name rather than a calendar of nothing.
   */
  schedule: Schedule
  /** For naming "Today" and "Tomorrow" on that fallback, which a date alone cannot say. */
  today: number
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

        {/* Ruling 43: the one thing a calendar entry is for, and the one thing this chip did not
            say. The day and the hour used to be decided AFTER the accept, by `placement.ts`
            -- so a student confirmed an entry without being told when it would land, and
            met it later in the week.

            Labelled "Due by" rather than "Day", because that is what it writes. `placement`
            searches backwards from this day for a free slot, so an entry due Friday may
            perfectly well land on Wednesday -- and an essay due Friday is one of the most
            movable things in a week, which is exactly why it should. "Day" read as when am I
            doing this and answered when is this due, with nothing to tell the two apart. */}
        <DayPicker
          schedule={schedule}
          today={today}
          value={item.deadlineDay}
          label="Due by"
          optional
          testId={`when-day-${item.id}`}
          onChange={(deadlineDay) => onChange({ ...item, deadlineDay })}
        />

        {/* A clock, and blank for "any time".
            This was a `<select>` whose first option was "Any time" followed by every hour of
            the day -- twenty-five rows to say one of two things. "Any time" is a real answer
            and had to stay sayable, which is why the list survived the day's move to a
            calendar; an empty time input says it just as well, and the help line says so in
            words rather than leaving somebody to discover it. */}
        <Field label="Time" help="Blank for any time">
          <HourPicker
            optional
            data-testid={`when-hour-${item.id}`}
            value={item.startHour}
            onChange={(startHour) => onChange({ ...item, startHour })}
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

      {/* Ruling 41: recurrence is a property confirmed on the thing they were already adding, not
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

      {/* Ruling 43's ask. Extraction that found no day is a question, not a failure to be
          hidden: the alternative is a default nobody chose, landing an entry on a day the
          student never said. `PlannerScreen` holds the accept shut until this is answered. */}
      {!saysWhen(item) && (
        <p data-testid={`when-missing-${item.id}`} className="text-xs text-attention">
          When is this due? Pick a day before adding it.
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
