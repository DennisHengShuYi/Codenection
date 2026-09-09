# Calibration and Reality Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** §7's calibration — mode picker, three-day painter, parameter extraction, post-block confirmation, and the "how you work" screen — plus §2.4's Reality Check, which depends on it entirely.

**Architecture:** A `CalibrationProfile` lives inside `StoredSettings`, which both adapters already persist as one JSON blob, so there is no migration and no adapter change. The painter produces a grid; `extractParameters` derives priors from it; block confirmations accumulate planned-vs-actual, and Reality Check turns that into a per-type padding multiplier. The "how you work" screen is the payoff that makes all of it feel like a benefit.

**Tech Stack:** React 19, TypeScript 7 (strict, `noUncheckedIndexedAccess`), Tailwind 4, Vitest 4 + Testing Library, Playwright. No model, no key, no network.

**Spec:** [`burnout-app-spec-v3.md`](../../../burnout-app-spec-v3.md) §7 (all of it), §2.4, §11's must-build tier. Read all three.

**Base:** `main` at `c418d14`.

## The design constraint that governs everything here

§7's opening line: **never ask the user to enter, only to correct.** Editing something wrong
is roughly five times faster than building from nothing, and psychologically a different
task. Every screen in this plan shows a filled-in answer and invites a correction. None asks
an empty question.

The second: **§7.5 asks relative, not absolute.** Not "how many hours can you focus" but
"how long before you drift" with buckets. And estimate bias (§2.4) is *never asked for* — it
emerges from confirmations, and the student need not know the parameter exists.

## Global Constraints

- **No cold start** (§7.7). Population defaults produce a working app on first open.
  Calibration is progress, never a gate — nothing may block the room behind it.
- **Never punish a miss** (§7.9). "No" is a neutral answer that feeds the model, not a
  failure the app comments on. A student who did not do the thing is exactly the one whose
  data is most needed.
- **Calibration lives in `StoredSettings`**, which both adapters persist as one blob. No
  migration, no adapter change. Old settings must keep loading — tested.
- **`src/engine/**` and `src/optimizer/**` logic must not change.** Calibration produces
  values the UI reads; wiring extracted parameters into `EngineParams` is a later change and
  is deliberately out of scope (see "Not built").
- **Responsive at 320 / 390 / 768 / 1280px.** The painter is a 3×24 grid and is the hardest
  thing in the app to keep narrow.
- **Immutability**; files 200–400 lines; functions under 50 lines.
- **TDD, red before green.**
- **Coverage thresholds only go up.** Currently 97 / 91 / 97 / 98.
- **Commit format:** `<type>: <description>`, ending `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

## File Structure

```
src/
  domain/
    calibration.ts        the profile, its defaults, and the calibration meter
    calibration.test.ts
    painter.ts            the three-day grid and what it extracts
    painter.test.ts
    realityCheck.ts       planned vs actual -> a padding multiplier per type
    realityCheck.test.ts
  data/
    types.ts              MODIFY: StoredSettings gains the profile
  ui/calibration/
    ModePicker.tsx        §7.1
    ModePicker.test.tsx
    Painter.tsx           §7.2
    Painter.test.tsx
    HowYouWork.tsx        §7.6
    HowYouWork.test.tsx
    BlockConfirm.tsx      §7.9
    BlockConfirm.test.tsx
  ui/
    HomeScreen.tsx        MODIFY: entry point + the confirmation prompt
    HomeScreen.calibration.test.tsx
tests/e2e/
  calibration.spec.ts
```

---

## Task 1: The profile, and no cold start

**Produces:**
- `type Mode = 'studying' | 'working' | 'both' | 'between'`
- `type FocusBucket = 'under30' | 'about1h' | 'couple' | 'longer'`
- `interface CalibrationProfile { mode, semesterBreak, focus, sleepBaselineHours, peakStartHour, confirmations, calibratedDays }`
- `const DEFAULT_PROFILE: CalibrationProfile`
- `function calibrationProgress(profile): number` — 0..1, the §7.7 meter
- `function focusMinutes(bucket): number`

**Key decisions to encode in comments:**

- §7.7: the defaults are a *working app*, not a placeholder. Nothing is gated behind
  calibration, and the meter reads as progress rather than as an unfinished form.
- §7.1: semester break is a **toggle on top of mode**, not a fifth mode. In low-structure
  states the optimizer switches from flattening peaks to defending a floor — noted even
  though wiring it into the optimizer is out of scope here.
- §7.5: focus is a bucket, never a number typed in.

**Tests:** defaults produce a usable profile; the meter is 0 at defaults and rises as things
are set; the meter never exceeds 1; each bucket maps to a plausible minute count and the
ordering is monotonic; semester break is independent of mode.

---

## Task 2: The three-day painter

**Produces:**
- `type Cell = 'free' | 'study' | 'work' | 'errands' | 'rest' | 'social' | 'sleep'`
- `const CELL_CYCLE: readonly Cell[]`
- `type PainterGrid = readonly (readonly Cell[])[]` — 3 days × 24 hours
- `function emptyGrid(): PainterGrid`
- `function cycleCell(grid, day, hour): PainterGrid`
- `function extractParameters(grid): { maxFocusRunHours, sleepBaselineHours, peakStartHour, loadShape }`

**§7.3's table is the contract:**

| Parameter | Derived from |
|---|---|
| Max focus run | Longest unbroken study block |
| Baseline sleep | Mean of sleep blocks |
| Peak hours | When study blocks cluster |
| Current load shape | The whole grid |

**Key decisions:**

- Three days, not seven: §7.2 says recall collapses past 48 hours and **fiction calibrated
  into the model is worse than no data**. That sentence is the reason the grid is small, and
  it belongs in the code.
- The cycle order is §7.2's, verbatim: free → study → work → errands → rest → social → sleep,
  wrapping back to free.
- `extractParameters` must be honest about an empty grid: no study blocks means no focus run
  and no peak hour, and it must say so with nulls rather than inventing a default that looks
  measured.

**Tests:** cycling advances and wraps; cycling is immutable; the longest *unbroken* run is
found, not the total; a run split across a gap is not merged; sleep baseline is the mean of
sleep hours per day rather than the total; peak hour is where study clusters; an empty grid
extracts nulls rather than fabricated numbers; a grid of only sleep extracts a sleep baseline
and nothing else.

---

## Task 3: Reality Check

**Produces:**
- `interface BlockOutcome { readonly type: LoadType; readonly plannedHours: number; readonly actualHours: number }`
- `function paddingFor(outcomes, type): number` — the multiplier, 1 when unknown
- `function biasLine(outcomes, type): string | null` — §7.6's sentence

**§2.4 is precise:** corrects estimates against the student's own history rather than asking
them to be more realistic. Surfaced as a padding multiplier applied silently, **and** as a
line on the "how you work" screen.

**Key decisions:**

- **1.0 when there is no data**, and `biasLine` returns null rather than a sentence claiming
  a bias nobody measured. §7.4 says bias comes from day 7 onward; before that the honest
  answer is silence.
- A **minimum sample** before any claim — one block that overran is noise, not a bias. Three.
- Padding is **bounded**. An unbounded multiplier from two bad samples would put a student's
  week into fiction, which is the failure §7.2 warns about in a different form.
- Only *over*-runs pad. Finishing early is not a reason to shrink an estimate — §2.4 is about
  underestimation, and padding downward would quietly make a heavy week look survivable.

**Tests:** no data gives 1.0 and no line; under the sample floor gives 1.0 and no line;
consistent overrun gives a multiplier above 1 and a sentence naming it; the multiplier is
bounded; finishing early never pads below 1; the line names the load type in the student's
words; each type is independent of the others.

---

## Task 4: Post-block confirmation

**Produces:** `BlockConfirm` component — "did this happen? yes / no / partly", plus the
two-tap difficulty rating that §7.9 says rides on the same prompt.

**Key decisions:**

- §7.9 calls this the single highest value-per-effort input path in the app, because it feeds
  three separate parameters: Reality Check, the carryover matrix, and the Micro-Start trigger.
- **Never punish a miss.** "No" is neutral, gets no commentary, and the copy must not imply
  failure. There is a test asserting the words "failed", "should have" and "why not" do not
  appear.
- Difficulty is *one additional tap*, not a second screen.

**Tests:** all three answers are offered; each hands back what was chosen; the difficulty
rating is offered on the same prompt; nothing renders with no block to confirm; **the copy
never reproaches** — asserted against a word list; it can be dismissed without answering,
because a forced prompt is one a student learns to dread.

---

## Task 5: The screens

`ModePicker` (§7.1): four modes as one screen, four taps, plus the semester-break toggle.
Shows the current mode selected rather than an empty form — §7's "correct, don't enter".

`Painter` (§7.2): a 3×24 grid of buttons. Prefilled from the profile's load shape where one
exists. Every cell is a real button with an accessible name naming its day, hour and state,
because a grid of unlabelled divs is unusable with a screen reader and this is the densest
control in the app.

`HowYouWork` (§7.6): the payoff. Renders only the lines it actually has data for — a screen
that claims "you focus well for about 90 minutes" from no measurement is worse than a screen
that says nothing yet. §11 calls this the sharpest answer to "how is this different from a
to-do list", and it is only sharp if every line is true.

**Tests** per component as listed in each; plus the painter at 320px in the browser suite.

---

## Task 6: Wiring

The home screen gains a way into calibration and shows the calibration meter as progress.
Nothing is gated behind it (§7.7). The block-confirmation prompt appears when there is a
block to confirm.

**Tests:** the entry point exists; the room still renders without any calibration (no cold
start); a completed mode pick persists to storage; old settings without a profile still load.

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| §7.1 mode picker, semester break as a toggle | 1, 5 |
| §7.2 three-day painter, cell cycle | 2, 5 |
| §7.3 parameter extraction | 2 |
| §7.5 relative, not absolute | 1 — focus is a bucket |
| §7.6 "how you work" screen | 3, 5 |
| §7.7 no cold start, calibration meter | 1, 6 |
| §7.9 post-block confirmation + difficulty | 4 |
| §7.9 never punish a miss | 4 — asserted against a word list |
| §2.4 Reality Check, padding multiplier | 3 |
| §2.4 surfaced on "how you work" | 3, 5 |
| §7.4 progressive calibration | **Partial.** Day 0 from the painter and day 7+ from confirmations are built. The days 1–7 exponential smoothing from check-ins is not — §7.8's check-in is not in §11's must-build list. |
| §7.8 the check-in | **Not built.** Not in the must-build tier, and it wants passive phone-use inference this app has no access to. |
| §7.9 retroactive fill | **Not built.** "Yesterday looks like it went to plan" is a refinement of a path that has to exist first. |

**Two risks recorded:**

1. **Extracted parameters are not yet fed into `EngineParams`.** The painter measures max
   focus run and sleep baseline, and §7.3 says the optimizer should size blocks to the first
   and `k_sleep` should follow the second. Wiring that changes every projection in the app
   and every test that asserts one, so it is its own change. Until then calibration informs
   the *student* via §7.6 but not yet the *model* — and the pull request must say so rather
   than implying the loop is closed.
2. **Reality Check has no data source until blocks are confirmed.** That is by design (§7.9
   is its only source) but it means the padding multiplier is 1.0 for every new student, and
   the "how you work" screen will be mostly empty on first run. That is the honest state, and
   §7.7's meter is what makes it read as progress rather than emptiness.
