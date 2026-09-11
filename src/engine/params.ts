import type { CouplingMatrix, CrossEffect, EngineParams, Reserves } from './types'

// --- Constants the spec states outright -------------------------------------------

/** §6.1: `efficiency[d] = 0.45 + 0.55 × (reserve[d] / 100)`. */
export const EFFICIENCY_FLOOR = 0.45
export const EFFICIENCY_SPAN = 0.55

/** §6.1: `recovery[d] = max(0, sleep − 5) × k_sleep + rest_blocks × k_rest`. */
export const SLEEP_BASELINE_HOURS = 5

/**
 * The night the app assumes when the student has not said.
 *
 * Deliberately NOT the same question as either of the other two sleep figures in this
 * codebase, and the three must not converge: `SLEEP_BASELINE_HOURS` above is where sleep
 * begins paying anything at all, and `roomState.RESTED_NIGHT_HOURS` is where a student counts
 * as *short*. Using this one for that last job would wilt the bed for every student who had
 * never stated a target.
 *
 * A constant because it was four bare `7`s in four files -- the blank week, a real student's
 * first week, the bot's blank week, and the solver's missing-entry fallback. `freshWeek`'s own
 * docstring already recorded the invariant those last two share ("an unedited week and an
 * unedited day agree rather than each guessing separately"), held by hand, with a comment
 * where the import should have been.
 *
 * Not the `?? 7` in `fixtures/demoAccount.ts`: that index is `day % 7` into a seven-entry
 * table, so its fallback is unreachable index-access appeasement rather than an assumed
 * night. Naming it here would assert a meaning it does not have.
 */
export const DEFAULT_SLEEP_HOURS = 8

/** §6.6: at 70% reserve two hours of study costs two hours; at 25% it costs closer to
 *  three. The slope is what carries the second anchor: 1 + 1.111 × 0.45 ≈ 1.5. */
export const STATE_COST_PIVOT = 70
export const STATE_COST_SLOPE = 1.111

/** §7.6: "One hour of rest gives you back about 4 reserve points. Below 30 reserve that
 *  drops to 2." Also the line a day must fall under to count as a deficit day (§2.1). */
export const DEFICIT_THRESHOLD = 30

/** §2.1, §6: the projection horizon. */
export const HORIZON_DAYS = 21

/** §6.5: three projections at these estimate biases, shown as a band. */
export const BAND_BIASES = [0.95, 1.15, 1.4] as const

export const FULL_RESERVE = 100

// --- Population priors (§7.7) ------------------------------------------------------
//
// These produce a working app on first open, before any calibration has happened. §7.7
// is explicit that setup must read as progress rather than as a gate, which means the
// model has to be useful with nothing but these.

const uniform = (value: number): Reserves => ({
  mental: value,
  physical: value,
  social: value,
  errands: value,
})

export const DEFAULT_PARAMS: EngineParams = {
  // Mental time is the most expensive hour a student spends, errands the least. This
  // ordering is what stops a day of laundry reading like a day of exam revision.
  typeIntensity: { mental: 1.0, physical: 0.8, social: 0.6, errands: 0.5 },

  // Sleep returns nothing to the social reserve, and that zero is load-bearing rather
  // than a rounding-down. §5.2 prescribes *a person* when social reserve is low, and
  // §1.2 requires low social load to read as a warning. A non-zero coefficient here lets
  // an isolated student recover by sleeping -- measured at 20 to 65 over a fortnight of
  // seeing nobody -- which makes the app's answer to loneliness an early night and
  // quietly erases the isolation signal the engine exists to surface.
  kSleep: { mental: 6.0, physical: 7.0, social: 0, errands: 2.0 },
  kRest: { mental: 4.0, physical: 3.0, social: 0, errands: 2.0 },
  kSocialContact: 4.0,

  // Starts unbiased and is learned per type from planned-vs-actual (§2.4). The user is
  // never asked for this and need not know the parameter exists (§7.5).
  sleepBaselineHours: SLEEP_BASELINE_HOURS,
  // §2.4's slot, and it stays 1 here on purpose: an uncalibrated student has no measured
  // bias, and inventing one would distort every projection they ever see.
  estimateBias: uniform(1),

  socialFloorHoursPerDay: 0.5,
  // The rate is a population prior, to be calibrated per user like every other (§7).
  // What is structural, and not a tuning knob, is the direction: social reserve falls
  // with isolation and is refilled only by contact.
  isolationDrainPerDay: 1.5,

  contextSwitchPenalty: 1.5,
  deadlineProximityWeight: 6,
  travelLoadPerVenueChange: 1.5,
  dailyHoursCap: 10,
}

/**
 * §6.6's table, as residue on each reserve's *capacity* for the hours that follow.
 *
 * The positive entries matter as much as the negative ones. Light movement genuinely
 * raises subsequent focus, which is what makes the app's own recovery suggestions
 * self-justifying: a walk is not merely rest, it buys a better study block.
 */
export const CROSS_EFFECT: CrossEffect = {
  hardExercise: { mental: -0.25, physical: -0.2, social: 0, errands: -0.1 },
  lightExercise: { mental: 0.1, physical: 0.05, social: 0.05, errands: 0 },
  studyBlock: { mental: -0.3, physical: 0, social: -0.05, errands: 0 },
  socialDraining: { mental: -0.15, physical: 0, social: 0.1, errands: 0 },
  socialRestorative: { mental: 0.1, physical: 0, social: 0.2, errands: 0 },
  errands: { mental: -0.1, physical: -0.05, social: 0, errands: 0.05 },
  rest: { mental: 0.15, physical: 0.1, social: 0, errands: 0 },
  // Sleep is a full reset rather than a trailing effect, so it leaves no residue and
  // its half-life below is zero.
  sleep: { mental: 0, physical: 0, social: 0, errands: 0 },
}

/** Hours over which a kind's residue decays to half. §6.6: hard exercise recovers over
 *  roughly three hours, and a long study block "needs a real gap". */
export const CARRYOVER_HALF_LIFE_HOURS: Readonly<Record<keyof CrossEffect, number>> = {
  hardExercise: 3,
  lightExercise: 2,
  studyBlock: 2.5,
  socialDraining: 2,
  socialRestorative: 2,
  errands: 1.5,
  rest: 2,
  sleep: 0,
}

/**
 * §6.3: physical depletion drags mental capacity; social isolation slows recovery across
 * the board.
 *
 * Read as `COUPLING[source][target]`: how strongly a deficit in `source` pulls `target`
 * down. Every entry is non-negative and applied as a subtraction, so coupling can only
 * drag a reserve down and never lift one -- otherwise a well-rested body would paper
 * over an isolated month, which is precisely the reading §6.3 exists to prevent.
 *
 * The diagonal is zero: a reserve must not compound its own deficit.
 */
export const COUPLING: CouplingMatrix = {
  mental: { mental: 0, physical: 0.02, social: 0.04, errands: 0.02 },
  physical: { mental: 0.12, physical: 0, social: 0.02, errands: 0.04 },
  social: { mental: 0.08, physical: 0.02, social: 0, errands: 0.02 },
  errands: { mental: 0.03, physical: 0.01, social: 0.01, errands: 0 },
}
