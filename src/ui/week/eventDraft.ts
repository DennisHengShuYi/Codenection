import type { ItemFields } from '../../domain/scheduleEdits'
import { HORIZON_DAYS, type ActivityKind, type LoadType } from '../../engine'
import { gapsOn, WAKE_HOUR, type Schedule, type ScheduledItem } from '../../optimizer'

/**
 * The edit form's model, with no React in it.
 *
 * Everything the form decides -- what a blank one starts as, what counts as unfinished,
 * what the week would look like if it were saved -- lives here, so the component is left
 * with one piece of state and a list of inputs. The same split `blockActions` uses for the
 * block sheet, and for the same reason: a form that decided these things inline could only
 * be tested by clicking it.
 */

export interface EventDraft {
  readonly title: string
  readonly type: LoadType
  readonly kind: ActivityKind
  readonly dayIndex: number
  readonly startHour: number
  readonly hours: number
  readonly fixed: boolean
  /** When it is due. Null is the ordinary case: most things a student adds by hand have no
   *  date attached to them, and the kind's own interval covers those. */
  readonly deadlineDay: number | null
}

/**
 * The id a not-yet-saved block wears while its clashes are computed.
 *
 * `editWarnings` excludes the schedule's own copy of the block being edited by id. A new
 * block has no copy to exclude, so it needs an id that matches nothing -- and one that
 * could never be a real id, since `addBlock` mints `manual-<time>-<n>`.
 */
export const NEW_ITEM_ID = '__new__'

const HOURS_IN_A_DAY = 24

export function blankDraft(schedule: Schedule, dayIndex: number): EventDraft {
  // The first opening on the day, so the common case -- "put something in this afternoon"
  // -- opens already pointing somewhere sensible rather than at 00:00 or on top of the class
  // that is already there. `gapsOn` clamps to the waking window and merges overlaps, so this
  // is always a real hour on a real day.
  const first = gapsOn(schedule, dayIndex)[0]

  return {
    title: '',
    type: 'mental',
    kind: 'studyBlock',
    dayIndex,
    startHour: first?.startHour ?? WAKE_HOUR,
    hours: 1,
    fixed: false,
    deadlineDay: null,
  }
}

export function draftFrom(item: ScheduledItem): EventDraft {
  return {
    title: item.title,
    type: item.type,
    kind: item.kind,
    dayIndex: item.dayIndex,
    startHour: item.startHour,
    hours: item.hours,
    fixed: item.fixed,
    deadlineDay: item.deadlineDay,
  }
}

export interface DraftErrors {
  readonly title?: string
  readonly hours?: string
  readonly startHour?: string
  readonly dayIndex?: string
  readonly deadlineDay?: string
}

/**
 * What is missing or impossible, per field.
 *
 * Only the impossible. This is the narrow set a block cannot be saved without, and it is
 * deliberately much smaller than the set of things that might be a bad idea: everything
 * that is merely a clash -- an overlap, a blown deadline, a day that will not hold -- goes
 * through `editWarnings` and never blocks a save.
 */
export function validate(draft: EventDraft): DraftErrors {
  const errors: {
    title?: string
    hours?: string
    startHour?: string
    dayIndex?: string
    deadlineDay?: string
  } = {}

  if (draft.title.trim() === '') {
    errors.title = 'Give it a name you will recognise later.'
  }

  if (!Number.isFinite(draft.hours) || draft.hours <= 0) {
    errors.hours = 'How long is it? Half an hour is the smallest step.'
  } else if (draft.hours > HOURS_IN_A_DAY) {
    errors.hours = 'Nothing runs longer than a day.'
  }

  if (
    !Number.isInteger(draft.startHour) ||
    draft.startHour < 0 ||
    draft.startHour >= HOURS_IN_A_DAY
  ) {
    errors.startHour = 'Pick a start between 00:00 and 23:00.'
  }

  if (!Number.isInteger(draft.dayIndex) || draft.dayIndex < 0 || draft.dayIndex >= HORIZON_DAYS) {
    errors.dayIndex = 'That day is outside the fortnight.'
  }

  // An error rather than a warning, unlike every clash below it: a block scheduled after
  // its own deadline is not a tight week, it is a contradiction, and there is no later
  // rearrangement that reconciles the two. Landing exactly on the deadline is fine -- due
  // Friday and done Friday is the commonest way work gets done.
  if (draft.deadlineDay !== null && draft.dayIndex > draft.deadlineDay) {
    errors.deadlineDay = 'This is due before the day you have put it on.'
  }

  return errors
}

export const isComplete = (errors: DraftErrors): boolean => Object.keys(errors).length === 0

export function toFields(draft: EventDraft): ItemFields {
  return {
    title: draft.title.trim(),
    type: draft.type,
    kind: draft.kind,
    hours: draft.hours,
    dayIndex: draft.dayIndex,
    startHour: draft.startHour,
    fixed: draft.fixed,
    deadlineDay: draft.deadlineDay,
  }
}

/**
 * The block as it WOULD be, for asking what it clashes with.
 *
 * Everything outside `ItemFields` is carried from the block being edited, which is what
 * makes the warning about protected rest possible at all: the draft has no `protectedRest`
 * field of its own, so without this the form would be asking about a block that had quietly
 * stopped being protected.
 */
export function candidate(draft: EventDraft, existing: ScheduledItem | null): ScheduledItem {
  return {
    id: existing?.id ?? NEW_ITEM_ID,
    intensity: existing?.intensity ?? 1,
    protectedRest: existing?.protectedRest ?? false,
    ...(existing?.seriesId === undefined ? {} : { seriesId: existing.seriesId }),
    ...toFields(draft),
  }
}
