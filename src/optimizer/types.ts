import type { ActivityKind, LoadType, Reserves } from '../engine'

export interface ScheduledItem {
  readonly id: string
  readonly title: string
  readonly type: LoadType
  readonly kind: ActivityKind
  readonly hours: number
  readonly intensity: number
  readonly dayIndex: number
  readonly startHour: number
  /** §2.1's fixed set: classes, shifts, hard deadlines, already-protected rest. The
   *  optimizer may not move these. */
  readonly fixed: boolean
  /** Latest dayIndex this may occupy. Null means undated. */
  readonly deadlineDay: number | null
  /**
   * Latest dayIndex this SHOULD occupy, when nothing says it must.
   *
   * Health, relationships and rest have no due date, which is why they always lose:
   * `objective.deadlinePressure` says so itself -- "undated work has no deadline to be late
   * for and costs nothing". This is the synthetic one that lets them compete.
   *
   * Soft, and emphatically not `deadlineDay`. `constraints.violations` treats a missed
   * `deadlineDay` as a hard rejection no amount of gain can buy past, so a synthetic
   * deadline stored there would invalidate a student's whole fortnight the first time they
   * went a day longer than usual without stopping. The thing that makes this useful -- that
   * it can be missed, repeatedly, at a rising cost -- is what `deadlineDay` is defined to
   * forbid.
   *
   * Absent on items that carry a real `deadlineDay`: those are already charged, and
   * charging them twice would double-count one effect. Also absent on weeks saved before
   * this existed, which is what makes it optional. `domain/softDeadlines` owns it.
   */
  readonly softDeadlineDay?: number
  /**
   * §2.4's correction for this block, stamped from the block log before the engine sees it.
   *
   * Derived rather than stored, exactly like `softDeadlineDay` above: it is a reading of the
   * log at a moment, not a property of the block, and a week saved with one baked in would
   * carry a stale correction for ever. `domain/estimateBias` owns it, and `drain` falls back
   * to the type-wide figure wherever it is absent.
   */
  readonly estimateBias?: number
  /**
   * The student was shown §2.4's correction for this work and accepted it, so `hours` is
   * already the corrected figure.
   *
   * Persisted, unlike `estimateBias` above -- it records something the student did rather
   * than a reading of the log, and a decision they made must survive the week being saved.
   *
   * Without it, accepting the app's own suggestion would be worse than ignoring it: the
   * bigger number would be padded again, and two hours of work agreed at 3.8 would be
   * charged as 7.2.
   */
  readonly paddedHours?: boolean
  /** Stronger than `fixed`. §5.1 calls structurally protected recovery the most
   *  important design decision in the app: the optimizer cannot move protected rest, and
   *  cannot schedule anything over it either. */
  readonly protectedRest: boolean
  /**
   * Ruling 39: which recurring series this block came from, when it came from one.
   *
   * Optional, because most blocks are one-offs and every week saved before recurrence
   * existed has none. The optimizer never reads it -- recurrence is expanded at entry and
   * nothing downstream needs to know it happened -- but it is what makes "this class has
   * ended" or "it moved to Thursday" a single operation rather than editing three items by
   * hand.
   */
  readonly seriesId?: string
  /**
   * The identifier this block carries in the system it was imported from, when it was
   * imported at all.
   *
   * Carried this far for the push: a block that came from Google and is pushed back
   * appears twice in the calendar it came from, and the next import reads both. By push
   * time the `ParsedItem` that knew is long gone, so the block has to know instead.
   *
   * Absent for anything typed, photographed or generated here, which is most of a week.
   */
  readonly sourceId?: string
}

/** §2.3's provisional yes: an acceptance and the date by which it has to prove itself. */
export interface Commitment {
  readonly id: string
  readonly title: string
  /** Day index by which the reserve has to be able to hold it, or it lapses. */
  readonly reviewDay: number
  /** The scheduled item this acceptance created, so a lapse can name the right one. */
  readonly itemId: string
}

export interface Schedule {
  readonly items: readonly ScheduledItem[]
  readonly start: Reserves
  readonly horizonDays: number
  /**
   * Hours slept on the night at the END of each day, indexed by day.
   *
   * `sleepByDay[d]` is the night between day `d` and day `d + 1`, and that follows from
   * §6.1's own arithmetic rather than being a convention anyone chose:
   * `reserve[d+1] = reserve[d] - drain[d] + recovery[d] x efficiency[d]`, and sleep enters
   * through `recovery[d]`. Sleeping well on Friday night is what you wake up with on
   * Saturday, so that night is Friday's entry.
   *
   * Written down because it was not, and an off-by-one lived here for months as a result:
   * the check-in card asks "how much sleep last night?" and wrote the answer to
   * `sleepByDay[today]`, which is TONIGHT. Last night is `sleepByDay[today - 1]` --
   * `domain/sleepPlan.lastNight` is the one place that subtraction is done. The report never
   * reached the day it explained, so the app could not say "you are low today because you
   * slept five hours", and tonight's plan was quietly overwritten by a night already past.
   */
  readonly sleepByDay: readonly number[]
  /**
   * The real date day 0 falls on, as YYYY-MM-DD, or absent for a week saved before anchoring
   * existed.
   *
   * Everything else in the model is a day *index*, which works until something has to
   * survive the app being closed and reopened: a prediction cannot resolve without knowing
   * which real day it was about, and "what did I do yesterday" cannot be answered at all.
   *
   * Read only through `src/domain/calendar.ts`, which takes the clock as a parameter.
   * Nothing in `src/engine` or `src/optimizer` reads it -- their purity is the reason the
   * anchor lives out here rather than in the model.
   */
  readonly startedOn?: string
  /**
   * Provisional acceptances and their review dates (§2.3).
   *
   * Carried inside the week rather than in a storage concept of its own, so no migration is
   * needed and neither adapter changes -- the record genuinely is part of the week, and it
   * is persisted by the same `saveWeek` that already runs.
   *
   * Optional because weeks saved before this feature have no such field and must keep
   * loading. Nothing in `src/engine` or `src/optimizer` reads it: it is state the week
   * carries, not an input to the model.
   */
  readonly commitments?: readonly Commitment[]
}

export type MoveKind =
  | 'shiftDay'
  | 'batchErrands'
  | 'insertRest'
  | 'insertSocial'
  | 'reorderWithinDay'

export interface Move {
  readonly kind: MoveKind
  readonly itemId: string
  /** Specific and human-readable. §2.1: never "optimised", always what actually
   *  changed -- a student will not act on a reshuffle they cannot see. */
  readonly description: string
  readonly apply: (schedule: Schedule) => Schedule
}

export interface RebalanceResult {
  readonly schedule: Schedule
  /**
   * How many candidate schedules the search scored.
   *
   * The honest unit for §2.1's performance budget. Wall-clock time depends on whose
   * machine is measuring -- a CI runner is several times slower than a laptop -- so a
   * millisecond assertion either flakes or gets quietly raised until it means nothing.
   * This number is identical on every machine for a given schedule and seed, so a test
   * against it catches an algorithmic regression and nothing else.
   */
  readonly evaluations: number
  /** The schedule this started from, so §2.1's one-tap undo is exact rather than
   *  reconstructed. */
  readonly before: Schedule
  readonly moves: readonly Move[]
  readonly worstBefore: number
  readonly worstAfter: number
}
