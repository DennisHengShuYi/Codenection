import { useState, type JSX } from 'react'
import { dateFor } from '../../domain/calendar'
import { editWarnings } from '../../domain/editWarnings'
import type { ItemFields } from '../../domain/scheduleEdits'
import {
  BLOCK_KINDS,
  HORIZON_DAYS,
  LOAD_TYPES,
  type ActivityKind,
  type EngineParams,
  type LoadType,
} from '../../engine'
import { DAY_END_HOUR, type Schedule, type ScheduledItem } from '../../optimizer'
import { Button } from '../kit/Button'
import { Field } from '../kit/Field'
import { BLOCK_KIND_LABELS, hourLabel, LOAD_TYPE_LABELS } from '../kit/labels'
import { Sheet } from '../kit/Sheet'
import { blankDraft, candidate, draftFrom, isComplete, toFields, validate } from './eventDraft'

/**
 * The day/time picker `blockActions` was waiting for.
 *
 * `move` was specified once, wired, and then dropped, because with no picker behind it the
 * button did exactly what Later did and a student could not tell it had failed. This is that
 * picker -- and because it exists, a block can now be edited rather than only answered
 * about.
 *
 * One component for adding and for changing, because they differ in exactly one thing:
 * whether there is a block to start from. Two components would be two copies of seven
 * fields, two validation paths and two sets of warnings, and the pair would drift the first
 * time one of them gained a field.
 *
 * The form never refuses a save over a clash. §1.4 flags rather than silently guesses, and
 * the equivalent here is that a fortnight the student says is double-booked is recorded as
 * double-booked -- the deficit forecast then says so, which is the signal they came for.
 * `validate` covers only the impossible (no name, no length, an hour that is not an hour);
 * everything merely unwise is a warning.
 */

const INPUT = 'min-h-11 w-full rounded border border-line bg-surface px-2 py-1 text-sm text-ink'

const HOURS_OF_DAY = Array.from({ length: DAY_END_HOUR }, (_, hour) => hour)

/** What being pinned means, said once, in the terms the student would use for it. */
const pinnedNote = (item: ScheduledItem | null): string | null => {
  if (item === null) return null

  // Checked before `fixed` because protected rest is also fixed, and this is the bigger of
  // the two things to be overruling (§5.1).
  if (item.protectedRest) {
    return 'This is protected recovery — the app pinned it on purpose, and moving it is you overruling that.'
  }

  if (item.fixed) {
    return 'Your week is built around this one, so nothing else will be moved to make room for it.'
  }

  return null
}

export function EventForm({
  schedule,
  params,
  item,
  dayIndex,
  onSave,
  onClose,
  onBack,
}: {
  readonly schedule: Schedule
  readonly params: EngineParams
  /** The block being changed, or null when adding a new one. */
  readonly item: ScheduledItem | null
  /** Which day a NEW block starts on. Ignored when `item` is given, which carries its own. */
  readonly dayIndex: number
  readonly onSave: (fields: ItemFields) => void
  readonly onClose: () => void
  /** Ruling 60: one level up -- to the block, when there is one; to the week otherwise. */
  readonly onBack: () => void
}): JSX.Element {
  // The one piece of state in the component. Everything else below is derived from it, which
  // is what `eventDraft.ts` is for.
  const [draft, setDraft] = useState(() =>
    item === null ? blankDraft(schedule, dayIndex) : draftFrom(item),
  )

  const errors = validate(draft)
  const warnings = editWarnings({ schedule, item: candidate(draft, item), params })
  const note = pinnedNote(item)

  /*
   * `HORIZON_DAYS`, not `schedule.horizonDays`. `validate` and `fromPath` both bound the day
   * by the constant, so a stored week claiming a longer horizon would have the picker
   * offering a day the form then refuses to save -- Save greyed out with a message about a
   * day the student can plainly see in the list.
   */
  const days = Array.from({ length: Math.min(schedule.horizonDays, HORIZON_DAYS) }, (_, index) => index)

  return (
    <Sheet
      title={item === null ? 'Add a block' : 'Edit this block'}
      onClose={onClose}
      onBack={onBack}
      actions={
        <Button
          data-testid="save-block"
          disabled={!isComplete(errors)}
          onClick={() => onSave(toFields(draft))}
        >
          Save
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="What" error={errors.title}>
          <input
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            className={INPUT}
          />
        </Field>

        <div className="flex flex-wrap gap-3">
          <Field label="Kind">
            <select
              value={draft.type}
              onChange={(event) => setDraft({ ...draft, type: event.target.value as LoadType })}
              className={INPUT}
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
              value={draft.kind}
              onChange={(event) => setDraft({ ...draft, kind: event.target.value as ActivityKind })}
              className={INPUT}
            >
              {/* `BLOCK_KINDS`, not `ACTIVITY_KINDS`: sleep enters through `sleepByDay` and
                  is a block that quietly does not exist to the model (Ruling 46). */}
              {BLOCK_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {BLOCK_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex flex-wrap gap-3">
          <Field label="Day" error={errors.dayIndex}>
            <select
              value={draft.dayIndex}
              onChange={(event) => setDraft({ ...draft, dayIndex: Number(event.target.value) })}
              className={INPUT}
            >
              {days.map((day) => (
                // The real date where the week has been anchored to one, and the day number
                // otherwise -- the same fallback the week grid's own labels use, so the two
                // never name one day two different ways.
                <option key={day} value={day}>
                  {dateFor(schedule, day) ?? `Day ${day}`}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Starts at" error={errors.startHour}>
            <select
              value={draft.startHour}
              onChange={(event) => setDraft({ ...draft, startHour: Number(event.target.value) })}
              className={INPUT}
            >
              {HOURS_OF_DAY.map((hour) => (
                <option key={hour} value={hour}>
                  {hourLabel(hour)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Hours" error={errors.hours}>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={draft.hours}
              onChange={(event) => setDraft({ ...draft, hours: Number(event.target.value) })}
              className={INPUT}
            />
          </Field>

          {/*
            When it is due, as against when it is scheduled above.
            
            The one thing this form could not say. Every other way into the week states a
            deadline -- the planner from what a student typed, the photo reader from a
            timetable, the calendar import from the event's own date -- so a block added by
            hand fell to the synthetic deadline its kind gets, and a wrong one could not be
            corrected anywhere.

            "Not set" is first and is the ordinary answer: most of what a student types in is
            not due on any particular day, and `softDeadlines` covers those by kind.
          */}
          <Field label="Due by" error={errors.deadlineDay}>
            <select
              data-testid="deadline-day"
              value={draft.deadlineDay === null ? '' : String(draft.deadlineDay)}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  deadlineDay: event.target.value === '' ? null : Number(event.target.value),
                })
              }
              className={INPUT}
            >
              <option value="">Not set</option>
              {days.map((day) => (
                <option key={day} value={day}>
                  {dateFor(schedule, day) ?? `Day ${day}`}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* §5.1's boundary, drawn where the student can see it -- the same checkbox
            `ItemChip` offers when something is first read in, offered again here because a
            block can become a fixed commitment after it was written down as a loose one. */}
        <label className="flex items-center gap-2 text-xs text-ink-soft">
          <input
            type="checkbox"
            data-testid="fixed-block"
            checked={draft.fixed}
            onChange={(event) => setDraft({ ...draft, fixed: event.target.checked })}
            className="size-4 rounded border-line"
          />
          Fixed time — a class, lab or shift the week has to work around
        </label>

        {note !== null && (
          <p data-testid="pinned-note" className="text-xs text-ink-soft">
            {note}
          </p>
        )}

        {warnings.length > 0 && (
          /* `role="status"` rather than `alert`: these are things to know, not errors to
             fix, and the Save button beside them is deliberately still live. An assertive
             announcement would tell a screen-reader user the opposite of what is true. */
          <ul data-testid="edit-warnings" role="status" className="flex flex-col gap-1">
            {warnings.map((warning) => (
              <li key={warning} className="text-xs text-attention">
                {warning}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  )
}
