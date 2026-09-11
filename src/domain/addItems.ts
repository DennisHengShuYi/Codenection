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
 * `today` is required, and that is the whole of Ruling 41 applied one layer further in.
 * This used to hardcode day zero, with a comment saying every caller without a calendar
 * assumed as much -- which stopped being true once the anchor existed. Three of the four
 * callers had a real day index in hand and dropped it here: `commitments.accept` takes one
 * and uses it for the review date, `priceRequest` takes one and was made to take one
 * precisely because defaulting it had been wrong, and the request box has one as a prop. So
 * a student saying yes on day ten had the work placed on day two -- eight days into a past
 * they had already lived, with a review date three weeks out.
 *
 * It shows on undated work rather than deadlined work, which is why it survived: a deadlined
 * item searches backwards from its deadline and lands there whatever `today` says, while
 * undated work looks forward from `today + DEFAULT_DAY_OFFSET` and so lands wherever day
 * zero puts it.
 *
 * Everything here arrives from a parse, and a parse is a proposal -- but a proposal the
 * student has now read and accepted, which is what makes `fixed` safe to honour. §5.1's
 * guarantee is drawn precisely in `placeItems`: `protectedRest` is the thing the optimizer
 * may never move, and nothing arriving from text may create it, whatever the chip says.
 */
export function addItems(
  schedule: Schedule,
  items: readonly ParsedItem[],
  today: number,
): Schedule {
  return placeItems(schedule, items, today).schedule
}
