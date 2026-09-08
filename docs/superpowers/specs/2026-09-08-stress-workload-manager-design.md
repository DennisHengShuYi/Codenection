# Stress & Workload Manager — implementation design

**Date:** 2026-09-08
**Source spec:** [`burnout-app-spec-v3.md`](../../../burnout-app-spec-v3.md)
**Scope agreed with the user:** the spec's §11 *Must build* list, in full. The *high value
if time allows* and *roadmap slide only* tiers are out.

This document is the *implementation* design. It does not restate the product spec; it
records how that spec becomes code, which decisions were taken where the spec left a
choice open, and what the boundaries between modules are. Where a rule here comes from
the spec, the section is cited so the reasoning stays traceable rather than being
re-litigated later.

---

## 1. Decisions taken

Four decisions were settled with the user before design, and two were taken by default.
They are recorded here because each one closes a fork the spec deliberately left open.

| # | Decision | Rationale |
|---|---|---|
| 1 | Build the §11 *Must build* tier in full | The user's reading of "build it completely". |
| 2 | Wire Supabase and Groq for real, reading credentials from env vars | Real clients and real `/api` routes, but no secret is required for the build to run or for CI to pass — see §5 and §6. |
| 3 | Full stack as §10 names it: Vite + React + TypeScript + Tailwind + shadcn/ui + Framer Motion + Recharts | The user chose the literal stack over a reduced one. |
| 4 | Build deploy-ready; do not deploy | Deploying is outward-facing, and `.claude/CLAUDE.md` bars irreversible or outward-facing actions without explicit confirmation. `vercel.json`, the PWA manifest and the service worker are built and the production build is verified locally; the deploy itself stays with the user. |
| 5 | Three-day painter at 320px: horizontal scroll with the day label pinned | §10 requires this be decided before building. Collapsing to 3-hour buckets below 360px would destroy the "longest unbroken study block" extraction in §7.3, which is the painter's main payload — a 3-hour bucket cannot distinguish a 90-minute focus run from a 3-hour one. |
| 6 | Google Calendar import: out of scope | §11 files it under *high value if time allows*, and §1.4's own recommendation is that it never be the only input path. OCR-primary stands, so nothing in the must-build tier depends on it. |

### Consequences of decision 4

Nothing in the build may assume a deployed environment. The app must run fully from a
local production build, and every screen must render with zero user data (§0's *no cold
start*). The `/api` routes are written as Vercel handlers but are exercised in tests
through their handler functions directly, not over a network.

---

## 2. Module structure

Eight modules, layered so that the expensive reasoning is pure and the I/O sits at the
edges. Dependencies point strictly downward: nothing in `engine/` imports from
`optimizer/`, nothing below `ui/` imports React.

```
src/
  engine/       pure arithmetic — no I/O, no React, no clock, no randomness
  optimizer/    pure solver over engine output
  domain/       immutable task/block/profile state and its transitions
  data/         Repository interface; Supabase adapter + local adapter
  ai/           provider interface + deterministic fallbacks
  validation/   48-hour prediction log and MAE scoring
  ui/           React screens; hand-rolled SVG room and dial
api/            Vercel serverless routes (Groq, vision) — API keys live here only
supabase/       checked-in SQL migrations
```

Files stay in the 200–400 line band, 800 max, per the user's global coding-style rules.
Where a module below is described as one responsibility it is still split across several
files by concern; the file lists in §3 are the intended shape, not a suggestion.

### Why `engine/` is pure

The engine takes state and returns new state. It never reads a clock, never reads
storage, never generates a random number. Three things follow, and all three matter:

- **It is exhaustively unit-testable** without mocks, fixtures or fake timers.
- **The optimizer can call it thousands of times** inside a hill-climbing loop (§2.1
  requires the whole solve under 100ms on a phone) with no I/O in the hot path.
- **§12's pitch beat 6 — "show the engine, twenty seconds"** maps to about six readable
  files rather than to logic tangled through components.

Time enters the system as an explicit `dayIndex` or an injected clock at the `domain/`
boundary, never inside `engine/`.

---

## 3. Module responsibilities

### 3.1 `engine/` — the model (§6)

| File | Responsibility | Spec |
|---|---|---|
| `types.ts` | `LoadType = 'mental' \| 'physical' \| 'social' \| 'errands'`; `Reserves`, `DayState`, `Activity`, `EngineParams` | §6.1 |
| `params.ts` | Population default priors, so the app works on first open | §7.7 |
| `reserve.ts` | The recurrence `reserve[d+1] = reserve[d] − drain[d] + recovery[d] × efficiency[d]` | §6.1 |
| `efficiency.ts` | `efficiency = 0.45 + 0.55 × (reserve / 100)` | §6.2 |
| `coupling.ts` | The cross-reserve coupling matrix applied each tick | §6.3 |
| `drain.ts` | Estimate bias, context-switching penalty, deadline-proximity multiplier, travel load, rolling debt | §6.4 |
| `carryover.ts` | Cross-effect matrix with hardcoded priors and time decay | §6.6 |
| `stateCost.ts` | `actual_cost = base_cost × state_multiplier(reserve, recent_activity)` | §6.6 |
| `projection.ts` | 21-day projection; three bands at 0.95× / 1.15× / 1.4×; missing-data pessimism | §6.5 |

**The four load types are the taxonomy; the five UI labels are a presentation concern.**
§0's known-limitations section is explicit that schedule density is a derived view, not a
fifth bucket. The derivation lives in `ui/`, never in `engine/`, so the model cannot
accidentally acquire a fifth reserve.

**Missing data is pessimistic, not neutral** (§6.5). A gap in check-ins widens the band
*and* biases the central estimate downward. This is a correctness requirement, not a
nicety: treating gaps as neutral makes the projection optimistic exactly when the student
is having a bad week, which is when it is being relied on.

**Low social load is a warning, not a good score** (§1.2). The sign of the deviation is
part of the model, not part of the display: `engine/` reports social under its floor as a
deficit in the same way it reports mental over its ceiling.

### 3.2 `optimizer/` — the solver (§2)

| File | Responsibility | Spec |
|---|---|---|
| `objective.ts` | `score = min(reserve over 21d) − 0.3 × count(deficit days) − 0.1 × fragmentation` | §2.1 |
| `constraints.ts` | Hard set: nothing past its deadline, nothing overlapping a fixed block, **protected rest never moves**, daily hours capped | §2.1 |
| `neighbours.ts` | Four move generators: move one movable task one day; batch two same-type errands; insert a rest block into a gap; reorder within a day | §2.1, §6.6 |
| `hillClimb.ts` | Best-neighbour search, to convergence or 200 iterations, 3 random restarts | §2.1 |
| `smallestFix.ts` | Same machinery, single move, top three by effect | §2.2 |
| `report.ts` | Specific change report and its inverse, for one-tap undo | §2.1 |

§2.2's other variants — rebalance for a user-chosen target, and sensitivity ranking — are
**not** in §11's must-build list and are therefore out of this build. They reuse
`hillClimb.ts` unchanged if added later, so nothing here forecloses them. Errand batching
is in scope, but as one of `neighbours.ts`'s move generators rather than as a separate
feature.

**The objective maximises the minimum reserve, not the average.** §2.1 is explicit that
burnout is a floor problem: a fortnight averaging fine but bottoming out at 8 is still a
crash. The fragmentation term exists to stop the solver "fixing" a week by scattering ten
small tasks across every day, which lowers peak load but drains more through context
switching (§6.4).

**Protected rest is immovable, and that is the constraint that expresses the app's whole
stance** (§2.1, §5.1). It is enforced in `constraints.ts` as a hard constraint, not as a
penalty term that a good-enough score could buy its way past.

**Randomness is injected.** The random restarts take a seeded PRNG passed in by the
caller, so the solver is deterministic under test while still being a random-restart
search in production.

**Reporting is never "optimised."** `report.ts` emits the specific list — what moved,
what was batched, what rest was added, and the worst-day reserve before and after —
because §2.1 requires it and because an unexplained reshuffle is not something a student
will act on.

### 3.3 `domain/` — state and transitions

Tasks, blocks, the calibration profile, check-ins and block ratings. Every update returns
a new object; nothing is mutated in place, per the user's global immutability rule. This
module owns the clock: it is where "today" is resolved and where `engine/`'s `dayIndex`
arithmetic is anchored to real dates.

Also here: semester dates (so recurring load stops at break, §1.4), the Malaysia holiday
table (§9 — hardcoded for the demo, state-level, with holidays reducing commitments but
never deadlines), and prayer-time blocks as optional fixed recovery.

Three must-build behaviours live here rather than in `engine/` or `optimizer/`, because
each is a rule about state over time rather than arithmetic over a day:

- **Reality Check** (§2.4) — planned-vs-actual on every completed task, learned per load
  type, exponentially smoothed. It feeds `engine/drain.ts` as the estimate-bias input and
  surfaces on the "how you work" screen. Applied silently as a padding multiplier; the
  user is never asked to be more realistic.
- **Provisional yes with auto-expiry** (§2.3) — every acceptance carries a model-chosen
  review date. If reserve cannot hold it by then, the acceptance lapses and the app drafts
  a withdrawal. This flips the direction of effort: saying no stops requiring an act.
- **Post-block confirmation** (§7.9) — did this happen, yes/no/partly, plus the two-tap
  difficulty rating. One input path feeding three parameters (Reality Check, the carryover
  matrix, the Micro-Start trigger). A "no" is a neutral answer that feeds the model, never
  a failure the app comments on.

### 3.4 `data/` — persistence

One `Repository` interface, two adapters:

- **`SupabaseRepository`** — the real one. Reads `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` from env.
- **`LocalRepository`** — IndexedDB. Used when those vars are absent.

The adapter is selected once, at composition root. Callers depend on the interface only,
so neither adapter leaks into the rest of the app. Two things follow: **CI passes with no
secrets configured**, and **the demo survives a dead network on stage** — which §10's
"nothing is called live on stage" requirement already anticipates for OCR.

Schema lives as checked-in SQL under `supabase/migrations/`. It is never applied
automatically; applying it is the user's action.

### 3.5 `ai/` and `api/` — the model calls

The browser calls `/api/plan`, `/api/micro-start`, `/api/decline`, `/api/ocr`. Those
Vercel routes hold the Groq and vision keys. **No API key ever reaches the browser**
(§10, constraint 1) — a client-side call leaks the key in devtools and breaks the
hackathon's rule 7.

Every provider call has a **deterministic rule-based fallback** in `ai/fallback/`. §10
already requires hardcoded fallbacks for both external dependencies; here they do double
duty, because they are also what makes the say-anything planner (§3.1) work in a test
run, in CI, and with no key present. The fallback is a real parser, not a stub that
throws.

**Photos never travel through a function body** (§10, constraint 2). The client uploads
to Supabase Storage and passes a signed URL to the vision model, because serverless
request bodies cap around 4.5MB and phone photos exceed it. Parsed OCR results are
cached.

**Vision calls are time-boxed** (§10, constraint 3) and fall back to manual entry rather
than hanging the confirm screen.

**Push notifications are not scheduled from Vercel** (§10, constraint 4). The must-build
tier relies on §7.9's retroactive fill, which needs no notification at all.

### 3.6 The untrusted-input boundary

This is the project's hard invariant (`.claude/CLAUDE.md`) applied to this app, and it is
stated here as a rule rather than left implicit:

- **Every Groq and vision response is schema-validated at the `/api` boundary** with Zod
  before it becomes anything else. Nothing downstream treats a model response as checked.
- **A model may propose; it may never originate authority.** It can suggest a task, a
  load type, an effort estimate, or an implied deadline. It may **not** override a
  user-entered deadline, set a protected-rest block, alter the weekly load budget, or
  write to the store directly.
- **Nothing enters the model unconfirmed.** Parsed items surface as editable chips the
  user approves first (§1.4's *never import silently*, §3.2's *confirm, don't assume*).
  Low-confidence extractions are visually flagged rather than silently guessed.
- **The app never declines autonomously** (§2.3). It does the work of declining; the user
  keeps the decision.

### 3.7 `validation/` — the honest claim (§8)

Logs a predicted next-day energy value, resolves it against the reported value 24–48
hours later, and scores mean absolute error. That MAE is what the app displays as its
accuracy number.

The 21-day projection is **never** described as validated, in product copy or anywhere
else (§8.2). It is a decision aid. Ignored warnings are logged as a control arm for later
(§8.3) — free data now, the honest path to testing the long claim over a semester.

### 3.8 `ui/` — the screens

React, Tailwind, shadcn/ui for the shell, Framer Motion for the room's tidy-up sequence.
Recharts covers the two charted surfaces that are in scope — the §8 accuracy readout and
the §7.6 "how you work" screen — using `ResponsiveContainer` with an explicit parent
height, since percentage heights collapse (§10). The weekly digest, Recharts' other user
in the spec, is in the *high value if time allows* tier and is not built here.

The room and the dial are **hand-rolled SVG** with a `viewBox` and
`width: 100%` (§10) — this is the main argument for SVG over canvas, since it scales at
every width without a media query.

Screens: home (room + dial), planner, balance/rebalance, request box and decision flow,
Micro-Start, recovery and the get-outside door, calibration (mode picker + three-day
painter), "how you work", validation/accuracy, and low-energy mode.

---

## 4. Standing requirements

§0 makes these apply to every screen and component, not to a phase at the end. A feature
is not done until it meets them, and they are therefore acceptance criteria on each
implementation task rather than a cleanup pass:

1. **Responsive at 320 / 390 / 768 / 1280px.** No horizontal scroll, no clipped content,
   no overlap, at any width. Mobile-first at 390px.
2. **One-handed reachability** — primary actions in the lower half of the viewport on
   mobile.
3. **Three taps maximum** to any core action.
4. **Accessible as built.** Full text equivalents of every room object state and dial
   value, treated as a primary view and not a fallback; severity never carried by colour
   alone (pair with position, shape, label); reduced-motion keeps the app fully
   functional; low-energy mode collapses to one number and one action below a reserve
   threshold.
5. **No cold start.** Every screen renders something useful with zero user data.

**The gamification rule** (§1.3): the character reflects, never scolds. No death, no dying
plant, no broken streaks, no leaderboards on rest, and specifically not a pet — a pet
creates obligation, and obligation is more load.

**Scope guard on the room** (§1.3): one room, nine bindings, one tidy-up sequence. No room
editor, no unlocks, no customisation.

---

## 5. Build order

Follows §10, which front-loads risk deliberately.

1. **Toolchain, then the §2.5 validation task.** Vite + React + TS + Tailwind + shadcn +
   Framer Motion + Recharts, CI kept green. Then load a realistic UM timetable and
   assignment set into the objective function and **count the degrees of freedom before
   building any rebalance UI**. §2.5 requires this in week one precisely because the
   movable set may be small. If it is, smallest-fix search, within-day reordering and rest
   insertion carry Focus 2 and the full optimizer drops out of the headline — a fine
   outcome, but one to discover now rather than after the UI is built on top of it.
2. **Capacity dial** (§1.2) — the spec's own "build this first", because it de-risks
   Focus 1 completely and is a complete answer to Focus 1 on its own.
3. **Engine** (§6) and **say-anything planner** (§3).
4. **Room** (§1.3), **rebalancer and decision flow** (§2).
5. **Micro-Start** (§4), **recovery** (§5), **calibration** (§7), **48-hour validation**
   (§8), accessibility, seeded demo account.

---

## 6. Testing

Per `.claude/CLAUDE.md`, tests ship in the same change as the behaviour they cover, and
implementation follows test-driven development: the test is written first and watched
failing before the code that satisfies it.

- **`engine/`, `optimizer/`, `domain/`, `ai/` fallbacks, `validation/`** — thorough Vitest
  coverage. These are pure, so this is cheap, and it is where correctness actually lives.
  The engine's properties are worth asserting directly: the efficiency curve is monotonic,
  a rest block never lowers the projection, the optimizer never returns a schedule
  violating a hard constraint, protected rest is never moved.
- **`api/` routes** — tested through their handler functions with a stubbed provider. No
  network, no key, no live call. This satisfies `.claude/CLAUDE.md`'s rule that testing
  never runs against a real credential.
- **Screens** — Playwright, asserting the four breakpoints from §0/§10 rather than
  eyeballing them, since responsiveness is a standing requirement and an unasserted
  requirement is one that regresses.

**`--passWithNoTests` is removed** from the `test` and `test:coverage` scripts as soon as
the first real source file lands. `.claude/CLAUDE.md` calls it temporary scaffolding that
exists only so the gate is green on an empty repository; past that point it lets an
accidentally unmatched suite report success.

---

## 7. Known limitations, carried from the spec

Stated here so they stay in the build rather than being remembered only at pitch time
(§0):

- **The 21-day projection is not verifiable.** If it says day 14 and you rebalance, you
  never learn whether it was right. What gets validated is the 48-hour claim (§8).
- **"Time" is the unit, not a category.** Five labels surface; four load types exist.
- **Web-first costs sensor access.** Sleep, steps and screen time sit in the phone
  already. PWA was chosen for demo friction and deployability; Capacitor is the migration
  path and is roadmap, not build.
- **The optimizer may have little to move.** Verified by the §2.5 task in step 1 above.
  Under this framing the optimizer is load-bearing, so that test matters more, not less.
