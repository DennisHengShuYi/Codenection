import type { ParsedItem } from '../ai'
import { HORIZON_DAYS } from '../engine'
import type { EngineParams } from '../engine'
import { smallestFixes, type Fix, type Schedule, type ScheduledItem } from '../optimizer'
import { shortDayLabel } from './calendar'
import { expandRecurring } from './recurrence'
import { slotOn, type SlotNeed } from './slotFinder'
import { effectiveDeadline } from './softDeadlines'

/**
 * Where an undated item goes when nothing says otherwise, counted from today.
 *
 * Not day zero. Piling undated work onto today is the shape the optimizer then has to spend
 * its whole budget undoing, and it makes the one day a student can actually see look worse
 * than their week really is.
 */
const DEFAULT_DAY_OFFSET = 2

/** The evening. Used only when nothing fits anywhere and the item is placed regardless. */
const FALLBACK_START_HOUR = 19

/** What happened to one accepted item, in terms the UI can turn into a sentence. */
export interface PlacementNote {
  readonly itemId: string
  readonly title: string
  /** Where it ended up. */
  readonly dayIndex: number
  /** The day it wanted, when that is not where it went. Null when nothing had to move. */
  readonly movedFrom: number | null
  /** False when no day in range had room and it was placed anyway. */
  readonly fitted: boolean
}

const clampDay = (day: number): number => Math.min(Math.max(day, 0), HORIZON_DAYS - 1)

/**
 * Adds accepted items, finding each one a day with room, and reports what it did.
 *
 * Three questions in order, and only the first two are ever acted on: does it fit the day
 * it wants, does it fit a later day before its deadline, and -- when neither -- it is
 * placed anyway and said so. The third question Ruling 15 poses, "could it fit if something
 * moved", is deliberately not answered here. `rebalance` already does displacement, better,
 * with chained moves and full 21-day scoring, and two systems making scheduling decisions
 * with different logic will disagree. The caller offers `smallestFixes` as one optional
 * move instead.
 *
 * Nothing already in the week is ever touched. Ruling 16: silent displacement breaks a student's
 * mental model of their own week, and it contradicts the principle underneath provisional
 * yes -- inaction produces the healthy outcome and the student stays in charge.
 */
export function placeItems(
  schedule: Schedule,
  items: readonly ParsedItem[],
  today: number,
): { readonly schedule: Schedule; readonly notes: readonly PlacementNote[] } {
  const stamp = Date.now()
  const notes: PlacementNote[] = []

  // Ruling 38: recurrence is expanded here and nowhere later, so a weekly class becomes the three
  // real blocks it actually is before anything downstream sees it. Nothing past this point
  // knows recurrence exists -- the engine takes a flat list by design.
  const expanded = items.flatMap((item) => expandRecurring(item, schedule, today))

  // Folded rather than mapped, so each item sees the ones placed before it. Computing every
  // placement against the original week would send them all to the same first opening,
  // which is the pile-up this exists to end.
  const placed = expanded.reduce((current, item, index) => {
    const floor = clampDay(today)
    const need = { hours: item.hours, type: item.type, kind: item.kind }

    /**
     * Which days this item may occupy, in the order it would prefer them.
     *
     * The two cases run in opposite directions, and that is the whole point. A deadline is
     * a *latest* bound: an essay due Friday is one of the most movable things in the week,
     * free to sit anywhere before Friday but never after it -- so a full Friday sends it
     * backwards, toward today. Undated work has no wall to back away from, so it looks
     * forward instead, from a couple of days out to the end of the horizon.
     *
     * Searching forward from a deadline would push work past the day it is due to make the
     * week look tidier, which is the one rearrangement that costs a student marks.
     */
    const wanted = item.deadlineDay === null ? clampDay(today + DEFAULT_DAY_OFFSET) : clampDay(item.deadlineDay)
    const start = Math.max(wanted, floor)
    const candidates =
      item.deadlineDay === null
        ? Array.from({ length: HORIZON_DAYS - start }, (_, offset) => start + offset)
        : Array.from({ length: start - floor + 1 }, (_, offset) => start - offset)

    let dayIndex = start
    let slot: ReturnType<typeof slotOn> = null

    for (const day of candidates) {
      slot = slotOn(current, day, need)
      if (slot !== null) {
        dayIndex = day
        break
      }
    }

    const added: ScheduledItem = {
      id: `added-${stamp}-${index}-${item.id}`,
      title: item.title,
      type: item.type,
      kind: item.kind,
      hours: item.hours,
      intensity: 1,
      dayIndex: slot === null ? start : dayIndex,
      /**
       * Ruling 43: the student's own hour wins over the search.
       *
       * Placement chose every hour while `ParsedItem` carried no time -- the first free
       * slot, or `FALLBACK_START_HOUR` on a full day. Now that "lecture Tuesday 9am" can be
       * read, choosing 10am instead would be the app overruling a student about their own
       * timetable. A stated hour is taken as given even where the day is already busy: two
       * things at once is a real week, and the placement note says so rather than moving
       * the lecture somewhere emptier behind their back (Ruling 16).
       */
      startHour: item.startHour ?? slot?.startHour ?? FALLBACK_START_HOUR,
      // §5.1 unchanged: what the student ticked may pin a time, and nothing here may ever
      // create protected rest. Ruling 43 adds the other half of a stated hour: honouring it once
      // and letting the next rebalance move it would be worse than never honouring it --
      // the student would have watched it land correctly and then drift.
      fixed: item.fixed || item.startHour !== null,
      deadlineDay: item.deadlineDay,
      protectedRest: false,
      // Ruling 39: carried through when the item came from a series, absent when it did not.
      ...(item.seriesId === undefined ? {} : { seriesId: item.seriesId }),
      // Carried for the push, which must not send a block back to the calendar it was
      // read from.
      ...(item.sourceId === undefined ? {} : { sourceId: item.sourceId }),
    }

    notes.push({
      itemId: added.id,
      title: added.title,
      dayIndex: added.dayIndex,
      movedFrom: added.dayIndex === start ? null : start,
      fitted: slot !== null,
    })

    return { ...current, items: [...current.items, added] }
  }, schedule)

  return { schedule: placed, notes }
}


/**
 * The day a card names, with its date.
 *
 * Straight through `domain/calendar.shortDayLabel`, which CLAUDE.md makes the one place a day
 * index becomes a date or a name. `shortDayLabel` rather than `dayLabel` because these are
 * sentences: that module already records what the heading form does inside one -- "Today, Sat
 * 12 Sept's deadline will cost you about 4 hours of sleep" -- and "it stayed on Tomorrow, Tue
 * 8 Sept" is the same sentence with the same seam in it. This had a private weekday table and returned "Thursday" --
 * ambiguous the moment the horizon is longer than a week, since a fortnight holds three of
 * them, and useless for matching against the dated grid the student is looking at. `dayLabel`
 * also knows to say "Today" and "Tomorrow", which no date can express.
 *
 * A week saved before anchoring existed has no real dates, so it degrades to the index rather
 * than inventing a weekday -- naming the wrong day is worse than naming none.
 */
function dayName(schedule: Schedule | null, dayIndex: number, today: number): string {
  return schedule === null ? `day ${dayIndex}` : shortDayLabel(schedule, dayIndex, today)
}

/**
 * One sentence about what happened to one item.
 *
 * Ruling 16: say what you did. A student who put something on Tuesday and finds it on Thursday
 * with no explanation has lost their grip on their own week, which costs more trust than
 * the tidier schedule was ever worth.
 */
export function describePlacement(
  note: PlacementNote,
  schedule: Schedule | null,
  today: number,
): string {
  if (!note.fitted) {
    return `Added, but ${dayName(schedule, note.dayIndex, today)} has no room for ${note.title} — it is on top of something.`
  }

  if (note.movedFrom === null) return 'Added.'

  return `Added. ${dayName(schedule, note.movedFrom, today)} has no room for ${note.title}, so it went to ${dayName(schedule, note.dayIndex, today)}.`
}

/** Small counts read better as words in a sentence. Beyond this the digit is clearer than
 *  the word, and a day count this large is rare enough not to be worth a longer table. */
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five'] as const

const countWord = (value: number): string => COUNT_WORDS[value] ?? String(value)

/**
 * Whether the sentence is a proposal or a record.
 *
 * Later asks before it acts, so the same facts have to be sayable in both tenses -- the
 * question a student approves, and the account of what was done once they have. One function
 * takes both, because the branching (which reason is worth giving, and when none is) is the
 * part carrying judgement, and two copies of it would drift apart.
 */
export type DeferralMood = 'planned' | 'done'

/** What `deferItem` needs to explain itself: where the block went, and what it went past. */
export interface DeferralNote {
  readonly schedule: Schedule | null
  readonly title: string
  readonly from: number
  /** Null when nothing had room and the block stayed where it was. */
  readonly to: number | null
  readonly skippedFull: number
  readonly skippedWithRoom: number
  /** Why it did not move. See `scheduleEdits.Deferral` -- `due` means no day was ever
   *  examined, which is a different sentence from every day being full. */
  readonly blocked: 'full' | 'due' | null
  /** The lowest the block's own reserve reaches from the move onward, before and after.
   *  Null when nothing moved and there is nothing to price. */
  readonly floorBefore: number | null
  readonly floorAfter: number | null
  /**
   * What to call the reserve the figures are about -- "Study & thinking", "People".
   *
   * Passed in rather than looked up. The four words live in `ui/kit/labels`, and the
   * dependency order is one-way: this module is domain and may not reach into the interface
   * layer. Handed down by the caller that already has both.
   *
   * Named at all because Rebalance's report says "your worst day goes from 41 to 44" and
   * means the floor across all four reserves, while this means one. Same shape, different
   * measurement -- and unnamed, the two read as one number a student could compare.
   */
  readonly reserveLabel: string
  /**
   * The hours the block would occupy on its new day -- "09:00-11:00" -- or null when nothing
   * moved and there is no hour to name.
   *
   * Where in the day it lands is the half of the answer the student has not been consulted
   * about: `slotOn` chooses the hour, not them, and it is what decides whether the move is any
   * use. The day alone they can already see on the grid.
   *
   * Formatted by the caller, like `reserveLabel` above and for the same reason: the two-digit
   * clock lives in `ui/kit/labels`, and a second copy of it here is what that module's own
   * docstring forbids.
   */
  readonly whenLabel: string | null
  /** The day the student is on, so the label can say "Today" and "Tomorrow" rather than
   *  a date for the two days nobody names by date. */
  readonly today: number
}

/**
 * Below this the two days are the same week and the price is not worth stating.
 *
 * A whole reserve point, because the sentence prints whole numbers: a figure that reads "from
 * 41 to 41" is one a student looks at once and stops trusting.
 */
const WORTH_PRICING = 1

/**
 * What Later did, and why, in one sentence.
 *
 * Ruling 16 applied to deferral: never silently reshuffle. `deferItem` searches forward and
 * returns the week **unchanged** when nothing has room -- deliberately, so a caller can tell
 * nothing happened -- and for a while nothing read that: the sheet closed either way, so
 * pressing Later on a block with nowhere to go looked exactly like pressing it on one that
 * moved.
 *
 * Naming the day fixed that half. The other half is *why that day*, and it matters more now
 * than it did: Later used to be pure geometry, so "the next day with a gap" was a complete
 * account of it. It now scores every opening against §2.1's objective and can pass over a day
 * that plainly had space -- and a student watching it skip an empty Wednesday has no way to
 * tell a decision from a bug. The obvious reading of the button is still the old behaviour.
 *
 * So the reason is only given when there is one. A block that moved to the very next day
 * needs no explanation; it did what the button says.
 *
 * The skipped opening leads when both kinds were passed over. A full day explains itself --
 * the student can see it is full -- where a day with space that was declined does not.
 *
 * The day only, never the hour, which matches `describePlacement` above. `slotOn` does choose
 * an hour, and naming it here would mean either duplicating `ui/kit/labels`' `hourLabel` or
 * importing the interface layer into the domain, and the dependency order is one-way. The day
 * is what a student needs to re-find the block; the hour is on it when they open it.
 */
export function describeDeferral(note: DeferralNote, mood: DeferralMood): string {
  const { schedule, title, from, to, skippedFull, skippedWithRoom, blocked } = note
  const { floorBefore, floorAfter, reserveLabel, whenLabel, today } = note
  const planned = mood === 'planned'

  if (to === null) {
    // The deadline, not the days. A block due on or before the day it already sits on has no
    // later day to try, so the search examined nothing -- and "no room" there is false twice
    // over: no day was full, and no day was looked at. It also sends the student to check a
    // calendar that cannot explain it. One sentence for both moods, because nothing moved in
    // either and there is no tense to change.
    if (blocked === 'due') {
      return `${title} is already due, so there is no later day to move it to.`
    }

    const nowhere = `There is no room for ${title} on any day it could move to`
    return planned
      ? `${nowhere}.`
      : `There was no room for ${title} on any day it could move to, so it stayed on ${dayName(schedule, from, today)}.`
  }

  // The day, and the hours on it where the caller could supply them.
  const where = dayName(schedule, to, today) + (whenLabel ? `, ${whenLabel}` : '')
  // "This" rather than the title in the proposal: it sits inside the block's own sheet, under
  // its name, where repeating the title reads as though a second block were involved.
  const lead = planned ? `This would move to ${where}.` : `${title} moved to ${where}.`

  /**
   * What the move does to the reserve this block spends, in the unit `requestCost` already
   * prices an incoming ask in -- and saying which reserve, because Rebalance's own report
   * uses the same shape for the floor across all four.
   *
   * Given whichever way it goes. The search picks the best *day to move to* and never weighs
   * that against leaving the block alone, so the day it chooses can be worse than staying --
   * and since Later asks before acting, that is exactly the case the number exists for. A
   * price shown only when it flatters the suggestion would be advocacy rather than reporting.
   */
  const priced =
    floorBefore !== null &&
    floorAfter !== null &&
    Math.abs(floorAfter - floorBefore) >= WORTH_PRICING
      ? ` ${reserveLabel} bottoms out at ${Math.round(floorAfter)} instead of ${Math.round(floorBefore)}.`
      : ''

  if (skippedWithRoom > 0) {
    // Named rather than counted, because the specific day is the thing a student is looking
    // at and wondering about. With several, the first one passed over is the one that
    // prompts the question.
    const passed = dayName(schedule, from + 1, today)
    return `${lead} ${passed} ${planned ? 'has' : 'had'} room, but ${where} costs you less.${priced}`
  }

  if (skippedFull > 0) {
    const days = skippedFull === 1 ? 'day' : 'days'
    return `${lead} The ${countWord(skippedFull)} ${days} before it ${planned ? 'have' : 'had'} no room.${priced}`
  }

  return `${lead}${priced}`
}

/** How many of the ranked fixes to look through for one that actually helps. Cheap: the
 *  search has already evaluated every neighbour, and this only filters what it returned. */
const FIXES_TO_CONSIDER = 8

/**
 * The one move worth offering when something could not go where it wanted.
 *
 * Ruling 15's second question -- "could it fit if something moved?" -- answered without building
 * the second scheduler Ruling 16 forbids. `rebalance` and `smallestFixes` already do displacement,
 * with chained moves and full 21-day scoring; this adds no search of its own. It filters
 * what `smallestFixes` already returned down to a move that actually opens room on the day
 * in question.
 *
 * The filter is the point. `smallestFixes` ranks by deficit days and floor, which is a
 * different question from "does this make space on Tuesday" -- so its top move was often
 * true, useful, and completely unrelated to the thing the student had just been told did not
 * fit. Offering that reads as the app changing the subject.
 *
 * Null when nothing on the list helps, which is an honest answer: the day is full of things
 * that cannot move, and saying so beats offering a move that will not work.
 */
export function fixThatMakesRoom(
  schedule: Schedule,
  /**
   * What is being fitted, in the only terms this needs.
   *
   * A `SlotNeed` rather than a `ParsedItem`: only `hours`, `type` and `kind` were ever read,
   * and narrowing it lets the Rest button reuse this untouched -- rest is not a parse, and
   * building a fake `ParsedItem` to ask a question about three fields would have been the
   * kind of shim that outlives its excuse.
   */
  need: SlotNeed,
  dayIndex: number,
  params: EngineParams,
  /** The day the student is on, so the fix offered is one they can still carry out. Separate
   *  from `dayIndex`, which is the day being made room *on* -- usually today, but the Rest
   *  button asks about tomorrow as readily. */
  today: number,
): Fix | null {
  const opensRoom = smallestFixes(schedule, params, today, FIXES_TO_CONSIDER).filter(
    (fix) => slotOn(fix.move.apply(schedule), dayIndex, need) !== null,
  )
  if (opensRoom.length === 0) return null

  /**
   * How long this block could wait, as things stand.
   *
   * `effectiveDeadline`, so a synthetic deadline counts: undated work is not infinitely
   * patient, and treating it as such is what `softDeadlines` exists to stop.
   *
   * A move that has no block in the week -- `insertRest` and `insertSocial` add one rather
   * than displacing one -- costs nobody their deadline, so it reads as maximally slack and
   * is preferred over disturbing anything.
   */
  const slackOf = (fix: Fix): number => {
    const item = schedule.items.find((entry) => entry.id === fix.move.itemId)
    if (item === undefined) return HORIZON_DAYS

    return (effectiveDeadline(item) ?? HORIZON_DAYS) - item.dayIndex
  }

  /**
   * The slackest of the moves that work, not the first.
   *
   * `smallestFixes` ranks by days out of deficit, then depth, then floor gain, and nothing in
   * that measure knows how soon a block is due -- deliberately, because aligning it with
   * `score` would stop this fallback firing at all. So urgency was a hard bound and never a
   * preference: a deadline could not be crossed, but an essay due tomorrow was as likely to
   * be chosen as next week's laundry.
   *
   * It matters most for the Rest button, which moves something to buy a student time off:
   * reaching for the most urgent thing on the day is the one choice that turns a rest into a
   * debt. `reduce` keeps the incumbent on a tie, so among equally slack moves the ranking
   * above still decides.
   */
  return opensRoom.reduce((best, fix) => (slackOf(fix) > slackOf(best) ? fix : best))
}
