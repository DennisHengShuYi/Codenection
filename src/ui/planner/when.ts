import type { ParsedItem } from '../../ai'

/**
 * Ruling 43: has this item said when it happens?
 *
 * A day is one answer; a weekly repeat is the other, and `expandRecurring` derives a day
 * for every instance from those weekdays. The first cut of this gate asked only about
 * `deadlineDay`, and the live model then read "wia3001 lecture tuesday 9am" exactly as it
 * should -- a Tuesday series with no single day -- so the app asked a lecture that had said
 * Tuesday twice over to say when it happens.
 */
export const saysWhen = (item: ParsedItem): boolean =>
  item.deadlineDay !== null || (item.repeat !== null && item.repeat.weekdays.length > 0)
