import type { ParsedItem } from '../ai'
import type { Schedule } from '../optimizer'
import { placeItems } from './placement'

/**
 * Turns accepted chips into real schedule items.
 *
 * A thin wrapper over `placeItems` now, kept because most callers -- the Telegram brain
 * dump, the request-box price preview, `commitments.accept` -- want the week back and have
 * nothing to say to a student about where things landed. One construction path rather than
 * two: an item built here and an item built there would drift, and both produce the row the
 * engine projects from.
 *
 * Day zero as "today" is what every caller without a calendar already assumes, and matches
 * the behaviour this had before placement existed.
 *
 * Everything here arrives from a parse, and a parse is a proposal -- but a proposal the
 * student has now read and accepted, which is what makes `fixed` safe to honour. §5.1's
 * guarantee is drawn precisely in `placeItems`: `protectedRest` is the thing the optimizer
 * may never move, and nothing arriving from text may create it, whatever the chip says.
 */
export function addItems(schedule: Schedule, items: readonly ParsedItem[]): Schedule {
  return placeItems(schedule, items, 0).schedule
}
