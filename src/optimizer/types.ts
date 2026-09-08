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

export interface Schedule {
  readonly items: readonly ScheduledItem[]
  readonly start: Reserves
  readonly horizonDays: number
  readonly sleepByDay: readonly number[]
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
  /** The schedule this started from, so §2.1's one-tap undo is exact rather than
   *  reconstructed. */
  readonly before: Schedule
  readonly moves: readonly Move[]
  readonly worstBefore: number
  readonly worstAfter: number
}
