import { DAY_END_HOUR } from "./gaps";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "../engine";
import { isValid, overlaps, violations } from "./constraints";
import { neighbours } from "./neighbours";
import { errandItem, makeSchedule, restItem, studyItem } from "./testSupport";

describe("neighbours", () => {
  /**
   * A move may never put two blocks on top of each other.
   *
   * `shiftMoves` changed the day and kept the hour, so a 14:00 block shifted onto a day that
   * already had a 14:00 block produced a double-booking. `violations` tolerates that on
   * purpose -- neither block is pinned, so the search can still separate them, and rejecting
   * the state outright would cut off legal paths through a week that arrived broken. But
   * tolerating a state the search may pass through is not the same as offering it to a
   * student as a change to approve: "Moved Laundry 1 day later" put laundry on top of the
   * gym, and the calendar said so.
   */
  /**
   * The block's own hour is the first thing tried, because it is the strongest evidence in
   * the schedule about when this particular thing happens.
   *
   * `shiftMoves` asked `slotFinder.preferredHour` where a *kind* of work belongs and used that instead,
   * which reads a habit the student may not have and overrides one they demonstrably do. It
   * has an answer only for rest, social, study and errands; everything else -- exercise
   * included -- fell through to `WAKE_HOUR`. So a gym session at 18:00 on three days out of
   * five, moved onto one of the empty ones, landed at 08:00: the app ignoring an unambiguous
   * evening pattern to propose a breakfast-time workout.
   */
  it("keeps a shifted block at its own hour when that hour is free", () => {
    const gym = (id: string, day: number) => ({
      ...studyItem(id, day, 1),
      type: "physical" as const,
      kind: "hardExercise" as const,
      startHour: 18,
    });
    const schedule = makeSchedule([
      gym("gym-a", 0),
      gym("gym-b", 2),
      gym("gym-c", 4),
    ]);

    const shifted = neighbours(schedule, DEFAULT_PARAMS, 0)
      .filter((move) => move.itemId === "gym-a" && move.kind === "shiftDay")
      .map((move) =>
        move.apply(schedule).items.find((item) => item.id === "gym-a"),
      )
      .find((item) => item?.dayIndex === 1);

    expect(shifted?.startHour).toBe(18);
  });

  /**
   * ...unless keeping it there costs the week something, which is a question only the
   * objective can answer.
   *
   * Its own hour and "the nearest opening to it" are both preferences, and a preference that
   * outranks the model is how the solver ends up proposing a change that makes the fortnight
   * worse. §6.6 makes the cost real and local: a hard session immediately before deep study
   * leaves a residue on mental capacity that the same session after it does not. Measured on
   * this fixture, 08:00 scores 23.06 against 25.99 for the afternoon -- nearly three points,
   * which is more than a deficit day.
   *
   * Deliberately built on depleted reserves. At full reserve both placements clamp to 100 and
   * score identically, so a fixture starting there would pass whatever the code did.
   */
  it("gives up its own hour when a nearby one leaves the week better", () => {
    const deep = {
      ...studyItem("deep", 1, 4),
      startHour: 10,
      intensity: 1.4,
      fixed: true,
    };
    const gym = {
      ...studyItem("gym", 0, 2),
      type: "physical" as const,
      kind: "hardExercise" as const,
      intensity: 1.6,
      startHour: 8,
    };
    const schedule = {
      ...makeSchedule([deep, gym], 6),
      start: { mental: 30, physical: 30, social: 60, errands: 60 },
    };

    const shifted = neighbours(schedule, DEFAULT_PARAMS, 0)
      .filter((move) => move.itemId === "gym" && move.kind === "shiftDay")
      .map((move) =>
        move.apply(schedule).items.find((item) => item.id === "gym"),
      )
      .find((item) => item?.dayIndex === 1);

    // 08:00 is free and is the block's own hour -- and it sits immediately before the study
    // block, which is what makes it the wrong answer here.
    expect(shifted?.startHour).toBe(14);
  });

  /**
   * The errand case this rule replaced, kept as a test because the behaviour changed rather
   * than went away.
   *
   * A 17:00 errand shifted onto a day with a 09:00 errand used to land at 10:00, batched into
   * one trip by `slotFinder.preferredHour`. It now stays at 17:00: the student does this at 17:00, the
   * model scores the two placements identically, and where the model is indifferent the
   * student's own hour wins. Batching is still reachable -- `batchMoves` offers it as its own
   * candidate -- it is no longer imposed on a shift that was not asked to batch anything.
   */
  it("keeps a shifted errand at its own hour rather than batching it for free", () => {
    const schedule = makeSchedule([
      { ...errandItem("laundry", 0, 17), hours: 1 },
      { ...errandItem("post", 1, 9), hours: 1 },
    ]);

    const shifted = neighbours(schedule, DEFAULT_PARAMS, 0)
      .filter((move) => move.itemId === "laundry" && move.kind === "shiftDay")
      .map((move) =>
        move.apply(schedule).items.find((item) => item.id === "laundry"),
      )
      .find((item) => item?.dayIndex === 1);

    expect(shifted?.startHour).toBe(17);
  });

  it("never offers a move that lands a block on top of another", () => {
    const schedule = makeSchedule([
      { ...studyItem("a", 2, 2), startHour: 14 },
      { ...studyItem("b", 3, 2), startHour: 14 },
      { ...errandItem("c", 3, 16), hours: 2 },
    ]);

    for (const move of neighbours(schedule, DEFAULT_PARAMS, 0)) {
      const after = move.apply(schedule).items;

      for (let i = 0; i < after.length; i += 1) {
        for (let j = i + 1; j < after.length; j += 1) {
          const left = after[i] as (typeof after)[number];
          const right = after[j] as (typeof after)[number];
          if (left.dayIndex !== right.dayIndex) continue;

          expect({
            move: move.description,
            overlap: overlaps(left, right),
          }).toEqual({
            move: move.description,
            overlap: false,
          });
        }
      }
    }
  });

  /**
   * The past is not a neighbourhood.
   *
   * This module had no notion of `today` at all: `restMoves` and `socialMoves` looped from
   * day 0, and `shiftMoves` bounded its destination only by the horizon. So the cheapest
   * improvement available to the hill climber was always to insert recovery into days that
   * had already happened -- the engine re-projects from day 0, so retroactive rest lifts the
   * whole fortnight including the trough `worstFloor` reads.
   *
   * Measured on a real account with today at day 7: all five blocks the solver added landed
   * in the past, and the reported gain was "your worst day goes from 29 to 62" where leaving
   * the past alone gave 29 to 30. Thirty-two of the thirty-three points were fiction, and
   * three of the four social blocks it proposed were on days the student could not act on.
   */
  it("never offers a move that touches a day already behind the student", () => {
    const schedule = makeSchedule([
      studyItem("a", 3, 2),
      errandItem("b", 1, 8),
    ]);
    const today = 5;
    const past = (week: typeof schedule) =>
      JSON.stringify(week.items.filter((item) => item.dayIndex < today));

    const before = past(schedule);

    for (const move of neighbours(schedule, DEFAULT_PARAMS, today)) {
      // The past may not gain a block, lose one, or have one rearranged within it. A block
      // that was already there stays exactly as it was -- it happened that way.
      expect(past(move.apply(schedule))).toBe(before);
    }
  });

  /** A block already in the past stays exactly where it is: it happened there. */
  it("never offers to move a block out of the past", () => {
    const schedule = makeSchedule([studyItem("done", 3, 1)]);

    expect(
      neighbours(schedule, DEFAULT_PARAMS, 5).some((m) => m.itemId === "done"),
    ).toBe(false);
  });

  it("offers to move a movable task to another day", () => {
    const moves = neighbours(
      makeSchedule([studyItem("a", 3, 2)]),
      DEFAULT_PARAMS,
      0,
    );

    expect(moves.some((m) => m.kind === "shiftDay" && m.itemId === "a")).toBe(
      true,
    );
  });

  it("never offers to move a fixed block", () => {
    const lecture = { ...studyItem("lecture", 3, 2), fixed: true };
    const moves = neighbours(makeSchedule([lecture]), DEFAULT_PARAMS, 0);

    expect(moves.some((m) => m.itemId === "lecture")).toBe(false);
  });

  // §2.1 and §5.1. If the search can reach a state where rest has moved, protected rest
  // is not protected -- so this is checked at generation, not only at validation.
  it("never offers to move protected rest", () => {
    const moves = neighbours(
      makeSchedule([restItem("rest", 3, 20)]),
      DEFAULT_PARAMS,
      0,
    );

    expect(moves.some((m) => m.itemId === "rest")).toBe(false);
  });

  it("never offers to move a task past its deadline", () => {
    const due = { ...studyItem("due", 2, 2), deadlineDay: 2 };
    const schedule = makeSchedule([due]);

    for (const move of neighbours(schedule, DEFAULT_PARAMS, 0).filter(
      (m) => m.kind === "shiftDay",
    )) {
      expect(move.apply(schedule).items[0]!.dayIndex).toBeLessThanOrEqual(2);
    }
  });

  it("never offers to move a task off the start of the horizon", () => {
    const schedule = makeSchedule([studyItem("a", 0, 2)]);

    for (const move of neighbours(schedule, DEFAULT_PARAMS, 0).filter(
      (m) => m.kind === "shiftDay",
    )) {
      expect(move.apply(schedule).items[0]!.dayIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it("offers to batch two errands onto the same day", () => {
    const moves = neighbours(
      makeSchedule([errandItem("e1", 1, 9), errandItem("e2", 4, 14)]),
      DEFAULT_PARAMS,
      0,
    );

    expect(moves.some((m) => m.kind === "batchErrands")).toBe(true);
  });

  /**
   * A move that ends after the day does not end anywhere.
   *
   * `batchErrands` and `reorderWithinDay` both place a block immediately after another one,
   * which is the point of them -- so neither can go through `hourNear`, which finds whichever
   * gap fits. What they were missing is the day's own edge: `startHour + hours` was unbounded,
   * and `constraints.violations` checks deadlines, overlaps and the daily cap but never that.
   * So a batch onto a late target produced a valid-looking candidate starting at 25, which
   * `drain` and `carryover` then charged to today.
   */
  it("does not offer a move that would start after the day has ended", () => {
    // Two movable errands on DIFFERENT days, which is what `batchErrands` needs, with the
    // target late enough that batching onto it would land past midnight. `errandItem`'s
    // third argument is the start hour and each is an hour long, so 23:00 + 1h leaves the
    // next one starting at 24:00.
    const week = makeSchedule([
      errandItem("late", 2, 23),
      errandItem("other", 5, 9),
    ]);
    const moves = neighbours(week, DEFAULT_PARAMS, 0);

    expect(moves.length).toBeGreaterThan(0);

    for (const move of moves) {
      for (const item of move.apply(week).items) {
        expect(item.startHour + item.hours).toBeLessThanOrEqual(DAY_END_HOUR);
      }
    }
  });

  it("offers to insert a rest block", () => {
    const moves = neighbours(
      makeSchedule([studyItem("a", 1, 2)]),
      DEFAULT_PARAMS,
      0,
    );

    expect(moves.some((m) => m.kind === "insertRest")).toBe(true);
  });

  it("does not offer a second rest block on a day that already has one", () => {
    const moves = neighbours(
      makeSchedule([restItem("rest", 3, 20)]),
      DEFAULT_PARAMS,
      0,
    );
    const onDayThree = moves.filter(
      (m) => m.kind === "insertRest" && m.itemId === "rest-3",
    );

    expect(onDayThree).toHaveLength(0);
  });

  // §6.6: even when the days are fixed, the order within a day is usually free -- which
  // is what partly answers §2.5's degrees-of-freedom problem, since no timetable takes
  // sequencing away.
  it("offers to reorder two items within the same day", () => {
    const gym = {
      ...studyItem("gym", 1, 1),
      type: "physical" as const,
      kind: "hardExercise" as const,
      startHour: 17,
    };
    const study = { ...studyItem("study", 1, 2), startHour: 19 };
    const moves = neighbours(makeSchedule([gym, study]), DEFAULT_PARAMS, 0);

    expect(moves.some((m) => m.kind === "reorderWithinDay")).toBe(true);
  });

  // Filtering at generation rather than scoring badly is what stops the search walking
  // through an illegal schedule on its way somewhere better.
  it("only ever offers moves that leave the schedule valid", () => {
    const schedule = makeSchedule([
      studyItem("a", 1, 2),
      studyItem("b", 3, 2),
      errandItem("e", 2, 15),
      restItem("rest", 4, 20),
    ]);

    for (const move of neighbours(schedule, DEFAULT_PARAMS, 0)) {
      expect(isValid(move.apply(schedule), DEFAULT_PARAMS)).toBe(true);
    }
  });

  // A schedule can arrive already broken -- a student adds a clashing commitment, or an
  // OCR import (§1.4) drops a class on top of existing work. Filtering candidates on
  // "is the result valid" rejects every move in that state, because the pre-existing
  // violation survives all of them. The app would then tell an over-committed student
  // that their week is already the best arrangement, which is the worst possible answer
  // for exactly the person it exists to help.
  /**
   * Two *independent* clashes, on different days. One move can clear at most one of
   * them, so no single neighbour reaches a fully valid schedule -- which is the case
   * that breaks a validity filter, and the case a single clash does not reproduce.
   */
  const doublyBroken = () =>
    makeSchedule([
      { ...studyItem("lecture-a", 1, 2), fixed: true, startHour: 9 },
      { ...studyItem("clash-a", 1, 2), startHour: 10 },
      { ...studyItem("lecture-b", 8, 2), fixed: true, startHour: 9 },
      { ...studyItem("clash-b", 8, 2), startHour: 10 },
    ]);

  it("still offers moves when the schedule arrives already invalid", () => {
    const broken = doublyBroken();

    expect(isValid(broken, DEFAULT_PARAMS)).toBe(false);
    expect(violations(broken, DEFAULT_PARAMS)).toHaveLength(2);
    expect(neighbours(broken, DEFAULT_PARAMS, 0).length).toBeGreaterThan(0);
  });

  it("offers moves that reduce the damage even when none can fully repair it", () => {
    const broken = doublyBroken();
    const before = violations(broken, DEFAULT_PARAMS).length;

    const improving = neighbours(broken, DEFAULT_PARAMS, 0).filter(
      (move) => violations(move.apply(broken), DEFAULT_PARAMS).length < before,
    );

    expect(improving.length).toBeGreaterThan(0);
  });

  it("never offers a move that makes a broken schedule worse", () => {
    const broken = doublyBroken();
    const before = violations(broken, DEFAULT_PARAMS).length;

    for (const move of neighbours(broken, DEFAULT_PARAMS, 0)) {
      expect(
        violations(move.apply(broken), DEFAULT_PARAMS).length,
      ).toBeLessThanOrEqual(before);
    }
  });

  it("does not mutate the schedule it is given", () => {
    const schedule = makeSchedule([studyItem("a", 3, 2)]);
    const before = JSON.stringify(schedule);

    for (const move of neighbours(schedule, DEFAULT_PARAMS, 0))
      move.apply(schedule);

    expect(JSON.stringify(schedule)).toBe(before);
  });

  // Nothing to move or reorder, so the only things on offer are the two the solver can
  // add from nothing: rest, and time with other people.
  it("offers only the things it can add on an empty schedule", () => {
    const moves = neighbours(makeSchedule([]), DEFAULT_PARAMS, 0);

    expect(moves.length).toBeGreaterThan(0);
    expect(
      moves.every((m) => m.kind === "insertRest" || m.kind === "insertSocial"),
    ).toBe(true);
  });

  it("describes every move in plain language", () => {
    for (const move of neighbours(
      makeSchedule([studyItem("a", 3, 2)]),
      DEFAULT_PARAMS,
      0,
    )) {
      expect(move.description.length).toBeGreaterThan(0);
      expect(move.description).not.toMatch(/optimis|optimiz/i);
    }
  });
});

/**
 * §13/Ruling 14: the solver's two remaining hardcoded hours.
 *
 * `REST_START_HOUR` and `SOCIAL_START_HOUR` placed every inserted block at 20:00 and 18:00
 * whatever was already there. For rest that was merely wasteful -- inserted rest is
 * `protectedRest`, so an overlap is a constraint violation and the candidate was thrown
 * away, meaning the solver simply could not offer rest to anyone whose evening was busy.
 * For social it was worse: inserted social is movable, and movable-movable overlap is
 * deliberately not a violation, so it landed silently on top of existing work.
 *
 * The hours survive as preferences. A block still goes where that kind of block belongs
 * when the day allows it.
 */
describe("neighbours placing what it inserts", () => {
  const evening = (
    id: string,
    day: number,
    startHour: number,
    hours: number,
  ) => ({
    ...studyItem(id, day, 2),
    startHour,
    hours,
  });

  const insertedRestOn = (
    schedule: Parameters<typeof neighbours>[0],
    day: number,
  ) => {
    const move = neighbours(schedule, DEFAULT_PARAMS, 0).find(
      (m) => m.kind === "insertRest" && m.itemId === `rest-${day}`,
    );

    return move === undefined
      ? null
      : (move.apply(schedule).items.find((item) => item.id === `rest-${day}`) ??
          null);
  };

  it("still prefers the evening when the evening is free", () => {
    const rest = insertedRestOn(makeSchedule([studyItem("a", 3, 2)]), 3);

    expect(rest?.startHour).toBe(20);
  });

  /** The case the constant could not survive: an evening already spoken for. */
  it("finds another hour when the evening is taken", () => {
    const busyEvening = makeSchedule([evening("a", 3, 19, 5)]);

    const rest = insertedRestOn(busyEvening, 3);

    expect(rest).not.toBeNull();
    expect(rest?.startHour).toBeLessThan(19);
    expect(rest?.startHour).toBeGreaterThanOrEqual(8);
  });

  /**
   * The reason this mattered for rest specifically: inserted rest is `protectedRest`, so an
   * overlapping candidate is a violation and gets discarded -- the solver was unable to
   * suggest rest at all to the students who most needed it.
   */
  it("produces a rest insertion that does not violate the week it lands in", () => {
    const busyEvening = makeSchedule([evening("a", 3, 19, 5)]);
    const move = neighbours(busyEvening, DEFAULT_PARAMS, 0).find(
      (m) => m.kind === "insertRest" && m.itemId === "rest-3",
    );

    expect(move).toBeDefined();
    expect(violations(move!.apply(busyEvening), DEFAULT_PARAMS)).toEqual(
      violations(busyEvening, DEFAULT_PARAMS),
    );
  });

  /** Ruling 17: one candidate per insertion. A finder that returned a list here would multiply the
   *  neighbourhood, and the search is already at four thousand evaluations on the crunch
   *  fixture. */
  it("still offers exactly one rest insertion per day", () => {
    const moves = neighbours(
      makeSchedule([studyItem("a", 3, 2)]),
      DEFAULT_PARAMS,
      0,
    );
    const onDayThree = moves.filter(
      (m) => m.kind === "insertRest" && m.itemId === "rest-3",
    );

    expect(onDayThree).toHaveLength(1);
  });

  it("places inserted social away from what is already on the day", () => {
    const busyEvening = makeSchedule([evening("a", 3, 17, 6)]);
    const move = neighbours(busyEvening, DEFAULT_PARAMS, 0).find(
      (m) => m.kind === "insertSocial" && m.itemId === "social-3",
    );

    const social = move
      ?.apply(busyEvening)
      .items.find((item) => item.id === "social-3");

    expect(social).toBeDefined();
    // Movable-movable overlap is legal, so nothing would have complained. It still must not
    // be dropped on top of the student's evening.
    expect(social!.startHour + social!.hours).toBeLessThanOrEqual(17);
  });
});
