/**
 * How much the app has to have seen before it says anything measured about a student.
 *
 * One rule, one number, one home. `realityCheck` and `recoveryLearning` each declared their
 * own `MIN_SAMPLES = 3`, and `recoveryLearning`'s comment said outright that it was
 * "deliberately the same figure and the same reasoning as `realityCheck.MIN_SAMPLES`" --
 * two copies held in step by hand, with a comment where the import should have been.
 * `distress` and `energyHistory` cite the same rule in prose for their own thresholds.
 *
 * Three, because two points make a line out of a coincidence. Below this the honest answer
 * is the population default rather than a personal one: a student who has answered twice
 * has told the app almost nothing about themselves, and a correction fitted to it would be
 * noise presented as insight -- which §8.2 is explicit the product copy must never do.
 *
 * Deliberately not a per-learner knob. If one of them ever genuinely needs a different
 * figure, that is a different rule and wants its own name and its own reason, not a second
 * value under this one.
 */
export const MIN_SAMPLES_TO_SPEAK = 3
