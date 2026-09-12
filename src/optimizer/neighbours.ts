import type { EngineParams } from "../engine";
import { violations } from "./constraints";
import { DAY_END_HOUR, gapsOn, hourNear } from "./gaps";
import { score } from "./objective";
import type { Move, Schedule, ScheduledItem } from "./types";

/** How far a single move may shift a task. Small on purpose: §2.2 observes that a
 *  student will do one thing, so the neighbourhood is built from changes a person could
 *  actually be asked to make. */
const DAY_SHIFTS = [-2, -1, 1, 2];

/**
 * How many openings on the new day are worth scoring.
 *
 * Every gap is a candidate in principle and most days have one or two, so this is a bound on
 * the pathological case rather than a rule the ordinary one meets. Each option costs a full
 * projection, and `shiftMoves` runs on every movable block on every iteration of the climb --
 * an unbounded count would put the cost of a solve at the mercy of how fragmented the worst
 * day in the fortnight happens to be.
 *
 * Nearest the block's own hour first, so what gets dropped is always the furthest from where
 * the student actually does this thing.
 */
const NEARBY_OPENINGS = 3;

/** Floating-point slack, so an option that changes the score by nothing does not count as
 *  better and take the placement away from the block's own hour. */
const EPSILON = 1e-9;

const REST_HOURS = 2;
const REST_START_HOUR = 20;
const SOCIAL_HOURS = 2;
const SOCIAL_START_HOUR = 18;

const replace = (
  schedule: Schedule,
  id: string,
  next: ScheduledItem,
): Schedule => ({
  ...schedule,
  items: schedule.items.map((item) => (item.id === id ? next : item)),
});

/**
 * §2.1's movable set: soft deadlines, undated work, errands.
 *
 * Everything fixed stays put, and protected rest is not merely fixed but untouchable --
 * checked here at generation rather than only at validation, because a search that can
 * *reach* a state where rest has moved is a search that treats rest as negotiable.
 *
 * A block already behind the student is untouchable for a plainer reason: it happened there.
 * Rearranging it would be rewriting what they did, and the projection reads those days as
 * lived -- so a move in the past changes today's reserve, which is the one number every
 * screen is built on.
 */
const isMovable = (item: ScheduledItem, today: number): boolean =>
  !item.fixed && !item.protectedRest && item.dayIndex >= today;

/**
 * Where this block could go on `dayIndex`, nearest its own hour first.
 *
 * One placement per opening it fits in: inside a gap the nearest hour to the one it already
 * has, which is the same clamp `hourNear` makes -- the difference is that this keeps every
 * gap as a live option instead of returning only the closest, so the caller can ask what each
 * one would cost.
 */
function landingHours(
  schedule: Schedule,
  dayIndex: number,
  item: ScheduledItem,
): number[] {
  const inside = gapsOn(schedule, dayIndex)
    .filter((gap) => gap.hours >= item.hours)
    .map((gap) =>
      Math.min(
        Math.max(item.startHour, gap.startHour),
        gap.startHour + gap.hours - item.hours,
      ),
    );

  return [...new Set(inside)]
    .sort(
      (left, right) =>
        Math.abs(left - item.startHour) - Math.abs(right - item.startHour) ||
        left - right,
    )
    .slice(0, NEARBY_OPENINGS);
}

/**
 * The opening on `dayIndex` that leaves the fortnight best off, its own hour winning ties.
 *
 * Two rules, in this order, and the order is the whole point.
 *
 * **Its own hour first.** A block that happens at 18:00 is the strongest evidence the
 * schedule holds about when this particular thing happens, and it beats any rule about where
 * a *kind* of work belongs -- which is a habit the student may not have. `slotFinder.preferredHour` was
 * asked this question instead and had an answer only for rest, social, study and errands;
 * everything else, exercise included, fell through to `WAKE_HOUR`. A 18:00 gym moved to an
 * empty day landed at 08:00, the app overriding an unambiguous evening pattern with a
 * default.
 *
 * **Unless the week pays for it.** A preference that outranks the model is how the solver
 * proposes a change that makes the fortnight worse, and §6.6 makes the cost real and local:
 * a hard session immediately before deep study leaves a residue on mental capacity that the
 * same session after it does not. So each opening is projected and scored on the objective
 * every other decision here is made on, and the block keeps its hour only where the model is
 * genuinely indifferent. Strictly better, by `EPSILON` -- the tie belongs to the student.
 *
 * Scored here rather than by emitting one move per opening, because the climb's scan starts
 * at a random offset and would break those ties arbitrarily. "Its own hour unless there is a
 * reason" has to be decided somewhere that can see all the options at once.
 */
function bestLanding(
  schedule: Schedule,
  params: EngineParams,
  item: ScheduledItem,
  dayIndex: number,
): number | null {
  const options = landingHours(schedule, dayIndex, item);
  if (options.length <= 1) return options[0] ?? null;

  const scoreAt = (startHour: number): number =>
    score(replace(schedule, item.id, { ...item, dayIndex, startHour }), params);

  let best = options[0] as number;
  let bestScore = scoreAt(best);

  for (const startHour of options.slice(1)) {
    const candidateScore = scoreAt(startHour);
    if (candidateScore > bestScore + EPSILON) {
      best = startHour;
      bestScore = candidateScore;
    }
  }

  return best;
}

function shiftMoves(
  schedule: Schedule,
  params: EngineParams,
  today: number,
): Move[] {
  const moves: Move[] = [];

  for (const item of schedule.items.filter((entry) =>
    isMovable(entry, today),
  )) {
    for (const delta of DAY_SHIFTS) {
      const dayIndex = item.dayIndex + delta;
      if (dayIndex < today || dayIndex >= schedule.horizonDays) continue;
      if (item.deadlineDay !== null && dayIndex > item.deadlineDay) continue;

      /**
       * A real opening on the new day, not the hour it happened to have.
       *
       * The day changed and the hour was kept, so a 14:00 block shifted onto a day that
       * already had something at 14:00 landed on top of it. `violations` tolerates two
       * movable blocks overlapping on purpose -- neither is pinned, so the search can still
       * separate them, and refusing the state would cut off legal paths through a week that
       * arrived broken. But a state the search may pass *through* is not a change to put in
       * front of a student: "Moved Laundry 1 day later" double-booked their evening, and the
       * calendar showed it.
       *
       * Which opening is `bestLanding`'s question, and it is not merely "the closest one
       * that fits": see its own doc.
       *
       * No room at all on that day means there is no move, rather than a move that produces
       * a clash.
       */
      const startHour = bestLanding(schedule, params, item, dayIndex);
      if (startHour === null) continue;

      const direction = delta > 0 ? "later" : "earlier";
      const days = Math.abs(delta);

      moves.push({
        kind: "shiftDay",
        itemId: item.id,
        description: `Moved ${item.title} ${days} day${days === 1 ? "" : "s"} ${direction}`,
        apply: (s) => replace(s, item.id, { ...item, dayIndex, startHour }),
      });
    }
  }

  return moves;
}

/** §2.2: errand batching, by putting one errand immediately after another. */
function batchMoves(schedule: Schedule, today: number): Move[] {
  const errands = schedule.items.filter(
    (item) => isMovable(item, today) && item.type === "errands",
  );
  const moves: Move[] = [];

  for (const target of errands) {
    for (const other of errands) {
      if (other.id === target.id || other.dayIndex === target.dayIndex)
        continue;
      if (other.deadlineDay !== null && target.dayIndex > other.deadlineDay)
        continue;

      // Past the end of the day is not a placement. `startHour + hours` is unbounded here,
      // and `constraints.violations` checks deadlines, overlaps and the daily cap but never
      // the day's own edge -- so a batch onto a late target produced a valid-looking
      // candidate starting at 25, which `drain` and `carryover` then charged to today.
      //
      // Deliberately not routed through `hourNear`: these two moves exist to place a block
      // immediately after another one, and `hourNear` finds whichever gap fits, which is a
      // different move.
      if (target.startHour + target.hours + other.hours > DAY_END_HOUR)
        continue;

      moves.push({
        kind: "batchErrands",
        itemId: other.id,
        description: `Batched ${other.title} with ${target.title}`,
        apply: (s) =>
          replace(s, other.id, {
            ...other,
            dayIndex: target.dayIndex,
            startHour: target.startHour + target.hours,
          }),
      });
    }
  }

  return moves;
}

/** §5.1: rest is a scheduled object with weight, which the solver can add to a week.
 *  Inserted as protected, so once placed it cannot be moved again. */
function restMoves(schedule: Schedule, today: number): Move[] {
  const moves: Move[] = [];

  // From today, never from day zero. Rest proposed for last Tuesday is not an offer a
  // student can take, and the engine would credit its recovery to a day already lived.
  for (let day = today; day < schedule.horizonDays; day += 1) {
    /**
     * One rest block a day, and that stays a count rather than a sum of hours.
     *
     * The engine credits rest per block up to `USEFUL_REST_HOURS`, so on paper a day holding
     * one short block still has room and this guard is stricter than the model -- the same
     * mismatch `socialMoves` has below. It was changed to measure hours and changed back,
     * because the cost is larger than the mismatch: offering a second block per day took the
     * undated-fortnight search from 2,9xx evaluations to 3,368, past the bound
     * `neglect.test.ts` guards and explains, and §2.1 budgets the whole solve under 100ms on
     * a phone. It also broke `runRebalance`'s "proposes nothing when there is nothing to
     * move" -- a settled week started collecting fourteen rest proposals nobody asked for.
     *
     * So the simplification is deliberate: one block a day is what the solver offers, and a
     * student wanting a second can add it themselves. `DAILY_RECOVERY_CEILING` is the limit
     * on what a day's rest is *worth*, which is a different question and lives in
     * `domain/recoveryCeiling`.
     */
    if (
      schedule.items.some(
        (item) => item.dayIndex === day && item.kind === "rest",
      )
    )
      continue;

    const id = `rest-${day}`;

    moves.push({
      kind: "insertRest",
      itemId: id,
      // No day named here. The optimizer is pure and has no calendar: a raw index is the
      // model's own counting, and `day 0` is the student's first day, not their zeroth. The
      // sheet that shows this names the day through `domain/calendar`, which is the one place
      // allowed to.
      description: "Added a rest block",
      apply: (s) => ({
        ...s,
        items: [
          ...s.items,
          {
            id,
            title: "Rest",
            type: "mental",
            kind: "rest",
            hours: REST_HOURS,
            intensity: 1,
            dayIndex: day,
            // Computed inside `apply` rather than at generation, deliberately. The
            // neighbourhood size is unchanged -- still one insertion per day (Ruling 17) -- and a
            // move's effect stays a function of the schedule it is applied to, which is what
            // makes `smallestFixes` able to measure `apply(s)` against a schedule that may
            // have moved on since the move was generated.
            startHour:
              hourNear(s, day, REST_HOURS, REST_START_HOUR) ?? REST_START_HOUR,
            fixed: true,
            deadlineDay: null,
            protectedRest: true,
          },
        ],
      }),
    });
  }

  return moves;
}

/**
 * §5.2: "Social low prescribes a person."
 *
 * The counterpart to rest insertion, and the model makes it necessary rather than nice:
 * social reserve drains from isolation (§1.2) and is refilled only by contact, so without
 * this move the solver can watch a student's social reserve fall to zero across the whole
 * horizon with nothing in its vocabulary to do about it. Rest insertion cannot substitute
 * -- that is precisely the "prescribe an early night for loneliness" answer §5.2 rules out.
 *
 * Left movable rather than protected: seeing people is an offer, not an obligation, and
 * §1.3's gamification rule is explicit that the app must not manufacture obligations.
 */
function socialMoves(schedule: Schedule, today: number): Move[] {
  const moves: Move[] = [];

  // From today, for `restMoves`' reason above.
  for (let day = today; day < schedule.horizonDays; day += 1) {
    /**
     * One social item a day, a count rather than a sum -- see `restMoves` above for why this
     * stayed a count after being tried the other way.
     *
     * The mismatch is real and worth naming: the engine charges `isolationDrainPerDay` on any
     * day under `socialFloorHoursPerDay`, half an hour, so a fifteen-minute coffee satisfies
     * this guard while the day goes on draining. Measuring hours here is the consistent
     * change and it widens the search past the budget `neglect.test.ts` guards, on the exact
     * fixture -- a fortnight of undated work -- that test exists to protect.
     */
    if (
      schedule.items.some(
        (item) => item.dayIndex === day && item.type === "social",
      )
    )
      continue;

    const id = `social-${day}`;

    moves.push({
      kind: "insertSocial",
      itemId: id,
      description: "Made time to see someone",
      apply: (s) => ({
        ...s,
        items: [
          ...s.items,
          {
            id,
            title: "Seeing someone",
            type: "social",
            kind: "socialRestorative",
            hours: SOCIAL_HOURS,
            intensity: 1,
            dayIndex: day,
            startHour:
              hourNear(s, day, SOCIAL_HOURS, SOCIAL_START_HOUR) ??
              SOCIAL_START_HOUR,
            fixed: false,
            deadlineDay: null,
            protectedRest: false,
          },
        ],
      }),
    });
  }

  return moves;
}

/**
 * §6.6: sequencing is a lever.
 *
 * Even when the days are fixed, the order within a day is usually free -- and because
 * carryover means a hard session before deep study costs more than the reverse, moving a
 * block after another can improve a week without moving anything off its day. This is
 * what partly answers the degrees-of-freedom problem in §2.5, since no timetable takes
 * ordering away.
 */
function reorderMoves(schedule: Schedule, today: number): Move[] {
  const moves: Move[] = [];

  for (const item of schedule.items.filter((entry) =>
    isMovable(entry, today),
  )) {
    const sameDay = schedule.items.filter(
      (other) => other.dayIndex === item.dayIndex && other.id !== item.id,
    );

    for (const other of sameDay) {
      const startHour = other.startHour + other.hours;
      if (startHour === item.startHour) continue;
      // The day's edge, for the reason given on `batchErrands` above.
      if (startHour + item.hours > DAY_END_HOUR) continue;

      moves.push({
        kind: "reorderWithinDay",
        itemId: item.id,
        description: `Moved ${item.title} to after ${other.title}`,
        apply: (s) => replace(s, item.id, { ...item, startHour }),
      });
    }
  }

  return moves;
}

/**
 * §2.1's four neighbour kinds.
 *
 * Candidates are filtered here rather than scored badly, so the search cannot walk
 * through an illegal schedule on its way somewhere better.
 *
 * The filter is "no worse than where we started" rather than "valid", and the difference
 * matters. From a valid schedule the two are identical: the baseline is zero violations,
 * so only valid neighbours survive, and every hard constraint still holds absolutely.
 *
 * From an *invalid* one they diverge completely. Real schedules arrive broken -- a
 * student accepts a clashing commitment, or an OCR import (§1.4) drops a class on top of
 * existing work -- and with two independent clashes no single move can reach validity,
 * so a strict validity filter rejects every candidate. The optimizer would then return
 * nothing and the app would tell an over-committed student that their week is already
 * the best arrangement of their commitments. That is the worst available answer for
 * precisely the person the app exists to help, and it is what this filter prevents:
 * the search can now walk a broken week back toward a legal one, one clash at a time.
 */
export interface Candidate {
  readonly move: Move;
  /** The schedule the move produces. Carried rather than recomputed: generating it is
   *  how the move was validated in the first place, and the search would otherwise
   *  rebuild every candidate a second time to score it -- a full copy of the item list,
   *  for every candidate, on every iteration. */
  readonly result: Schedule;
}

/**
 * @param today the day the student is on. Required rather than defaulted, because a default
 * of zero is precisely the bug this parameter exists to end: every caller that forgot it
 * would compile, look reasonable, and go on proposing changes to days already lived.
 */
export function candidates(
  schedule: Schedule,
  params: EngineParams,
  today: number,
): Candidate[] {
  const baseline = violations(schedule, params).length;

  const out: Candidate[] = [];
  for (const move of [
    ...shiftMoves(schedule, params, today),
    ...batchMoves(schedule, today),
    ...restMoves(schedule, today),
    ...socialMoves(schedule, today),
    ...reorderMoves(schedule, today),
  ]) {
    const result = move.apply(schedule);
    if (violations(result, params).length <= baseline)
      out.push({ move, result });
  }

  return out;
}

export function neighbours(
  schedule: Schedule,
  params: EngineParams,
  today: number,
): Move[] {
  return candidates(schedule, params, today).map((candidate) => candidate.move);
}
