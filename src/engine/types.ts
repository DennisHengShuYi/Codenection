/**
 * The model's taxonomy.
 *
 * §0 is explicit that the brief's five areas become five *labels* in the UI while the
 * model underneath uses four load types measured in time-weighted units -- schedule
 * density is a derived view, not a fifth bucket. Adding a fifth reserve here would
 * silently change what every projection means, so the count is asserted in params.test.ts.
 */
export const LOAD_TYPES = ['mental', 'physical', 'social', 'errands'] as const

export type LoadType = (typeof LOAD_TYPES)[number]

/** 0..100 per type. Clamped at every write: a negative reserve is meaningless and feeds
 *  straight into the efficiency curve, where it would quietly invert the model. */
export type Reserves = Readonly<Record<LoadType, number>>

/**
 * What the carryover matrix (§6.6) distinguishes. Deliberately coarser than `LoadType`,
 * because the residue an activity leaves depends on what you did rather than on which
 * bucket it drained: a hard session and a walk are both physical load, and they have
 * opposite effects on the study block that follows.
 */
export const ACTIVITY_KINDS = [
  'hardExercise',
  'lightExercise',
  'studyBlock',
  'socialDraining',
  'socialRestorative',
  'errands',
  'rest',
  'sleep',
] as const

export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

/**
 * Every kind a scheduled *block* may carry -- which is every `ActivityKind` except `sleep`.
 *
 * Sleep is an activity the model reasons about, but it enters through `Schedule.sleepByDay`
 * and never as a block on the grid; `engine/reachable.test.ts` records that as a deliberate
 * decision rather than an omission. A sleep block would be charged nothing by `drain.ts`
 * while `sleepByDay` counted the same hours again, so it is a block that quietly does not
 * exist to the model.
 *
 * One list, used by both places that must agree about it: `ItemChip`'s picker and
 * `ai/schema.ts`'s validation of a model reply (Ruling 46). Narrowing only the picker left
 * the boundary still admitting what the UI had stopped offering -- and the project rule is
 * that untrusted input never becomes trusted by passing through a layer.
 *
 * Written out rather than filtered so it can be a literal tuple, which `z.enum` needs.
 * `types.test.ts` guards it against drifting from `ACTIVITY_KINDS`.
 */
export const BLOCK_KINDS = [
  'hardExercise',
  'lightExercise',
  'studyBlock',
  'socialDraining',
  'socialRestorative',
  'errands',
  'rest',
] as const satisfies readonly ActivityKind[]

export type BlockKind = (typeof BLOCK_KINDS)[number]

export interface Activity {
  readonly kind: ActivityKind
  readonly type: LoadType
  /** Hours of wall-clock time the activity occupies. */
  readonly hours: number
  /** 0..2, where 1 is typical for its kind. */
  readonly intensity: number
  /** Local hour the activity starts, 0..24. Fractional values allowed. */
  readonly startHour: number
}

export interface DayInput {
  readonly dayIndex: number
  readonly activities: readonly Activity[]
  readonly sleepHours: number
  /** Distinct venues visited; drives travel load (§6.4). */
  readonly venueChanges: number
  /** Days until the nearest pending deadline, or null if none. Drives the anticipatory
   *  stress term in §6.4. */
  readonly daysToNearestDeadline: number | null
  /** False when the user did not check in. §6.5 treats absence as signal, not as
   *  neutral: a student having a genuinely bad week is exactly the one who goes quiet. */
  readonly checkedIn: boolean
}

export type CrossEffect = Readonly<Record<ActivityKind, Reserves>>

export type CouplingMatrix = Readonly<Record<LoadType, Reserves>>

export interface EngineParams {
  /** How much a unit of each type's time costs, relative to the others. */
  readonly typeIntensity: Reserves
  /** Reserve points returned per hour of sleep above the baseline. */
  readonly kSleep: Reserves
  /**
   * Hours of sleep that count as breaking even for this student.
   *
   * A parameter rather than a constant because seven hours is a gain for somebody who
   * normally gets six and a deficit for somebody who normally gets nine, and scoring both
   * against one number would tell one of them something false about their own week.
   *
   * §7.3 had the sleep painter measure it. The painter was deleted in Task 17 and §11
   * records the consequence in terms: nothing measures a personal baseline any more, so
   * this falls back to the population figure in `DEFAULT_PARAMS`, and §8's sleep row is what
   * makes that defensible. Stated here because the parameter still reads as though something
   * fills it in.
   */
  readonly sleepBaselineHours: number
  /** Reserve points returned per hour of scheduled rest. */
  readonly kRest: Reserves
  /** Reserve points returned per hour of restorative social contact. Separate from
   *  kSleep and kRest because §5.2 prescribes a person, not an early night: sleep and
   *  rest must not be able to refill this reserve, and contact must. */
  readonly kSocialContact: number
  /** Learned per type from planned-vs-actual (§2.4's Reality Check). 1 means unbiased;
   *  1.7 means this student underestimates that type by 70%. */
  readonly estimateBias: Reserves
  /** Below this many social hours in a day, social reserve drains (§1.2). */
  readonly socialFloorHoursPerDay: number
  readonly isolationDrainPerDay: number
  readonly contextSwitchPenalty: number
  readonly deadlineProximityWeight: number
  readonly travelLoadPerVenueChange: number
  /** §2.1's hard cap, so the optimizer cannot solve a week with a 14-hour Sunday. */
  readonly dailyHoursCap: number
}
