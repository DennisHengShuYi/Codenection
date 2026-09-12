import type { CouplingMatrix, CrossEffect, EngineParams, Reserves } from './types'

// --- Constants the spec states outright -------------------------------------------

/** §6.1: `efficiency[d] = 0.45 + 0.55 × (reserve[d] / 100)`. */
export const EFFICIENCY_FLOOR = 0.45
export const EFFICIENCY_SPAN = 0.55

/**
 * §6.1 amended: how close to full a reserve must be before there is less left to give back.
 *
 * The model was bistable without this, and the measurement is worth recording because it
 * looked like a coefficient problem and was not. Drain rises as a student depletes (§6.6)
 * and recovery rose as they filled -- `efficiencyAt` below -- so both directions reinforced
 * and the middle pushed away from itself. On one identical seven-hour-a-day fortnight,
 * starting at 65 climbed to 100 and starting at 60 fell to 40. There was no settling level
 * anywhere, so every student ended pinned at one end or the other, and four bars out of five
 * sat flat at full while the week beneath them changed completely.
 *
 * Cutting `kSleep` was tried first and is the wrong instrument: at 3.0 everything up to
 * eight hours of study a day still ended at exactly 100, and at 2.0 the fortnight went from
 * 77 to 5 between a six-hour day and an eight-hour one. That moves the cliff. It does not
 * make a slope.
 *
 * Deliberately NOT a softening of §6.2. That curve says recovery is less effective the more
 * depleted you are, and it is untouched here -- this asks a different question, which is how
 * much of a reserve is missing at all. A student at 95 has five points to refill and cannot
 * be given eighteen, whatever their efficiency. Below `FULL_RESERVE - 30` the term is exactly
 * 1 and changes nothing, so the whole depleted half of the range behaves as it always did.
 *
 * Thirty rather than the full hundred, and measured: at 40 an ordinary fortnight of six-hour
 * days settles at 85, at 30 it settles at 89, at 20 at 93. Twenty leaves the bars too close
 * together to read; forty starts charging a light week for being light. Thirty puts a week of
 * ten-hour days at 81 and a week of two-hour days at 96 -- a spread a student can actually
 * see on a bar.
 */
export const RECOVERY_HEADROOM_SPAN = 30

/** §6.1: `recovery[d] = max(0, sleep − 5) × k_sleep + rest_blocks × k_rest`. */
export const SLEEP_BASELINE_HOURS = 5

/**
 * §6.1 amended: where sleep stops paying back, until the app learns this student's own figure.
 *
 * The credit was linear forever -- nine hours beat eight, twelve beat nine, with no point at
 * which more stopped helping. That made "enough sleep" something the model could not hold, and
 * it also credited a twelve-hour night seven hours of recovery. §5.1 already caps REST per
 * block for exactly that reason ("a 12-hour scroll session is not recovery, and the model must
 * not count it as neutral free time"); sleep had no equivalent.
 *
 * Nine rather than eight, for two reasons. It binds only on genuinely long nights, so it
 * changes nothing for almost everyone. And it leaves the learned figure room to move DOWNWARD,
 * which is the direction that matters: "seven is enough for me" is the claim this exists to
 * make possible, and a default already at the bottom of the plausible range could never express
 * it.
 *
 * Together with `SLEEP_BASELINE_HOURS` this is a window, not a threshold: below five, sleep
 * pays nothing and costs something (`kSleepDebt`); above nine it simply stops paying more.
 */
export const ENOUGH_SLEEP_HOURS = 9

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
  /*
   * How TIRING an hour of each kind of load is -- and only that, since `objective.CONSEQUENCE`
   * took the other question away.
   *
   * Errands least and mental high is the ordering that stops a day of laundry reading like a
   * day of exam revision, and it is unchanged. Physical is the one that moved, from 0.8 to
   * 1.3, and it moved because 0.8 was answering the question that now lives in the optimizer:
   * a missed gym session IS less consequential than a missed essay, but an hour of hard
   * training is plainly not less depleting than an hour of reading. The model charged five
   * hours of hard exercise 4.00 against five hours of study's 5.00, which no athlete would
   * recognise, and against the recovery a night pays a body it never bit -- five hours of hard
   * training EVERY day for three weeks left the body bar at 83, and one hour a day took it
   * from 80 up to 97.
   *
   * 1.6 rather than 1.3, and measured across the range rather than reasoned to. At 1.3 five
   * hours of hard training a day still left a body at 70 after three weeks, which is the same
   * complaint one step smaller. At 1.6: an hour a day leaves 94, two hours 87, three hours 79,
   * and five hours a day floors it -- which is what three weeks of that would actually do to
   * somebody. An hour of hard exertion is now the most expensive hour in the table, which is
   * what it is.
   *
   * The per-block `intensity` field is what separates a gentle walk from a session within
   * that, which is what it is for.
   */
  typeIntensity: { mental: 1.0, physical: 1.6, social: 0.6, errands: 0.5 },

  // Sleep returns nothing to the social reserve, and that zero is load-bearing rather
  // than a rounding-down. §5.2 prescribes *a person* when social reserve is low, and
  // §1.2 requires low social load to read as a warning. A non-zero coefficient here lets
  // an isolated student recover by sleeping -- measured at 20 to 65 over a fortnight of
  // seeing nobody -- which makes the app's answer to loneliness an early night and
  // quietly erases the isolation signal the engine exists to surface.
  /*
   * Physical is 3.0 rather than 7.0, and the cut is a correction rather than a tuning knob.
   *
   * At 7.0 sleep repaid a body more than it repaid a mind, which nothing in §6 or the rulings
   * argues for and which made the body bar unreadable: only exercise is typed physical, so a
   * fortnight of ten-hour study days took it from 92 UP to 100 while every other bar fell.
   * `SECONDARY_COST` gave desk work a body cost, and against 21 points a night that drain was
   * noise -- the bar moved to 97 and still said nothing. Fourteen to one is not a gap a drain
   * can close.
   *
   * Measured across the whole workload range at 7.0, 5.0, 3.0 and 2.0: the spread between the
   * lightest possible fortnight and the heaviest is 3 points at 7.0 and 6 at 3.0. Below that
   * it keeps widening, but a body that a fortnight of desk work takes to 90 is claiming more
   * about sedentary harm than this model has any evidence for, and sleep genuinely is how a
   * body is repaid.
   */
  kSleep: { mental: 6.0, physical: 3.0, social: 0, errands: 2.0 },

  /**
   * §6.1 amended: what a night SHORT of the baseline costs, per hour short, as drain.
   *
   * `max(0, sleep - 5)` floored the credit at zero, so two hours of sleep and five hours of
   * sleep were the same thing to the model -- and a week of two-hour nights left the physical
   * reserve flat, because nothing drained it and nothing repaid it. The model declined to
   * have an opinion about the most damaging thing a student can do to themselves.
   *
   * Drain rather than negative recovery, and that is the load-bearing choice: recovery is
   * multiplied by `efficiencyAt(reserve)`, so a negative credit would SHRINK as somebody got
   * more depleted -- deprivation would hurt a healthy student more than an exhausted one,
   * which is backwards. A cost belongs in drain, where the state multiplier already makes
   * costs rise as a reserve falls (Ruling 67).
   *
   * Four rather than mirroring `kSleep`'s six and seven. Measured over a fortnight: at
   * mirrored rates a two-hour night regime empties both reserves by day four, and once
   * several sit at zero every bad week looks identical -- the model loses the resolution the
   * spiral is supposed to show. At four, a two-hour night costs about 15 mental and 12
   * physical on the day, which is a serious visible hit that one all-nighter recovers from.
   *
   * Social is zero, the same zero `kSleep` carries and for the same reason: §5.2 prescribes a
   * person when social reserve is low and §1.2 wants isolation to read as a warning, so
   * letting sleep move that reserve in EITHER direction makes the app's answer to loneliness
   * a matter of bedtime. Errands is zero too -- there is no evidence behind a figure there,
   * and an invented one would be a claim the model cannot support.
   */
  kSleepDebt: { mental: 4.0, physical: 4.0, social: 0, errands: 0 },
  kRest: { mental: 4.0, physical: 3.0, social: 0, errands: 2.0 },
  kSocialContact: 4.0,

  // Starts unbiased and is learned per type from planned-vs-actual (§2.4). The user is
  // never asked for this and need not know the parameter exists (§7.5).
  sleepBaselineHours: SLEEP_BASELINE_HOURS,
  // §6.1 amended. Learned per student where the evidence allows -- `domain/sleepEnough` --
  // and the population figure until then.
  enoughSleepHours: ENOUGH_SLEEP_HOURS,
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
/**
 * §6.4 amended: what an hour of one kind of load costs the OTHER three reserves.
 *
 * The drain was one-hot -- `totals[activity.type]`, one bar and exactly one -- so a reserve
 * was touched only if the day happened to contain an activity carrying its own type. Only
 * exercise is typed physical, so ten hours at a desk cost a body nothing: measured, a
 * fortnight of ten-hour study days took the body bar from 92 UP to 100 while the study bar
 * fell to 16, because sleep repaid it 21 points a night against a drain that could never
 * fire. The same held for errands, which drifted from 81 to 83 across the worst week a
 * student could have.
 *
 * The one-hot assumption was the bug, not the coefficients. Nothing a person does costs
 * exactly one thing: three hours hunched at a desk costs a body, and errands are walking,
 * carrying and queueing.
 *
 * The diagonal is zero because `typeIntensity` is the diagonal, and keeping the two apart is
 * what makes this change unable to alter any primary cost -- every figure the model charged
 * before it is charged identically after.
 *
 * Small, and mostly zero, for the reason §6.3 exists. Four separately priced reserves is the
 * claim that a student can be socially fine and mentally destroyed; reserves that all drain
 * together are one number wearing four hats. Nothing here exceeds a fifth of the primary.
 *
 * The two empty rows are an answer rather than an omission. Exercise and draining social
 * obligations do cost a head, and the model already says so through `CROSS_EFFECT` -- as a
 * residue on the hours that follow, which is the shape that effect actually has. Charging
 * them here as well would be one claim counted twice. Sitting is the other shape: it costs a
 * body *while it happens*, which is what this table is for.
 */
export const SECONDARY_COST: CouplingMatrix = {
  // Sitting still and concentrating. Stiffness and fatigue, not a workout.
  mental: { mental: 0, physical: 0.15, social: 0, errands: 0 },
  // Empty by design -- see above. `CROSS_EFFECT.hardExercise` carries what a session costs a
  // head, and it carries it as the residue it is.
  physical: { mental: 0, physical: 0, social: 0, errands: 0 },
  // Walking, carrying and queueing, plus the remembering and deciding that come with them.
  errands: { mental: 0.1, physical: 0.2, social: 0, errands: 0 },
  // Empty by design -- `CROSS_EFFECT.socialDraining` already prices what an obligation costs
  // a head afterwards.
  social: { mental: 0, physical: 0, social: 0, errands: 0 },
}

export const COUPLING: CouplingMatrix = {
  mental: { mental: 0, physical: 0.02, social: 0.04, errands: 0.02 },
  physical: { mental: 0.12, physical: 0, social: 0.02, errands: 0.04 },
  social: { mental: 0.08, physical: 0.02, social: 0, errands: 0.02 },
  errands: { mental: 0.03, physical: 0.01, social: 0.01, errands: 0 },
}
