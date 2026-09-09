# Micro-Start and Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** §4.1's Micro-Start with both triggers, and §8.1's falsifiable claim — predict tomorrow's energy, score it, and publish the error. The last two must-build items in §11.

**Architecture:** `microStart.ts` turns a stuck task into one concrete first action under ten minutes, with a rule-based generator and an optional model path behind the endpoint that already exists. `predictions.ts` records a 24–48h energy prediction, resolves it against what the student reported, and reports mean absolute error. Both persist in `StoredSettings` alongside the calibration profile — no migration.

**Tech Stack:** React 19, TypeScript 7 (strict, `noUncheckedIndexedAccess`), Tailwind 4, Vitest 4 + Testing Library, Playwright.

**Spec:** [`burnout-app-spec-v3.md`](../../../burnout-app-spec-v3.md) §4 (all of it), §8 (all of it), §11's must-build tier.

**Base:** `main` at `ca3433a`.

## Global Constraints

- **One action, never a list** (§4.1, same reason as §5.2). A stuck person cannot choose from
  a menu. The generator returns one thing or nothing.
- **Under ten minutes** (§4.1). A time box a stuck person will believe.
- **Zero friction on the manual trigger** (§4.1): a "can't start this" control on every task,
  with **no explanation asked for**. Asking why somebody is stuck is another thing to be
  stuck on.
- **§8.2 must be said in the product copy, not only the pitch.** The 21-day projection is
  never described as validated. It is a decision aid, and the app has to say so where a
  student reads it — not in a slide.
- **Never claim an accuracy that has not been measured.** Mean absolute error over zero
  resolved predictions is not zero, it is unknown, and the screen must say so.
- **`src/engine/**` and `src/optimizer/**` logic must not change.**
- **No migration**: both records live in `StoredSettings`. Old settings keep loading, tested.
- **TDD, red before green.** Coverage thresholds only go up (97 / 91 / 97 / 98).
- **Responsive at 320 / 390 / 768 / 1280px.**
- **Commit format:** `<type>: <description>`, ending `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

### Fixed values

| Constant | Value | Rationale |
|---|---|---|
| `MICRO_START_MINUTES` | `8` | §4.1's own example: "open the document and write the title. Eight minutes." |
| `STUCK_AFTER_MISSES` | `2` | §4.1: "two scheduled slots missed". |
| `STUCK_AFTER_DAYS` | `3` | §4.1: "or three days past first appearance". |
| `PREDICTION_HORIZON_DAYS` | `2` | §8.1: 24 to 48 hours out. |

---

## Task 1: One first action, small enough to start

**Files:** `src/domain/microStart.ts`, `src/domain/microStart.test.ts`

**Produces:**
- `interface MicroStart { readonly itemId: string; readonly action: string; readonly minutes: number }`
- `function firstAction(item: ScheduledItem): MicroStart`
- `function isStuck(item, confirmations, profile): boolean`

**Key decisions:**

- §4.1 is about *permission at task level*: "you don't have to write the essay, you have to
  open the document and write the title". The action must be the smallest visible move, not a
  smaller version of the whole task. "Outline the essay" is still the essay.
- **One action, never a list**, for §5.2's reason — a stuck person cannot choose.
- The rules are keyed on what kind of work it is, because the first move differs: writing
  opens a document, reading opens to a page, an errand finds the one detail it needs.
- §4.1's model effect is worth recording in a comment even though it is not built: a stuck
  task accrues mental drain without progress, so paralysis shows as rising mental load with
  flat completion. That divergence is itself detectable and is what the automatic trigger
  approximates here with misses.

**Tests:** every load type gets an action; the action is short and concrete; it is never a
list; the time box is under ten minutes; the action is not just the task title reworded; a
task confirmed as not happening twice reads as stuck; once is not; a task three days old
reads as stuck; a fresh one does not; a completed task is never stuck.

---

## Task 2: The falsifiable claim

**Files:** `src/domain/predictions.ts`, `src/domain/predictions.test.ts`

**Produces:**
- `interface EnergyPrediction { readonly forDay: number; readonly predicted: number; readonly reported: number | null }`
- `function predictEnergy(schedule, params, forDay): number`
- `function resolvePrediction(predictions, forDay, reported): EnergyPrediction[]`
- `function meanAbsoluteError(predictions): number | null`
- `function accuracyLine(predictions): string`

**Key decisions:**

- §8.1: predictions 24–48 hours out **resolve regardless of whether the user intervenes**,
  which the 21-day projection does not. That is the whole reason this is the falsifiable
  claim and the long projection is not.
- **`meanAbsoluteError` returns null with nothing resolved**, and `accuracyLine` says so in
  words. Zero resolved predictions is not zero error, it is no measurement, and reporting
  0.0 would be a lie that flatters the app.
- §8.2 goes in `accuracyLine`'s neighbouring copy: the 21-day projection is a decision aid
  and is never described as validated. **In the product copy, not only the pitch.**
- Predictions are made from the same projection the rest of the app runs on. A separate
  predictor would be measuring something the student never saw.

**Tests:** a prediction is produced for a real day; it is in the reserve range; resolving
attaches what was reported; resolving an unknown day changes nothing; mean absolute error is
null with nothing resolved and a number once resolved; the error is the mean of absolute
differences, not signed; a perfect prediction gives zero; the accuracy line says "not enough
data" rather than claiming zero; the line names the error once there is one; predictions
already resolved are not resolved twice.

---

## Task 3: The screens

**Files:** `src/ui/microStart/MicroStartCard.tsx` + test, `src/ui/validation/AccuracyNote.tsx` + test

`MicroStartCard`: shows the one action and its time box, with a "start it" and a "not this".
Also carries the **manual trigger** — §4.1's "can't start this" — which asks for no
explanation.

`AccuracyNote`: §8.1's published number, and §8.2's disclaimer beside it. Tests assert the
disclaimer is present in the UI, not only in a document: that is §8.2's actual requirement.

---

## Task 4: Wiring

The room's clutter panel gains "I can't start this" (§4.1's manual trigger, zero friction).
The home screen surfaces a Micro-Start when a task reads as stuck, and shows the accuracy
note. A daily energy report feeds `resolvePrediction`.

**Tests:** the manual trigger appears on a task; using it produces one action; a stuck task
surfaces one automatically; the accuracy note is visible and carries §8.2's disclaimer.

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| §4.1 permission at task level, one concrete first action | 1 |
| §4.1 time box under ten minutes | 1 |
| §4.1 automatic trigger (missed slots / days old) | 1 |
| §4.1 manual "can't start this", no explanation asked | 3, 4 |
| §4.1 one action, never a list | 1 |
| §8.1 predict 24–48h energy, score it, publish MAE | 2, 3 |
| §8.2 not validated, said in product copy | 3 — asserted in the UI test |
| §4.1 learning which micro-starts worked | **Not built.** Needs weeks of data; §11 files "Micro-Start effectiveness learning" under "if time allows". |
| §8.3 ignored warnings as a control arm | **Not built.** §11 does not list it in must-build; it is a semester-long data collection with no UI. |

**Two risks recorded:**

1. **There is still no clock.** "Three days past first appearance" is measured in day
   indices, like everything else in this app. A real calendar is its own change.
2. **Energy is self-reported and the app has no place to report it yet** beyond the block
   confirmation. `resolvePrediction` takes a reported figure; wiring a daily energy check-in
   is §7.8, which is not in the must-build tier. Until then predictions accumulate unresolved
   and the accuracy line honestly says there is not enough data — which is the correct
   behaviour, and the PR must say so rather than implying the loop is closed.
