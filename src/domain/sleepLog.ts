/**
 * What the student said about a night, and when they said it.
 *
 * Shaped on `BlockRecord` in `./blockLog` deliberately: the same idea, the same
 * upsert-by-key rule, the same reason. It carries the figure itself rather than a pointer
 * into the week, because a fortnight is persisted as one blob and rolls over -- a record
 * that referred to a day index would describe a different night a fortnight later.
 *
 * Keyed by ISO date for that same reason, and because §9 puts this app at UTC+8:
 * `domain/calendar.isoDateOf` is the one place a moment becomes a date, and this module takes
 * the result rather than deriving a second one.
 *
 * This type is the answer to a defect stated twice in `ui/room/todayRows.ts`: `sleepByDay`
 * defaults to a plausible figure and nothing recorded whether a night was *answered*, so the
 * app could not tell "slept eight hours" from "nobody has asked yet". `reportedOn` returning
 * null is that distinction, and it is what lets `./sleepReality` speak and the bed row draw a
 * trend at all.
 */
export interface SleepNight {
  /** The night this is about, as a local date (`calendar.isoDateOf`). */
  readonly isoDate: string
  /**
   * Hours, not a bucket name.
   *
   * `SLEEP_HOURS`' four buckets are the question asked; this is the answer stored. Keeping
   * hours means a later change to the buckets cannot silently rewrite what somebody already
   * reported -- the record would otherwise say `six` and mean whatever `six` maps to today.
   */
  readonly hours: number
  readonly answeredAt: number
}

/** Upserts on `isoDate`: answering the same night twice corrects the first answer rather than
 *  stacking a second one, which would double-count that night in every average over the log. */
export function recordNight(log: readonly SleepNight[], night: SleepNight): readonly SleepNight[] {
  return [...log.filter((entry) => entry.isoDate !== night.isoDate), night]
}

/**
 * The reported figure for one night, or null if nobody answered it.
 *
 * Null rather than a fallback, and that is the whole point of the module: a caller wanting a
 * default must choose it in the open. Substituting one here is how an unmeasured figure ends
 * up quoted as a measured one, which §8.2 forbids.
 */
export function reportedOn(log: readonly SleepNight[], isoDate: string): number | null {
  return log.find((entry) => entry.isoDate === isoDate)?.hours ?? null
}

/** Every reported figure, oldest night first -- the order they happened in rather than the
 *  order they were answered in, because a trend reads the sequence and an average does not. */
export function reportedNights(log: readonly SleepNight[]): readonly number[] {
  return log
    .slice()
    .sort((left, right) => left.isoDate.localeCompare(right.isoDate))
    .map((entry) => entry.hours)
}

/** The log laid over a run of dates -- the fortnight, in practice -- with a gap for each night
 *  nobody answered. */
export function answeredDays(
  log: readonly SleepNight[],
  isoDates: readonly string[],
): readonly (number | null)[] {
  return isoDates.map((isoDate) => reportedOn(log, isoDate))
}
