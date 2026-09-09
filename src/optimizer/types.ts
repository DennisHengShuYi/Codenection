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
  /** Stronger than `fixed`. §5.1 calls structurally protected recovery the most
   *  important design decision in the app: the optimizer cannot move protected rest, and
   *  cannot schedule anything over it either. */
  readonly protectedRest: boolean
}

/**
 * §5.2's failed-recovery log: what was tried, and whether it actually helped.
 *
 * Declared here alongside `Commitment` because it is state the week carries. Nothing in
 * `src/engine` or `src/optimizer` reads it.
 */
export interface RecoveryAttempt {
  readonly kind: ActivityKind
  readonly helped: boolean
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
  /**
   * What recovery was tried and whether it helped (§5.2).
   *
   * Carried inside the week for the same reason `commitments` is: no migration, no adapter
   * change, and it is genuinely part of the week. Optional because weeks saved before this
   * have no such field and must keep loading. Nothing in `src/engine` or `src/optimizer`
   * reads it.
   */
  readonly recoveryLog?: readonly RecoveryAttempt[]
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
