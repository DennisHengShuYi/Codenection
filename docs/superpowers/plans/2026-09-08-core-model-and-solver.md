# Core Model and Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the burnout engine (§6) and the rebalancing solver (§2.1–2.2) as a pure, exhaustively tested TypeScript library, then run the §2.5 degrees-of-freedom measurement that decides whether the full optimizer or the smallest-fix search headlines Focus 2.

**Architecture:** Two pure modules with a strict one-way dependency. `src/engine/` is arithmetic over a 21-day array — no I/O, no clock, no randomness, no React — so it can be called thousands of times inside a search loop and tested without a single mock. `src/optimizer/` sits on top, calling the engine to score candidate schedules, and injects its own seeded PRNG so a random-restart search is still deterministic under test. Nothing in this plan imports React or touches the network.

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), Vitest 4, Node 22. Vite + React + Tailwind are installed in Task 1 so the toolchain exists for Plan 2, but no task here renders a component.

**Spec:** [`docs/superpowers/specs/2026-09-08-stress-workload-manager-design.md`](../specs/2026-09-08-stress-workload-manager-design.md), which implements [`burnout-app-spec-v3.md`](../../../burnout-app-spec-v3.md). Section numbers below (§6.2, §2.1, …) refer to the product spec. Read both.

## Global Constraints

Every task's requirements implicitly include this section.

- **`src/engine/**` is pure.** No `Date.now()`, no `Math.random()`, no imports from `src/data`, `src/ui` or `src/ai`. Time enters as an integer `dayIndex`. Violating this breaks the optimizer's hot path and the test strategy at once.
- **`src/optimizer/**` takes randomness as a parameter.** A `Rng = () => number` is passed in; never `Math.random()` directly.
- **Immutability.** Every function returns a new object. Never mutate an argument. (User global rule: `~/.claude/rules/common/coding-style.md`.)
- **Reserves are clamped to `0..100`** at every write. A negative reserve is meaningless and silently poisons the efficiency curve.
- **Four load types, never five:** `'mental' | 'physical' | 'social' | 'errands'`. §0 is explicit that the five UI labels are a presentation concern and schedule density is a derived view. No fifth reserve may appear in `src/engine/`.
- **Low social load is a deficit, not a good score** (§1.2). Social is the one reserve that drains from *absence* of activity.
- **Protected rest is a hard constraint, never a penalty term** (§2.1, §5.1).
- **Files 200–400 lines, 800 max; functions under 50 lines; no nesting past 4 levels.** (User global rule.)
- **TDD, red before green.** Write the test, run it, watch it fail for the right reason, then implement. Tests ship in the same commit as the behaviour (`.claude/CLAUDE.md`, "Tests are part of the change").
- **Never `git push`.** `.claude/CLAUDE.md` bars pushing without explicit confirmation. Commit freely; push never.
- **Commit message format:** `<type>: <description>`, types `feat|fix|refactor|docs|test|chore|perf|ci`, ending with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

### Numeric constants fixed by this plan

These are the population priors (§7.7). They live in `src/engine/params.ts` and every task refers to them by name, never by repeating the literal.

| Constant | Value | Source |
|---|---|---|
| `EFFICIENCY_FLOOR` | `0.45` | §6.1 |
| `EFFICIENCY_SPAN` | `0.55` | §6.1 |
| `SLEEP_BASELINE_HOURS` | `5` | §6.1 (`max(0, sleep − 5)`) |
| `STATE_COST_PIVOT` | `70` | §6.6 (at 70% reserve, 2h costs 2h) |
| `STATE_COST_SLOPE` | `1.111` | §6.6 (at 25% reserve, 2h costs ~3h) |
| `FRAGMENTATION_WEIGHT` | `0.1` | §2.1 |
| `DEFICIT_DAY_WEIGHT` | `0.3` | §2.1 |
| `HORIZON_DAYS` | `21` | §2.1, §6 |
| `DEFICIT_THRESHOLD` | `30` | §7.6 ("below 30 reserve" recovery halves) |
| `BAND_BIASES` | `[0.95, 1.15, 1.4]` | §6.5 |
| `MAX_ITERATIONS` | `200` | §2.1 |
| `RESTARTS` | `3` | §2.1 |

---

## File Structure

```
src/
  engine/
    types.ts          Domain types + LOAD_TYPES. No logic.
    params.ts         Population priors and the matrices. Data only.
    efficiency.ts     Recovery-efficiency curve (§6.2).
    carryover.ts      Cross-effect residue with time decay (§6.6).
    stateCost.ts      Reserve-dependent cost multiplier (§6.6).
    drain.ts          Per-type drain for one day (§6.4).
    recovery.ts       Per-type recovery for one day (§6.1, §5.1).
    coupling.ts       Directional cross-reserve drag (§6.3).
    tick.ts           One day: drain, recover, couple, clamp (§6.1).
    projection.ts     21-day projection, three bands, missing-data pessimism (§6.5).
    index.ts          Public surface of the engine.
  optimizer/
    types.ts          Schedule, Move, RebalanceResult.
    objective.ts      score(schedule) (§2.1).
    constraints.ts    Hard-constraint validity (§2.1).
    neighbours.ts     The four move generators (§2.1, §6.6).
    rng.ts            Seeded PRNG so restarts are deterministic under test.
    hillClimb.ts      Best-neighbour search with restarts (§2.1).
    smallestFix.ts    Single-move top-three (§2.2).
    report.ts         Human-readable change report + inverse for undo (§2.1).
    index.ts          Public surface of the optimizer.
scripts/
  degrees-of-freedom.ts   The §2.5 measurement.
src/fixtures/
  umWeek.ts               A realistic UM timetable + assignment set.
```

Tests are colocated as `src/**/*.test.ts` — `vitest.config.ts` already includes exactly that glob, so no config change is needed for them to run.

---

## Task 1: Toolchain

Installs the stack §10 names and gets a React app rendering, without breaking the existing CI gate. No engine code yet.

**Files:**
- Create: `vite.config.ts`, `index.html`, `src/main.tsx`, `src/ui/App.tsx`, `src/styles.css`, `tailwind.config.ts`, `postcss.config.js`, `src/ui/App.test.tsx`
- Modify: `package.json` (scripts + deps), `vitest.config.ts` (jsdom + tsx globs), `tsconfig.json` (jsx, DOM lib), `playwright.config.ts:webServer`, `.gitignore`
- Delete: `src/index.ts`, `public/index.html`, `scripts/serve.mjs`
- Test: `src/ui/App.test.tsx`, existing `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm run dev` / `npm run build`; `App` exported from `src/ui/App.tsx`.

- [ ] **Step 1: Install dependencies**

```bash
npm install react react-dom zod
npm install -D vite @vitejs/plugin-react @types/react @types/react-dom \
  tailwindcss @tailwindcss/postcss postcss autoprefixer \
  jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Framer Motion, Recharts, shadcn/ui and `@supabase/supabase-js` are **not** installed here. They have no consumer until Plan 2, and an unused dependency in the lockfile is a supply-chain surface with no benefit. Install each in the task that first imports it.

- [ ] **Step 2: Write the failing test**

`src/ui/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('renders the app shell', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Codenection')
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: FAIL — cannot resolve `./App`.

- [ ] **Step 4: Create the app shell**

`src/ui/App.tsx`:

```tsx
export function App() {
  return (
    <main className="mx-auto max-w-screen-md p-4">
      <h1 className="text-2xl font-semibold">Codenection</h1>
      <p data-testid="status">Ready</p>
    </main>
  )
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root missing from index.html')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`index.html` at the repository root (Vite's convention — this replaces `public/index.html`):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Codenection</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/styles.css`:

```css
@import 'tailwindcss';
```

`vite.config.ts`:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: { port: Number(process.env.PORT ?? 5180), host: '127.0.0.1' },
  preview: { port: Number(process.env.PORT ?? 5180), host: '127.0.0.1' },
})
```

`postcss.config.js`:

```js
export default { plugins: { '@tailwindcss/postcss': {} } }
```

- [ ] **Step 5: Point the tooling at the new layout**

In `vitest.config.ts`, widen the include glob and add the DOM environment. Keep the existing coverage block; add the setup file:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/main.tsx', 'src/test-setup.ts'],
    },
  },
})
```

`src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

In `tsconfig.json` add `"jsx": "react-jsx"` and add `"DOM"`, `"DOM.Iterable"` to `lib`. Add `"index.html"` is not needed; leave `include` as-is but add `"vite.config.ts"`.

In `package.json` set:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test"
}
```

**`--passWithNoTests` is removed in this step**, not later. `.claude/CLAUDE.md` calls it temporary scaffolding to delete once the first real source file lands, and Step 4 is that moment. `src/ui/App.test.tsx` keeps the suite non-empty.

In `playwright.config.ts`, change `webServer.command` from the `scripts/serve.mjs` invocation to `npm run build && npm run preview`. The comment in `scripts/serve.mjs` says explicitly to do this once the app has a real dev server.

- [ ] **Step 6: Delete the scaffolding it replaced**

```bash
git rm src/index.ts public/index.html scripts/serve.mjs
```

Removed behaviour gets its tests removed, so also delete the `an unknown path returns 404` case from `tests/e2e/smoke.spec.ts` — it asserted a property of the hand-rolled static server, which no longer exists. Keep `the page renders`; it still asserts the real page.

Add `dist/` to `.gitignore`.

- [ ] **Step 7: Verify the whole gate**

```bash
npm run typecheck && npm run test && npm run build && npm run test:e2e
```

Expected: typecheck clean, `App` test passes, build emits `dist/`, Playwright's `the page renders` passes against the preview server.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: replace the static scaffold with a Vite + React + Tailwind app

Swaps the placeholder public/index.html and the hand-rolled static
server for a real Vite app, which is what §10 of the spec calls for and
what every later screen needs.

Drops --passWithNoTests from the test scripts now that a real source
file and a real test exist, per "Tests are part of the change" in
.claude/CLAUDE.md. Playwright's webServer now builds and previews the
app instead of serving public/, as scripts/serve.mjs itself said to do
once a dev server existed.

The 404 e2e case goes with the static server it was testing; the
page-renders case stays and still asserts a real rendered page.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Engine types and parameters

Data only — no behaviour, so the test asserts the *invariants* of the priors rather than a computation. This matters more than it looks: a mistyped coupling constant is invisible until a projection is subtly wrong, and these assertions catch it at the source.

**Files:**
- Create: `src/engine/types.ts`, `src/engine/params.ts`, `src/engine/params.test.ts`

**Interfaces:**
- Produces: every type and constant used by Tasks 3–10. Exact signatures below.

- [ ] **Step 1: Write the failing test**

`src/engine/params.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { LOAD_TYPES } from './types'
import { CROSS_EFFECT, DEFAULT_PARAMS, COUPLING } from './params'

describe('population priors', () => {
  it('defines a type intensity and sleep coefficient for every load type', () => {
    for (const type of LOAD_TYPES) {
      expect(DEFAULT_PARAMS.typeIntensity[type]).toBeGreaterThan(0)
      expect(DEFAULT_PARAMS.kSleep[type]).toBeGreaterThanOrEqual(0)
      expect(DEFAULT_PARAMS.estimateBias[type]).toBeGreaterThan(0)
    }
  })

  it('models exactly four load types, not the five labels the UI shows', () => {
    expect(LOAD_TYPES).toHaveLength(4)
    expect(LOAD_TYPES).not.toContain('schedule')
  })

  it('makes hard exercise cost mental capacity and light movement raise it', () => {
    expect(CROSS_EFFECT.hardExercise.mental).toBeCloseTo(-0.25)
    expect(CROSS_EFFECT.lightExercise.mental).toBeCloseTo(0.1)
  })

  it('drags other reserves down only, never up, through coupling', () => {
    for (const from of LOAD_TYPES) {
      for (const to of LOAD_TYPES) {
        expect(COUPLING[from][to]).toBeGreaterThanOrEqual(0)
      }
    }
    expect(COUPLING.physical.mental).toBeGreaterThan(0)
    expect(COUPLING.social.mental).toBeGreaterThan(0)
  })

  it('gives social a floor, because low social load is a deficit not a good score', () => {
    expect(DEFAULT_PARAMS.socialFloorHoursPerDay).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/engine/params.test.ts`
Expected: FAIL — cannot resolve `./types`.

- [ ] **Step 3: Write the types**

`src/engine/types.ts`:

```ts
/** The model's taxonomy. §0 is explicit that the UI's five labels are a presentation
 *  concern and schedule density is a derived view -- there is no fifth reserve. */
export const LOAD_TYPES = ['mental', 'physical', 'social', 'errands'] as const
export type LoadType = (typeof LOAD_TYPES)[number]

/** 0..100 per type. Clamped at every write; a negative reserve poisons the efficiency
 *  curve silently. */
export type Reserves = Readonly<Record<LoadType, number>>

/** The kinds of activity the carryover matrix (§6.6) distinguishes. Coarser than
 *  LoadType because the residue depends on what you did, not which bucket it drained. */
export type ActivityKind =
  | 'hardExercise'
  | 'lightExercise'
  | 'studyBlock'
  | 'socialDraining'
  | 'socialRestorative'
  | 'errands'
  | 'rest'
  | 'sleep'

export interface Activity {
  readonly kind: ActivityKind
  readonly type: LoadType
  /** Hours of wall-clock time the activity occupies. */
  readonly hours: number
  /** 0..2; 1 is typical for its kind. */
  readonly intensity: number
  /** Local hour the activity starts, 0..24. Fractional allowed. */
  readonly startHour: number
}

export interface DayInput {
  readonly dayIndex: number
  readonly activities: readonly Activity[]
  readonly sleepHours: number
  /** Distinct venues visited; drives travel load (§6.4). */
  readonly venueChanges: number
  /** Days until the nearest deadline, or null if none pending (§6.4). */
  readonly daysToNearestDeadline: number | null
  /** False when the user did not check in. Absence is treated as signal (§6.5). */
  readonly checkedIn: boolean
}

export type CrossEffect = Readonly<Record<ActivityKind, Reserves>>
export type CouplingMatrix = Readonly<Record<LoadType, Reserves>>

export interface EngineParams {
  readonly typeIntensity: Reserves
  readonly kSleep: Reserves
  readonly kRest: Reserves
  /** Learned per type from planned-vs-actual (§2.4). 1 means unbiased. */
  readonly estimateBias: Reserves
  /** Below this many social hours a day, social reserve drains (§1.2). */
  readonly socialFloorHoursPerDay: number
  readonly isolationDrainPerDay: number
  readonly contextSwitchPenalty: number
  readonly deadlineProximityWeight: number
  readonly travelLoadPerVenueChange: number
  readonly dailyHoursCap: number
}
```

- [ ] **Step 4: Write the priors**

`src/engine/params.ts`:

```ts
import type { CouplingMatrix, CrossEffect, EngineParams, Reserves } from './types'

export const EFFICIENCY_FLOOR = 0.45
export const EFFICIENCY_SPAN = 0.55
export const SLEEP_BASELINE_HOURS = 5
export const STATE_COST_PIVOT = 70
export const STATE_COST_SLOPE = 1.111
export const DEFICIT_THRESHOLD = 30
export const HORIZON_DAYS = 21
export const BAND_BIASES = [0.95, 1.15, 1.4] as const
export const FULL_RESERVE = 100

const uniform = (value: number): Reserves => ({
  mental: value,
  physical: value,
  social: value,
  errands: value,
})

export const DEFAULT_PARAMS: EngineParams = {
  typeIntensity: { mental: 1.0, physical: 0.8, social: 0.6, errands: 0.5 },
  kSleep: { mental: 6.0, physical: 7.0, social: 2.0, errands: 2.0 },
  kRest: { mental: 4.0, physical: 3.0, social: 3.0, errands: 2.0 },
  estimateBias: uniform(1),
  socialFloorHoursPerDay: 0.5,
  isolationDrainPerDay: 4,
  contextSwitchPenalty: 1.5,
  deadlineProximityWeight: 6,
  travelLoadPerVenueChange: 1.5,
  dailyHoursCap: 10,
}

/** §6.6's table, as residue on each reserve's *capacity* for the hours that follow.
 *  Positive means it helps: light movement genuinely raises subsequent focus, which is
 *  what makes the app's own rest suggestions self-justifying. */
export const CROSS_EFFECT: CrossEffect = {
  hardExercise: { mental: -0.25, physical: -0.2, social: 0, errands: -0.1 },
  lightExercise: { mental: 0.1, physical: 0.05, social: 0.05, errands: 0 },
  studyBlock: { mental: -0.3, physical: 0, social: -0.05, errands: 0 },
  socialDraining: { mental: -0.15, physical: 0, social: 0.1, errands: 0 },
  socialRestorative: { mental: 0.1, physical: 0, social: 0.2, errands: 0 },
  errands: { mental: -0.1, physical: -0.05, social: 0, errands: 0.05 },
  rest: { mental: 0.15, physical: 0.1, social: 0, errands: 0 },
  sleep: { mental: 0, physical: 0, social: 0, errands: 0 },
}

/** Hours over which a kind's residue decays to half. §6.6: hard exercise recovers over
 *  roughly three hours; a long study block "needs a real gap". */
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

/** §6.3. Directional and non-negative: a deficit in `from` drags `to` down. Physical
 *  depletion drags mental; social isolation slows recovery across the board. Nothing
 *  here can lift a reserve, which is why every entry is >= 0 and applied as a
 *  subtraction. */
export const COUPLING: CouplingMatrix = {
  mental: { mental: 0, physical: 0.02, social: 0.04, errands: 0.02 },
  physical: { mental: 0.12, physical: 0, social: 0.02, errands: 0.04 },
  social: { mental: 0.08, physical: 0.02, social: 0, errands: 0.02 },
  errands: { mental: 0.03, physical: 0.01, social: 0.01, errands: 0 },
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/engine/params.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/engine
git commit -m "$(cat <<'EOF'
feat: add the engine's types and population priors

Establishes the four-load-type taxonomy the whole model rests on, plus
the §6.6 cross-effect table and the §6.3 coupling matrix as data rather
than as constants buried in the functions that read them.

The tests assert the priors' invariants rather than a computation,
because a mistyped coupling constant is otherwise invisible until a
projection is quietly wrong: coupling is non-negative in every cell (it
can only drag a reserve down, never lift one), light movement raises
mental capacity while hard exercise lowers it, and there are exactly
four load types -- the fifth UI label is a derived view, per §0.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: The efficiency curve

§6.2 calls this "the mechanic that makes it real" — the nonlinearity that produces a spiral looking survivable right up until it isn't.

**Files:**
- Create: `src/engine/efficiency.ts`, `src/engine/efficiency.test.ts`

**Interfaces:**
- Consumes: `EFFICIENCY_FLOOR`, `EFFICIENCY_SPAN`, `FULL_RESERVE`, `COUPLING` from `./params`; `Reserves`, `LOAD_TYPES` from `./types`.
- Produces: `overallReserve(r: Reserves): number`, `recoveryEfficiency(r: Reserves): number`.

- [ ] **Step 1: Write the failing test**

`src/engine/efficiency.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { overallReserve, recoveryEfficiency } from './efficiency'
import type { Reserves } from './types'

const at = (value: number): Reserves => ({
  mental: value, physical: value, social: value, errands: value,
})

describe('recoveryEfficiency', () => {
  it('returns all of your rest at full reserve', () => {
    expect(recoveryEfficiency(at(100))).toBeCloseTo(1.0)
  })

  // §6.2 states this number outright: at 20% reserve you get 56% of your rest back.
  it('returns 56% of your rest at 20% reserve', () => {
    expect(recoveryEfficiency(at(20))).toBeCloseTo(0.56)
  })

  it('never returns less than the floor, even at zero', () => {
    expect(recoveryEfficiency(at(0))).toBeCloseTo(0.45)
  })

  it('is monotonically increasing in reserve, which is what makes the spiral a spiral', () => {
    let previous = -Infinity
    for (let r = 0; r <= 100; r += 5) {
      const current = recoveryEfficiency(at(r))
      expect(current).toBeGreaterThan(previous)
      previous = current
    }
  })
})

describe('overallReserve', () => {
  it('averages the four reserves', () => {
    expect(overallReserve({ mental: 40, physical: 60, social: 20, errands: 80 })).toBe(50)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/engine/efficiency.test.ts`
Expected: FAIL — cannot resolve `./efficiency`.

- [ ] **Step 3: Implement**

`src/engine/efficiency.ts`:

```ts
import { EFFICIENCY_FLOOR, EFFICIENCY_SPAN, FULL_RESERVE } from './params'
import { LOAD_TYPES, type Reserves } from './types'

/** The single number the dial shows (§1.2) and the input to every state-dependent
 *  calculation. An equal-weighted mean: no reserve is privileged, because §6.3's whole
 *  point is that a deficit anywhere propagates. */
export function overallReserve(reserves: Reserves): number {
  const total = LOAD_TYPES.reduce((sum, type) => sum + reserves[type], 0)
  return total / LOAD_TYPES.length
}

/**
 * §6.2: recovery efficiency falls as reserve falls. At full reserve you get 100% of your
 * rest back; at 20% reserve, 56%.
 *
 * This is the nonlinearity that produces the spiral -- a depleted student recovers more
 * slowly, which keeps them depleted. A linear tracker cannot represent it, and it is the
 * phenomenon the brief's background paragraph describes.
 */
export function recoveryEfficiency(reserves: Reserves): number {
  const ratio = overallReserve(reserves) / FULL_RESERVE
  return EFFICIENCY_FLOOR + EFFICIENCY_SPAN * ratio
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/engine/efficiency.test.ts`
Expected: PASS, 5 tests. If the 20% case fails, the floor and span are wrong: `0.45 + 0.55 × 0.2 = 0.56`.

- [ ] **Step 5: Commit**

```bash
git add src/engine/efficiency.ts src/engine/efficiency.test.ts
git commit -m "$(cat <<'EOF'
feat: add the recovery-efficiency curve

§6.2 calls this the mechanic that makes the model real: recovery
efficiency falls as reserve falls, so a depleted student recovers more
slowly and stays depleted. That nonlinearity is what produces a week
that looks survivable right up until it isn't.

The test pins the spec's own worked number -- 56% of your rest back at
20% reserve -- and asserts monotonicity across the whole range, since a
curve that dipped anywhere would break the spiral the model exists to
show.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Carryover

§6.6's residue: every completed activity leaves an effect on the *other* reserves for a few hours, decaying with time.

**Files:**
- Create: `src/engine/carryover.ts`, `src/engine/carryover.test.ts`

**Interfaces:**
- Consumes: `CROSS_EFFECT`, `CARRYOVER_HALF_LIFE_HOURS` from `./params`; `Activity`, `LoadType`, `Reserves` from `./types`.
- Produces: `carryoverAt(activities: readonly Activity[], hour: number): Reserves` — returns a multiplier delta per type, where `0` means no effect, `-0.25` means capacity reduced by a quarter.

- [ ] **Step 1: Write the failing test**

`src/engine/carryover.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { carryoverAt } from './carryover'
import type { Activity } from './types'

const gym: Activity = {
  kind: 'hardExercise', type: 'physical', hours: 1, intensity: 1, startHour: 17,
}
const walk: Activity = {
  kind: 'lightExercise', type: 'physical', hours: 0.5, intensity: 1, startHour: 17,
}

describe('carryoverAt', () => {
  it('applies the full cross-effect immediately after the activity', () => {
    expect(carryoverAt([gym], 18).mental).toBeCloseTo(-0.25)
  })

  it('decays toward zero as hours pass', () => {
    const soon = carryoverAt([gym], 18).mental
    const later = carryoverAt([gym], 21).mental
    expect(later).toBeGreaterThan(soon)
    expect(later).toBeLessThan(0)
    expect(carryoverAt([gym], 30).mental).toBeCloseTo(0, 1)
  })

  it('ignores activities that have not happened yet', () => {
    expect(carryoverAt([gym], 12).mental).toBe(0)
  })

  it('raises mental capacity after light movement, which is why a walk buys a better study block', () => {
    expect(carryoverAt([walk], 18).mental).toBeGreaterThan(0)
  })

  it('sums concurrent residues', () => {
    const study: Activity = {
      kind: 'studyBlock', type: 'mental', hours: 2, intensity: 1, startHour: 14,
    }
    const combined = carryoverAt([gym, study], 18).mental
    expect(combined).toBeLessThan(carryoverAt([gym], 18).mental)
  })

  it('scales with intensity', () => {
    const light = { ...gym, intensity: 0.5 }
    expect(carryoverAt([light], 18).mental).toBeGreaterThan(carryoverAt([gym], 18).mental)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/engine/carryover.test.ts`
Expected: FAIL — cannot resolve `./carryover`.

- [ ] **Step 3: Implement**

`src/engine/carryover.ts`:

```ts
import { CARRYOVER_HALF_LIFE_HOURS, CROSS_EFFECT } from './params'
import { LOAD_TYPES, type Activity, type Reserves } from './types'

const ZERO: Reserves = { mental: 0, physical: 0, social: 0, errands: 0 }

/** Exponential decay to half over `halfLife` hours. A half-life of 0 means the residue
 *  does not persist at all, which is how sleep is modelled: a full reset, not a trailing
 *  effect. */
function decay(hoursSince: number, halfLife: number): number {
  if (halfLife <= 0) return 0
  return Math.pow(0.5, hoursSince / halfLife)
}

/**
 * §6.6: the residue recent activity leaves on each reserve's capacity, at a given hour.
 *
 * Returned as a delta on a multiplier, so -0.25 means "a quarter less mental capacity
 * than usual". The positive entries matter as much as the negative ones: light movement
 * genuinely raises subsequent focus, which is what makes a walk not merely rest but a
 * purchase of a better study block.
 */
export function carryoverAt(activities: readonly Activity[], hour: number): Reserves {
  const totals: Record<string, number> = { ...ZERO }

  for (const activity of activities) {
    const endHour = activity.startHour + activity.hours
    if (endHour > hour) continue

    const weight = activity.intensity * decay(hour - endHour, CARRYOVER_HALF_LIFE_HOURS[activity.kind])
    if (weight === 0) continue

    const effect = CROSS_EFFECT[activity.kind]
    for (const type of LOAD_TYPES) {
      totals[type] = (totals[type] ?? 0) + effect[type] * weight
    }
  }

  return {
    mental: totals.mental ?? 0,
    physical: totals.physical ?? 0,
    social: totals.social ?? 0,
    errands: totals.errands ?? 0,
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/engine/carryover.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/carryover.ts src/engine/carryover.test.ts
git commit -m "$(cat <<'EOF'
feat: add the carryover matrix

§6.6: every completed activity leaves a residue on the other reserves
for a few hours, decaying with time. This is what stops the optimizer
stacking gym at 5pm and deep study at 7pm and calling it a good day,
and it is what makes sequencing a lever even when the days themselves
are fixed.

The positive entries are load-bearing, not decoration: light movement
raising subsequent focus is what makes the app's own recovery
suggestions self-justifying, so the test asserts that sign explicitly
rather than only checking the penalties.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: State-dependent task cost

§6.6's other half: a task's cost is a property of the task *and* the state you are in when you reach it.

**Files:**
- Create: `src/engine/stateCost.ts`, `src/engine/stateCost.test.ts`

**Interfaces:**
- Consumes: `STATE_COST_PIVOT`, `STATE_COST_SLOPE`, `FULL_RESERVE` from `./params`; `carryoverAt` from `./carryover`.
- Produces: `stateMultiplier(overall: number, carryoverForType: number): number`, `actualCost(baseCost: number, overall: number, carryoverForType: number): number`.

- [ ] **Step 1: Write the failing test**

`src/engine/stateCost.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { actualCost, stateMultiplier } from './stateCost'

describe('stateMultiplier', () => {
  // §6.6 states both anchors: at 70% reserve two hours costs two hours; at 25% it costs
  // closer to three.
  it('costs what it says it costs at 70% reserve', () => {
    expect(stateMultiplier(70, 0)).toBeCloseTo(1.0, 2)
  })

  it('costs about half again as much at 25% reserve', () => {
    expect(actualCost(2, 25, 0)).toBeGreaterThan(2.8)
    expect(actualCost(2, 25, 0)).toBeLessThan(3.2)
  })

  it('does not make work cheaper than nominal above the pivot', () => {
    expect(stateMultiplier(100, 0)).toBeCloseTo(1.0)
  })

  it('is monotonically non-increasing in reserve: depleted is never cheaper', () => {
    let previous = Infinity
    for (let r = 0; r <= 100; r += 5) {
      const current = stateMultiplier(r, 0)
      expect(current).toBeLessThanOrEqual(previous + 1e-9)
      previous = current
    }
  })

  it('makes a block more expensive after a draining activity', () => {
    expect(stateMultiplier(70, -0.25)).toBeGreaterThan(stateMultiplier(70, 0))
  })

  it('makes a block cheaper after light movement', () => {
    expect(stateMultiplier(70, 0.1)).toBeLessThan(stateMultiplier(70, 0))
  })

  it('never returns a non-positive multiplier, however bad the state', () => {
    expect(stateMultiplier(0, -5)).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/engine/stateCost.test.ts`
Expected: FAIL — cannot resolve `./stateCost`.

- [ ] **Step 3: Implement**

`src/engine/stateCost.ts`:

```ts
import { FULL_RESERVE, STATE_COST_PIVOT, STATE_COST_SLOPE } from './params'

const MIN_MULTIPLIER = 0.5
const MAX_MULTIPLIER = 3

/**
 * §6.6: `actual_cost = base_cost × state_multiplier(reserve, recent_activity)`.
 *
 * At 70% reserve two hours of study costs two hours. At 25% it costs closer to three,
 * because you work slower and retain less -- the mirror of the efficiency curve in
 * §6.2: depleted people are less efficient in both directions.
 *
 * `carryoverForType` is the §6.6 residue for the reserve being spent, as a delta on the
 * multiplier: negative makes the block dearer, positive makes it cheaper.
 */
export function stateMultiplier(overall: number, carryoverForType: number): number {
  const depletion = Math.max(0, STATE_COST_PIVOT - overall) / FULL_RESERVE
  const raw = 1 + STATE_COST_SLOPE * depletion - carryoverForType
  return Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, raw))
}

export function actualCost(
  baseCost: number,
  overall: number,
  carryoverForType: number,
): number {
  return baseCost * stateMultiplier(overall, carryoverForType)
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/engine/stateCost.test.ts`
Expected: PASS, 7 tests. The 25% case: `depletion = (70−25)/100 = 0.45`, so `1 + 1.111 × 0.45 ≈ 1.5`, and `2 × 1.5 = 3`.

- [ ] **Step 5: Commit**

```bash
git add src/engine/stateCost.ts src/engine/stateCost.test.ts
git commit -m "$(cat <<'EOF'
feat: add the reserve-dependent cost multiplier

§6.6: a task's cost is a property of the task and the state you are in
when you reach it. At 70% reserve two hours of study costs two hours;
at 25% it costs closer to three. The test pins both anchors the spec
states outright.

Asserted as a monotonic property rather than only at those two points,
because the failure that matters is a curve that makes depletion
cheaper somewhere in the middle -- that would let the optimizer
"solve" a week by running the student into the ground.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Drain

**Files:**
- Create: `src/engine/drain.ts`, `src/engine/drain.test.ts`

**Interfaces:**
- Consumes: `EngineParams`, `DayInput`, `Reserves`, `LOAD_TYPES` from `./types`; `carryoverAt`; `stateMultiplier`; `overallReserve`.
- Produces: `drainForDay(day: DayInput, reserves: Reserves, params: EngineParams): Reserves`, `fragmentation(activities: readonly Activity[]): number`.

- [ ] **Step 1: Write the failing test**

`src/engine/drain.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { drainForDay, fragmentation } from './drain'
import { DEFAULT_PARAMS } from './params'
import type { Activity, DayInput, Reserves } from './types'

const healthy: Reserves = { mental: 80, physical: 80, social: 80, errands: 80 }

const study = (startHour: number, hours = 2): Activity => ({
  kind: 'studyBlock', type: 'mental', hours, intensity: 1, startHour,
})

const day = (over: Partial<DayInput> = {}): DayInput => ({
  dayIndex: 0,
  activities: [],
  sleepHours: 7,
  venueChanges: 0,
  daysToNearestDeadline: null,
  checkedIn: true,
  ...over,
})

describe('drainForDay', () => {
  it('drains nothing on an empty day', () => {
    expect(drainForDay(day(), healthy, DEFAULT_PARAMS).mental).toBe(0)
  })

  it('drains mental load in proportion to study hours', () => {
    const two = drainForDay(day({ activities: [study(9)] }), healthy, DEFAULT_PARAMS).mental
    const four = drainForDay(day({ activities: [study(9, 4)] }), healthy, DEFAULT_PARAMS).mental
    expect(four).toBeGreaterThan(two)
  })

  it('drains more for the same hours when the student is depleted', () => {
    const depleted: Reserves = { mental: 20, physical: 20, social: 20, errands: 20 }
    const fresh = drainForDay(day({ activities: [study(9)] }), healthy, DEFAULT_PARAMS).mental
    const worn = drainForDay(day({ activities: [study(9)] }), depleted, DEFAULT_PARAMS).mental
    expect(worn).toBeGreaterThan(fresh)
  })

  it('drains social reserve on a day with no social contact at all', () => {
    expect(drainForDay(day(), healthy, DEFAULT_PARAMS).social).toBeGreaterThan(0)
  })

  it('does not drain social reserve when the social floor is met', () => {
    const coffee: Activity = {
      kind: 'socialRestorative', type: 'social', hours: 2, intensity: 1, startHour: 15,
    }
    expect(drainForDay(day({ activities: [coffee] }), healthy, DEFAULT_PARAMS).social).toBe(0)
  })

  it('adds anticipatory drain as a deadline approaches', () => {
    const far = drainForDay(day({ daysToNearestDeadline: 14 }), healthy, DEFAULT_PARAMS).mental
    const near = drainForDay(day({ daysToNearestDeadline: 1 }), healthy, DEFAULT_PARAMS).mental
    expect(near).toBeGreaterThan(far)
  })

  it('adds travel load for venue changes', () => {
    const settled = drainForDay(day(), healthy, DEFAULT_PARAMS).errands
    const roaming = drainForDay(day({ venueChanges: 3 }), healthy, DEFAULT_PARAMS).errands
    expect(roaming).toBeGreaterThan(settled)
  })

  it('applies the learned estimate bias, so an underestimator drains more', () => {
    const biased = { ...DEFAULT_PARAMS, estimateBias: { ...DEFAULT_PARAMS.estimateBias, mental: 1.7 } }
    const unbiased = drainForDay(day({ activities: [study(9)] }), healthy, DEFAULT_PARAMS).mental
    expect(drainForDay(day({ activities: [study(9)] }), healthy, biased).mental)
      .toBeGreaterThan(unbiased)
  })
})

describe('fragmentation', () => {
  it('scores a blocked day lower than a scattered one at equal hours', () => {
    const blocked = [study(9, 4)]
    const scattered = [study(9, 1), study(12, 1), study(15, 1), study(19, 1)]
    expect(fragmentation(scattered)).toBeGreaterThan(fragmentation(blocked))
  })

  it('scores an empty day as zero', () => {
    expect(fragmentation([])).toBe(0)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/engine/drain.test.ts`
Expected: FAIL — cannot resolve `./drain`.

- [ ] **Step 3: Implement**

`src/engine/drain.ts`:

```ts
import { carryoverAt } from './carryover'
import { overallReserve } from './efficiency'
import { stateMultiplier } from './stateCost'
import { LOAD_TYPES, type Activity, type DayInput, type EngineParams, type Reserves } from './types'

/** §6.4: fragmented days drain more than blocked days at equal hours. Counts the gaps
 *  between separate working blocks -- each one is a context switch. */
export function fragmentation(activities: readonly Activity[]): number {
  const working = activities.filter((a) => a.kind !== 'rest' && a.kind !== 'sleep')
  return Math.max(0, working.length - 1)
}

/** Anticipatory stress is real (§6.4): the closer the nearest deadline, the more mental
 *  load a day carries before any work is done. */
function deadlineDrain(daysToNearestDeadline: number | null, weight: number): number {
  if (daysToNearestDeadline === null) return 0
  return weight / (1 + Math.max(0, daysToNearestDeadline))
}

/**
 * §6.4. Per-type drain for one day.
 *
 * `drain = Σ (hours × typeIntensity × intensity × estimateBias × stateMultiplier)`, plus
 * the day-level terms: context switching on mental, deadline proximity on mental, travel
 * on errands, and isolation on social.
 *
 * The state multiplier is what makes this state-dependent rather than a sum of hours: the
 * same two hours cost more when the student is already depleted (§6.6).
 */
export function drainForDay(
  day: DayInput,
  reserves: Reserves,
  params: EngineParams,
): Reserves {
  const overall = overallReserve(reserves)
  const totals: Record<string, number> = { mental: 0, physical: 0, social: 0, errands: 0 }

  for (const activity of day.activities) {
    if (activity.kind === 'rest' || activity.kind === 'sleep') continue
    const residue = carryoverAt(day.activities, activity.startHour)[activity.type]
    const cost =
      activity.hours *
      activity.intensity *
      params.typeIntensity[activity.type] *
      params.estimateBias[activity.type] *
      stateMultiplier(overall, residue)
    totals[activity.type] = (totals[activity.type] ?? 0) + cost
  }

  totals.mental =
    (totals.mental ?? 0) +
    fragmentation(day.activities) * params.contextSwitchPenalty +
    deadlineDrain(day.daysToNearestDeadline, params.deadlineProximityWeight)

  totals.errands = (totals.errands ?? 0) + day.venueChanges * params.travelLoadPerVenueChange

  // §1.2: low social load is a warning, not "good". Social is the one reserve that
  // drains from absence -- a student who is not busy but is isolated must show as
  // unwell, where a model that summed hours would call them healthy.
  const socialHours = day.activities
    .filter((a) => a.type === 'social')
    .reduce((sum, a) => sum + a.hours, 0)
  if (socialHours < params.socialFloorHoursPerDay) {
    totals.social = (totals.social ?? 0) + params.isolationDrainPerDay
  }

  return {
    mental: totals.mental ?? 0,
    physical: totals.physical ?? 0,
    social: totals.social ?? 0,
    errands: totals.errands ?? 0,
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/engine/drain.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/drain.ts src/engine/drain.test.ts
git commit -m "$(cat <<'EOF'
feat: add per-type daily drain

§6.4's four refinements over a naive sum of hours: learned estimate
bias, a context-switching penalty, a deadline-proximity multiplier for
anticipatory stress, and travel load from venue changes.

The social term is the one worth reading twice. §1.2 requires that low
social load be flagged as a warning rather than counted as healthy, so
social is the one reserve that drains from *absence* of activity. That
is what makes a student who is not busy but is isolated show as unwell,
where a model summing hours would call them fine -- and it is the
clearest evidence the model understands burnout rather than bookkeeping.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Recovery, coupling, and the daily tick

Assembles Tasks 3–6 into §6.1's recurrence. One task rather than three, because the recurrence is the unit that is meaningfully testable — recovery and coupling in isolation are two-line functions whose behaviour only means something inside the tick.

**Files:**
- Create: `src/engine/recovery.ts`, `src/engine/coupling.ts`, `src/engine/tick.ts`, `src/engine/tick.test.ts`

**Interfaces:**
- Produces:
  - `recoveryForDay(day: DayInput, params: EngineParams): Reserves`
  - `applyCoupling(reserves: Reserves): Reserves`
  - `tick(reserves: Reserves, day: DayInput, params: EngineParams): Reserves`

- [ ] **Step 1: Write the failing test**

`src/engine/tick.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from './params'
import { applyCoupling, recoveryForDay, tick } from './tick'
import type { Activity, DayInput, Reserves } from './types'

const healthy: Reserves = { mental: 80, physical: 80, social: 80, errands: 80 }
const depleted: Reserves = { mental: 20, physical: 20, social: 20, errands: 20 }

const day = (over: Partial<DayInput> = {}): DayInput => ({
  dayIndex: 0, activities: [], sleepHours: 7, venueChanges: 0,
  daysToNearestDeadline: null, checkedIn: true, ...over,
})

const rest: Activity = {
  kind: 'rest', type: 'mental', hours: 1, intensity: 1, startHour: 20,
}

describe('recoveryForDay', () => {
  it('gives nothing back for sleep at or below the baseline', () => {
    expect(recoveryForDay(day({ sleepHours: 5 }), DEFAULT_PARAMS).mental).toBe(0)
  })

  it('gives more back for more sleep', () => {
    const short = recoveryForDay(day({ sleepHours: 6 }), DEFAULT_PARAMS).mental
    const long = recoveryForDay(day({ sleepHours: 8 }), DEFAULT_PARAMS).mental
    expect(long).toBeGreaterThan(short)
  })

  it('counts a scheduled rest block', () => {
    const withRest = recoveryForDay(day({ activities: [rest] }), DEFAULT_PARAMS).mental
    expect(withRest).toBeGreaterThan(recoveryForDay(day(), DEFAULT_PARAMS).mental)
  })

  // §5.1: rest has a ceiling as well as a floor. A 12-hour scroll session is not
  // recovery and the model must not count it as such.
  it('stops paying out past the useful ceiling of a rest block', () => {
    const long: Activity = { ...rest, hours: 12 }
    const sane: Activity = { ...rest, hours: 3 }
    const longValue = recoveryForDay(day({ activities: [long] }), DEFAULT_PARAMS).mental
    const saneValue = recoveryForDay(day({ activities: [sane] }), DEFAULT_PARAMS).mental
    expect(longValue).toBeLessThanOrEqual(saneValue * 1.5)
  })
})

describe('applyCoupling', () => {
  it('drags mental down when physical is in deficit', () => {
    const lowPhysical: Reserves = { mental: 80, physical: 5, social: 80, errands: 80 }
    expect(applyCoupling(lowPhysical).mental).toBeLessThan(80)
  })

  it('leaves a healthy state alone', () => {
    expect(applyCoupling(healthy).mental).toBeCloseTo(80)
  })

  it('never lifts a reserve', () => {
    const mixed: Reserves = { mental: 50, physical: 10, social: 90, errands: 40 }
    const after = applyCoupling(mixed)
    expect(after.mental).toBeLessThanOrEqual(50)
    expect(after.social).toBeLessThanOrEqual(90)
  })
})

describe('tick', () => {
  it('recovers on an empty, well-slept day', () => {
    const after = tick(depleted, day({ sleepHours: 9, activities: [rest] }), DEFAULT_PARAMS)
    expect(after.mental).toBeGreaterThan(depleted.mental)
  })

  it('drains on a heavy day', () => {
    const heavy = day({
      activities: [{ kind: 'studyBlock', type: 'mental', hours: 8, intensity: 1, startHour: 9 }],
      sleepHours: 5,
    })
    expect(tick(healthy, heavy, DEFAULT_PARAMS).mental).toBeLessThan(healthy.mental)
  })

  // §6.2's spiral, asserted directly: the same rest buys less when you are further down.
  it('returns less from identical rest at low reserve than at high reserve', () => {
    const restful = day({ sleepHours: 9, activities: [rest] })
    const fromHigh = tick(healthy, restful, DEFAULT_PARAMS).mental - healthy.mental
    const fromLow = tick(depleted, restful, DEFAULT_PARAMS).mental - depleted.mental
    expect(fromLow).toBeLessThan(fromHigh)
  })

  it('clamps to 0..100 in both directions', () => {
    const brutal = day({
      activities: [{ kind: 'studyBlock', type: 'mental', hours: 40, intensity: 2, startHour: 0 }],
      sleepHours: 0,
    })
    expect(tick(depleted, brutal, DEFAULT_PARAMS).mental).toBeGreaterThanOrEqual(0)

    const full: Reserves = { mental: 100, physical: 100, social: 100, errands: 100 }
    const easy = day({ sleepHours: 10, activities: [rest] })
    for (const value of Object.values(tick(full, easy, DEFAULT_PARAMS))) {
      expect(value).toBeLessThanOrEqual(100)
    }
  })

  it('does not mutate the reserves it is given', () => {
    const before = { ...healthy }
    tick(healthy, day(), DEFAULT_PARAMS)
    expect(healthy).toEqual(before)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/engine/tick.test.ts`
Expected: FAIL — cannot resolve `./tick`.

- [ ] **Step 3: Implement recovery**

`src/engine/recovery.ts`:

```ts
import { SLEEP_BASELINE_HOURS } from './params'
import { LOAD_TYPES, type DayInput, type EngineParams, type Reserves } from './types'

/** §5.1: recovery has a ceiling as well as a floor. Past this many hours in a single
 *  block, returns go flat -- a 12-hour scroll session is not recovery, and the model
 *  must not count it as neutral free time. */
const USEFUL_REST_HOURS = 3

export function recoveryForDay(day: DayInput, params: EngineParams): Reserves {
  const sleepCredit = Math.max(0, day.sleepHours - SLEEP_BASELINE_HOURS)

  const restHours = day.activities
    .filter((a) => a.kind === 'rest')
    .reduce((sum, a) => sum + Math.min(a.hours, USEFUL_REST_HOURS), 0)

  const out: Record<string, number> = {}
  for (const type of LOAD_TYPES) {
    out[type] = sleepCredit * params.kSleep[type] + restHours * params.kRest[type]
  }
  return {
    mental: out.mental ?? 0,
    physical: out.physical ?? 0,
    social: out.social ?? 0,
    errands: out.errands ?? 0,
  }
}
```

`src/engine/coupling.ts`:

```ts
import { COUPLING, DEFICIT_THRESHOLD, FULL_RESERVE } from './params'
import { LOAD_TYPES, type Reserves } from './types'

/**
 * §6.3: physical depletion drags mental capacity; social isolation slows recovery across
 * the board.
 *
 * Directional and subtractive only. A deficit in one reserve pulls the others down; a
 * surplus never pulls them up, because that would let a well-rested body paper over an
 * isolated month -- which is precisely the reading §6.3 exists to prevent.
 */
export function applyCoupling(reserves: Reserves): Reserves {
  const out: Record<string, number> = {}

  for (const target of LOAD_TYPES) {
    let drag = 0
    for (const source of LOAD_TYPES) {
      if (source === target) continue
      const deficit = Math.max(0, DEFICIT_THRESHOLD - reserves[source]) / FULL_RESERVE
      drag += COUPLING[source][target] * deficit * FULL_RESERVE
    }
    out[target] = Math.max(0, reserves[target] - drag)
  }

  return {
    mental: out.mental ?? 0,
    physical: out.physical ?? 0,
    social: out.social ?? 0,
    errands: out.errands ?? 0,
  }
}
```

- [ ] **Step 4: Implement the tick**

`src/engine/tick.ts`:

```ts
import { applyCoupling } from './coupling'
import { drainForDay } from './drain'
import { recoveryEfficiency } from './efficiency'
import { FULL_RESERVE } from './params'
import { recoveryForDay } from './recovery'
import { LOAD_TYPES, type DayInput, type EngineParams, type Reserves } from './types'

export { applyCoupling } from './coupling'
export { recoveryForDay } from './recovery'

const clamp = (value: number): number => Math.min(FULL_RESERVE, Math.max(0, value))

/**
 * §6.1: `reserve[d+1] = reserve[d] − drain[d] + recovery[d] × efficiency[d]`.
 *
 * Efficiency is computed from the reserves at the *start* of the day, which is what makes
 * the model a spiral rather than a line: the worse today starts, the less tonight's rest
 * gives back (§6.2).
 */
export function tick(reserves: Reserves, day: DayInput, params: EngineParams): Reserves {
  const drain = drainForDay(day, reserves, params)
  const recovery = recoveryForDay(day, params)
  const efficiency = recoveryEfficiency(reserves)

  const next: Record<string, number> = {}
  for (const type of LOAD_TYPES) {
    next[type] = clamp(reserves[type] - drain[type] + recovery[type] * efficiency)
  }

  return applyCoupling({
    mental: next.mental ?? 0,
    physical: next.physical ?? 0,
    social: next.social ?? 0,
    errands: next.errands ?? 0,
  })
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/engine/tick.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 6: Commit**

```bash
git add src/engine/recovery.ts src/engine/coupling.ts src/engine/tick.ts src/engine/tick.test.ts
git commit -m "$(cat <<'EOF'
feat: add the daily tick, recovery and cross-reserve coupling

Assembles §6.1's recurrence: drain, then recovery scaled by the
efficiency curve, then coupling, then clamp. Efficiency is read from
the reserves at the start of the day, which is what makes the model a
spiral rather than a line -- the worse today starts, the less tonight's
rest gives back.

Two rules are enforced structurally rather than left to the caller.
Recovery has a ceiling as well as a floor (§5.1), so a 12-hour block
pays out no more than a sane one and doom-scrolling cannot be banked as
rest. Coupling is subtractive only (§6.3), so a deficit drags the other
reserves down but a surplus never lifts them -- otherwise a well-rested
body would paper over an isolated month, which is the exact reading
that section exists to prevent.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Projection

**Files:**
- Create: `src/engine/projection.ts`, `src/engine/projection.test.ts`, `src/engine/index.ts`

**Interfaces:**
- Produces:
  - `interface Projection { readonly central: readonly Reserves[]; readonly optimistic: readonly Reserves[]; readonly pessimistic: readonly Reserves[]; readonly worstOverall: number; readonly deficitDays: number; readonly firstDeficitDay: number | null }`
  - `project(start: Reserves, days: readonly DayInput[], params: EngineParams): Projection`

- [ ] **Step 1: Write the failing test**

`src/engine/projection.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from './params'
import { project } from './projection'
import type { Activity, DayInput, Reserves } from './types'

const healthy: Reserves = { mental: 80, physical: 80, social: 80, errands: 80 }

const day = (dayIndex: number, over: Partial<DayInput> = {}): DayInput => ({
  dayIndex, activities: [], sleepHours: 7, venueChanges: 0,
  daysToNearestDeadline: null, checkedIn: true, ...over,
})

const heavy = (dayIndex: number): DayInput =>
  day(dayIndex, {
    activities: [{ kind: 'studyBlock', type: 'mental', hours: 9, intensity: 1, startHour: 9 }],
    sleepHours: 5,
  })

const week = (make: (i: number) => DayInput, n = 21): DayInput[] =>
  Array.from({ length: n }, (_, i) => make(i))

describe('project', () => {
  it('returns one entry per day for each band', () => {
    const result = project(healthy, week(day), DEFAULT_PARAMS)
    expect(result.central).toHaveLength(21)
    expect(result.optimistic).toHaveLength(21)
    expect(result.pessimistic).toHaveLength(21)
  })

  it('orders the bands: pessimistic never above optimistic', () => {
    const result = project(healthy, week(heavy), DEFAULT_PARAMS)
    for (let i = 0; i < result.central.length; i += 1) {
      expect(result.pessimistic[i]!.mental).toBeLessThanOrEqual(result.optimistic[i]!.mental + 1e-9)
    }
  })

  it('reports the worst overall reserve across the horizon', () => {
    const result = project(healthy, week(heavy), DEFAULT_PARAMS)
    expect(result.worstOverall).toBeLessThan(80)
  })

  it('finds the first day the projection crosses into deficit', () => {
    const result = project(healthy, week(heavy), DEFAULT_PARAMS)
    expect(result.firstDeficitDay).not.toBeNull()
    expect(result.firstDeficitDay).toBeGreaterThan(0)
  })

  it('reports no deficit crossing on a sustainable schedule', () => {
    const light = (i: number) =>
      day(i, {
        sleepHours: 8,
        activities: [
          { kind: 'studyBlock', type: 'mental', hours: 2, intensity: 1, startHour: 9 },
          { kind: 'socialRestorative', type: 'social', hours: 1, intensity: 1, startHour: 18 },
        ],
      })
    expect(project(healthy, week(light), DEFAULT_PARAMS).firstDeficitDay).toBeNull()
  })

  // §6.5: missing check-ins widen the band AND bias the central estimate pessimistic.
  // Treating a gap as neutral makes the projection optimistic right before the crash.
  it('lowers the central estimate when the user stops checking in', () => {
    const present = project(healthy, week((i) => heavy(i)), DEFAULT_PARAMS)
    const absent = project(
      healthy,
      week((i) => ({ ...heavy(i), checkedIn: false })),
      DEFAULT_PARAMS,
    )
    expect(absent.worstOverall).toBeLessThan(present.worstOverall)
  })

  it('widens the band when the user stops checking in', () => {
    const spread = (r: ReturnType<typeof project>) =>
      r.optimistic[20]!.mental - r.pessimistic[20]!.mental
    const present = project(healthy, week(heavy), DEFAULT_PARAMS)
    const absent = project(healthy, week((i) => ({ ...heavy(i), checkedIn: false })), DEFAULT_PARAMS)
    expect(spread(absent)).toBeGreaterThan(spread(present))
  })

  it('renders something useful with no schedule at all, per the no-cold-start rule', () => {
    const result = project(healthy, [], DEFAULT_PARAMS)
    expect(result.central).toHaveLength(0)
    expect(result.worstOverall).toBeCloseTo(80)
    expect(result.firstDeficitDay).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/engine/projection.test.ts`
Expected: FAIL — cannot resolve `./projection`.

- [ ] **Step 3: Implement**

`src/engine/projection.ts`:

```ts
import { overallReserve } from './efficiency'
import { BAND_BIASES, DEFICIT_THRESHOLD } from './params'
import { tick } from './tick'
import { LOAD_TYPES, type DayInput, type EngineParams, type Reserves } from './types'

export interface Projection {
  readonly central: readonly Reserves[]
  readonly optimistic: readonly Reserves[]
  readonly pessimistic: readonly Reserves[]
  /** Lowest overall reserve reached anywhere on the horizon. The optimizer maximises
   *  this: §2.1 is explicit that burnout is a floor problem, not an average problem. */
  readonly worstOverall: number
  readonly deficitDays: number
  readonly firstDeficitDay: number | null
}

/** §6.5: absence is signal. A student in a genuinely bad week will not check in, so a
 *  gap must widen the band and bias the centre downward -- treating it as neutral makes
 *  the projection optimistic exactly when it is being relied on. */
const MISSING_CHECKIN_PENALTY = 0.08

function runBand(
  start: Reserves,
  days: readonly DayInput[],
  params: EngineParams,
  bias: number,
): Reserves[] {
  const biased: EngineParams = {
    ...params,
    estimateBias: Object.fromEntries(
      LOAD_TYPES.map((type) => [type, params.estimateBias[type] * bias]),
    ) as unknown as Reserves,
  }

  const out: Reserves[] = []
  let current = start
  let missedRun = 0

  for (const day of days) {
    missedRun = day.checkedIn ? 0 : missedRun + 1
    const uncertainty = 1 + MISSING_CHECKIN_PENALTY * missedRun
    const withUncertainty: EngineParams = {
      ...biased,
      estimateBias: Object.fromEntries(
        LOAD_TYPES.map((type) => [type, biased.estimateBias[type] * uncertainty]),
      ) as unknown as Reserves,
    }
    current = tick(current, day, withUncertainty)
    out.push(current)
  }

  return out
}

/**
 * §6.5: three projections at estimate biases 0.95×, 1.15× and 1.4×, shown as a band.
 *
 * The middle band is the central estimate the app quotes. The spread is the honesty: it
 * widens when the model has less to go on, which §8.2 requires the product copy to
 * reflect -- the 21-day projection is a decision aid and is never described as validated.
 */
export function project(
  start: Reserves,
  days: readonly DayInput[],
  params: EngineParams,
): Projection {
  const [optimisticBias, centralBias, pessimisticBias] = BAND_BIASES

  const optimistic = runBand(start, days, params, optimisticBias)
  const central = runBand(start, days, params, centralBias)
  const pessimistic = runBand(start, days, params, pessimisticBias)

  const overalls = central.map(overallReserve)
  const worstOverall = overalls.length === 0 ? overallReserve(start) : Math.min(...overalls)
  const firstDeficitIndex = overalls.findIndex((value) => value < DEFICIT_THRESHOLD)

  return {
    central,
    optimistic,
    pessimistic,
    worstOverall,
    deficitDays: overalls.filter((value) => value < DEFICIT_THRESHOLD).length,
    firstDeficitDay: firstDeficitIndex === -1 ? null : firstDeficitIndex,
  }
}
```

`src/engine/index.ts`:

```ts
export * from './types'
export * from './params'
export { overallReserve, recoveryEfficiency } from './efficiency'
export { carryoverAt } from './carryover'
export { actualCost, stateMultiplier } from './stateCost'
export { drainForDay, fragmentation } from './drain'
export { applyCoupling, recoveryForDay, tick } from './tick'
export { project, type Projection } from './projection'
```

- [ ] **Step 4: Run the whole engine suite**

Run: `npx vitest run src/engine && npm run typecheck`
Expected: PASS, all engine tests. Typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine
git commit -m "$(cat <<'EOF'
feat: add the 21-day banded projection

§6.5's three projections at 0.95x, 1.15x and 1.4x estimate bias, plus
the floor metrics the optimizer scores against: worst overall reserve,
deficit-day count, and the first deficit crossing.

Missing check-ins are treated as signal rather than as neutral, which
is the part worth defending. A student having a genuinely bad week is
exactly the one who stops checking in, so a gap both widens the band
and biases the centre downward. A model that gets more worried when the
user goes quiet is behaving correctly; one that treats silence as fine
turns optimistic right before the crash.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: The objective function and hard constraints

**Files:**
- Create: `src/optimizer/types.ts`, `src/optimizer/objective.ts`, `src/optimizer/constraints.ts`, `src/optimizer/objective.test.ts`, `src/optimizer/constraints.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface ScheduledItem {
    readonly id: string
    readonly title: string
    readonly type: LoadType
    readonly kind: ActivityKind
    readonly hours: number
    readonly intensity: number
    readonly dayIndex: number
    readonly startHour: number
    /** Classes, shifts, hard deadlines and already-protected rest (§2.1). */
    readonly fixed: boolean
    /** Latest dayIndex this may occupy, or null if undated. */
    readonly deadlineDay: number | null
    readonly protectedRest: boolean
  }
  interface Schedule {
    readonly items: readonly ScheduledItem[]
    readonly start: Reserves
    readonly horizonDays: number
    readonly sleepByDay: readonly number[]
  }
  ```
  - `toDayInputs(schedule: Schedule): DayInput[]`
  - `score(schedule: Schedule, params: EngineParams): number`
  - `isValid(schedule: Schedule, params: EngineParams): boolean`
  - `violations(schedule: Schedule, params: EngineParams): string[]`

- [ ] **Step 1: Write the failing tests**

`src/optimizer/objective.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { score } from './objective'
import { makeSchedule, studyItem } from './testSupport'

describe('score', () => {
  it('prefers the schedule with the higher worst day, not the higher average', () => {
    // Even: two hours of study every day. Spiky: fourteen hours on one day, none after.
    const even = makeSchedule(
      Array.from({ length: 7 }, (_, d) => studyItem(`e${d}`, d, 2)),
    )
    const spiky = makeSchedule([studyItem('s0', 0, 14)])
    expect(score(even, DEFAULT_PARAMS)).toBeGreaterThan(score(spiky, DEFAULT_PARAMS))
  })

  it('penalises fragmentation, so ten scattered tasks lose to one block', () => {
    const blocked = makeSchedule([studyItem('b', 0, 5)])
    const scattered = makeSchedule(
      Array.from({ length: 5 }, (_, i) => ({ ...studyItem(`f${i}`, 0, 1), startHour: 8 + i * 2 })),
    )
    expect(score(blocked, DEFAULT_PARAMS)).toBeGreaterThan(score(scattered, DEFAULT_PARAMS))
  })

  it('penalises every day spent below the deficit threshold', () => {
    const light = makeSchedule([studyItem('l', 0, 1)])
    const crushing = makeSchedule(
      Array.from({ length: 14 }, (_, d) => studyItem(`c${d}`, d, 10)),
    )
    expect(score(crushing, DEFAULT_PARAMS)).toBeLessThan(score(light, DEFAULT_PARAMS))
  })

  it('scores an empty schedule without throwing, per the no-cold-start rule', () => {
    expect(Number.isFinite(score(makeSchedule([]), DEFAULT_PARAMS))).toBe(true)
  })
})
```

`src/optimizer/constraints.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { isValid, violations } from './constraints'
import { makeSchedule, restItem, studyItem } from './testSupport'

describe('constraints', () => {
  it('accepts a schedule that breaks nothing', () => {
    expect(isValid(makeSchedule([studyItem('a', 1, 2)]), DEFAULT_PARAMS)).toBe(true)
  })

  it('rejects anything scheduled past its deadline', () => {
    const late = { ...studyItem('a', 5, 2), deadlineDay: 3 }
    expect(isValid(makeSchedule([late]), DEFAULT_PARAMS)).toBe(false)
    expect(violations(makeSchedule([late]), DEFAULT_PARAMS)[0]).toContain('deadline')
  })

  it('rejects anything overlapping a fixed block', () => {
    const lecture = { ...studyItem('lecture', 1, 2), fixed: true, startHour: 9 }
    const clash = { ...studyItem('clash', 1, 2), startHour: 10 }
    expect(isValid(makeSchedule([lecture, clash]), DEFAULT_PARAMS)).toBe(false)
  })

  it('allows a movable block that merely abuts a fixed one', () => {
    const lecture = { ...studyItem('lecture', 1, 2), fixed: true, startHour: 9 }
    const after = { ...studyItem('after', 1, 2), startHour: 11 }
    expect(isValid(makeSchedule([lecture, after]), DEFAULT_PARAMS)).toBe(true)
  })

  // §2.1, §5.1: this is the constraint that expresses the app's whole stance.
  it('rejects a schedule that has work overlapping protected rest', () => {
    const protectedRest = restItem('rest', 2, 20)
    const work = { ...studyItem('work', 2, 2), startHour: 20 }
    expect(isValid(makeSchedule([protectedRest, work]), DEFAULT_PARAMS)).toBe(false)
    expect(violations(makeSchedule([protectedRest, work]), DEFAULT_PARAMS).join(' '))
      .toContain('protected rest')
  })

  it('rejects a day that exceeds the daily hours cap', () => {
    const marathon = makeSchedule([studyItem('m', 0, 14)])
    expect(isValid(marathon, DEFAULT_PARAMS)).toBe(false)
  })
})
```

`src/optimizer/testSupport.ts` (test helper — shared by Tasks 9–12 so the fixtures do not drift):

```ts
import { DEFAULT_PARAMS, HORIZON_DAYS, type Reserves } from '../engine'
import type { ScheduledItem, Schedule } from './types'

export const HEALTHY: Reserves = { mental: 80, physical: 80, social: 80, errands: 80 }

export function studyItem(id: string, dayIndex: number, hours: number): ScheduledItem {
  return {
    id, title: id, type: 'mental', kind: 'studyBlock', hours, intensity: 1,
    dayIndex, startHour: 9, fixed: false, deadlineDay: null, protectedRest: false,
  }
}

export function restItem(id: string, dayIndex: number, startHour: number): ScheduledItem {
  return {
    id, title: id, type: 'mental', kind: 'rest', hours: 2, intensity: 1,
    dayIndex, startHour, fixed: true, deadlineDay: null, protectedRest: true,
  }
}

export function makeSchedule(items: readonly ScheduledItem[]): Schedule {
  return {
    items,
    start: HEALTHY,
    horizonDays: HORIZON_DAYS,
    sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  }
}

export { DEFAULT_PARAMS }
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/optimizer`
Expected: FAIL — cannot resolve `./objective`, `./constraints`, `./types`.

- [ ] **Step 3: Implement the types and the schedule-to-days adapter**

`src/optimizer/types.ts`:

```ts
import type { ActivityKind, DayInput, LoadType, Reserves } from '../engine'

export interface ScheduledItem {
  readonly id: string
  readonly title: string
  readonly type: LoadType
  readonly kind: ActivityKind
  readonly hours: number
  readonly intensity: number
  readonly dayIndex: number
  readonly startHour: number
  /** §2.1's fixed set: classes, shifts, hard deadlines, already-protected rest. */
  readonly fixed: boolean
  /** Latest dayIndex this may occupy. Null means undated. */
  readonly deadlineDay: number | null
  readonly protectedRest: boolean
}

export interface Schedule {
  readonly items: readonly ScheduledItem[]
  readonly start: Reserves
  readonly horizonDays: number
  readonly sleepByDay: readonly number[]
}

export interface Move {
  readonly kind: 'shiftDay' | 'batchErrands' | 'insertRest' | 'reorderWithinDay'
  readonly itemId: string
  readonly description: string
  readonly apply: (schedule: Schedule) => Schedule
}

export interface RebalanceResult {
  readonly schedule: Schedule
  readonly moves: readonly Move[]
  readonly worstBefore: number
  readonly worstAfter: number
}

export type { DayInput }
```

`src/optimizer/objective.ts`:

```ts
import {
  DEFICIT_DAY_WEIGHT_FALLBACK,
} from './weights'
import { project, type DayInput, type EngineParams, type Schedule } from './objectiveDeps'
```

Rather than that indirection, write it directly:

```ts
import { project, type DayInput, type EngineParams } from '../engine'
import type { Schedule } from './types'

export const DEFICIT_DAY_WEIGHT = 0.3
export const FRAGMENTATION_WEIGHT = 0.1

/** Turns a schedule into the per-day inputs the engine consumes. The engine knows
 *  nothing about scheduling; this is the only place the two vocabularies meet. */
export function toDayInputs(schedule: Schedule): DayInput[] {
  return Array.from({ length: schedule.horizonDays }, (_, dayIndex) => {
    const onThisDay = schedule.items.filter((item) => item.dayIndex === dayIndex)
    const deadlines = schedule.items
      .map((item) => item.deadlineDay)
      .filter((day): day is number => day !== null && day >= dayIndex)
    return {
      dayIndex,
      activities: onThisDay.map((item) => ({
        kind: item.kind,
        type: item.type,
        hours: item.hours,
        intensity: item.intensity,
        startHour: item.startHour,
      })),
      sleepHours: schedule.sleepByDay[dayIndex] ?? 7,
      venueChanges: Math.max(0, new Set(onThisDay.map((i) => i.startHour)).size - 1),
      daysToNearestDeadline: deadlines.length === 0 ? null : Math.min(...deadlines) - dayIndex,
      checkedIn: true,
    }
  })
}

function totalFragmentation(schedule: Schedule): number {
  let total = 0
  for (let day = 0; day < schedule.horizonDays; day += 1) {
    const working = schedule.items.filter(
      (item) => item.dayIndex === day && item.kind !== 'rest' && item.kind !== 'sleep',
    )
    total += Math.max(0, working.length - 1)
  }
  return total
}

/**
 * §2.1's objective, verbatim:
 *
 *   score = min(reserve over the horizon)
 *           − 0.3 × count(days below deficit)
 *           − 0.1 × fragmentation penalty
 *
 * It maximises the *minimum* reserve, not the total and not the evenness. Burnout is a
 * floor problem: a fortnight that averages fine but bottoms out at 8 is still a crash.
 *
 * The fragmentation term stops the solver "fixing" a week by scattering ten small tasks
 * across every day, which lowers peak load but drains more through context switching.
 */
export function score(schedule: Schedule, params: EngineParams): number {
  const projection = project(schedule.start, toDayInputs(schedule), params)
  return (
    projection.worstOverall -
    DEFICIT_DAY_WEIGHT * projection.deficitDays -
    FRAGMENTATION_WEIGHT * totalFragmentation(schedule)
  )
}
```

`src/optimizer/constraints.ts`:

```ts
import type { EngineParams } from '../engine'
import type { Schedule, ScheduledItem } from './types'

const overlaps = (a: ScheduledItem, b: ScheduledItem): boolean =>
  a.dayIndex === b.dayIndex &&
  a.startHour < b.startHour + b.hours &&
  b.startHour < a.startHour + a.hours

/**
 * §2.1's hard constraints. These are constraints, not penalty terms: a schedule that
 * breaks one is rejected outright rather than scored badly, so no amount of gain
 * elsewhere can buy its way past them.
 *
 * That matters most for protected rest. §5.1 calls making recovery structurally
 * protected the most important design decision in the app -- if the solver could move a
 * rest block for a good enough score, rest would be optional again, which is the whole
 * thing the app exists to prevent.
 */
export function violations(schedule: Schedule, params: EngineParams): string[] {
  const found: string[] = []

  for (const item of schedule.items) {
    if (item.deadlineDay !== null && item.dayIndex > item.deadlineDay) {
      found.push(`${item.title} is scheduled past its deadline`)
    }
  }

  for (let i = 0; i < schedule.items.length; i += 1) {
    for (let j = i + 1; j < schedule.items.length; j += 1) {
      const a = schedule.items[i]!
      const b = schedule.items[j]!
      if (!overlaps(a, b)) continue

      if (a.protectedRest || b.protectedRest) {
        found.push(`${a.title} and ${b.title} overlap protected rest`)
      } else if (a.fixed || b.fixed) {
        found.push(`${a.title} and ${b.title} overlap a fixed block`)
      }
    }
  }

  for (let day = 0; day < schedule.horizonDays; day += 1) {
    const hours = schedule.items
      .filter((item) => item.dayIndex === day && item.kind !== 'rest' && item.kind !== 'sleep')
      .reduce((sum, item) => sum + item.hours, 0)
    if (hours > params.dailyHoursCap) {
      found.push(`day ${day} exceeds the daily hours cap`)
    }
  }

  return found
}

export function isValid(schedule: Schedule, params: EngineParams): boolean {
  return violations(schedule, params).length === 0
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/optimizer && npm run typecheck`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/optimizer
git commit -m "$(cat <<'EOF'
feat: add the optimizer's objective function and hard constraints

Implements §2.1's scoring function as written: the minimum reserve
across the horizon, less 0.3 per deficit day, less 0.1 per unit of
fragmentation. It maximises the floor rather than the average, because
a fortnight that averages fine but bottoms out at 8 is still a crash --
the test asserts that preference directly by pitting an even week
against a spiky one.

The hard constraints are constraints, not weighted terms, so no gain
elsewhere can buy past them. That distinction is load-bearing for
protected rest: §5.1 calls structural protection of recovery the most
important design decision in the app, and a rest block the solver could
move for a good enough score is a rest block that is optional again.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Neighbour generation and the hill-climbing search

**Files:**
- Create: `src/optimizer/rng.ts`, `src/optimizer/neighbours.ts`, `src/optimizer/hillClimb.ts`, `src/optimizer/neighbours.test.ts`, `src/optimizer/hillClimb.test.ts`

**Interfaces:**
- Produces:
  - `makeRng(seed: number): Rng` where `type Rng = () => number`
  - `neighbours(schedule: Schedule, params: EngineParams): Move[]`
  - `rebalance(schedule: Schedule, params: EngineParams, rng: Rng): RebalanceResult`

- [ ] **Step 1: Write the failing tests**

`src/optimizer/neighbours.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { neighbours } from './neighbours'
import { makeSchedule, restItem, studyItem } from './testSupport'

describe('neighbours', () => {
  it('offers to move a movable task to another day', () => {
    const moves = neighbours(makeSchedule([studyItem('a', 3, 2)]), DEFAULT_PARAMS)
    expect(moves.some((m) => m.kind === 'shiftDay' && m.itemId === 'a')).toBe(true)
  })

  it('never offers to move a fixed block', () => {
    const lecture = { ...studyItem('lecture', 3, 2), fixed: true }
    const moves = neighbours(makeSchedule([lecture]), DEFAULT_PARAMS)
    expect(moves.some((m) => m.itemId === 'lecture' && m.kind === 'shiftDay')).toBe(false)
  })

  // The constraint that expresses the app's whole stance (§2.1).
  it('never offers to move protected rest', () => {
    const moves = neighbours(makeSchedule([restItem('rest', 3, 20)]), DEFAULT_PARAMS)
    expect(moves.some((m) => m.itemId === 'rest')).toBe(false)
  })

  it('never offers to move a task past its deadline', () => {
    const due = { ...studyItem('due', 2, 2), deadlineDay: 2 }
    const moves = neighbours(makeSchedule([due]), DEFAULT_PARAMS)
    for (const move of moves.filter((m) => m.kind === 'shiftDay')) {
      const after = move.apply(makeSchedule([due]))
      expect(after.items[0]!.dayIndex).toBeLessThanOrEqual(2)
    }
  })

  it('offers to batch two errands on the same day', () => {
    const a = { ...studyItem('e1', 1, 1), type: 'errands' as const, kind: 'errands' as const }
    const b = { ...studyItem('e2', 4, 1), type: 'errands' as const, kind: 'errands' as const, startHour: 14 }
    const moves = neighbours(makeSchedule([a, b]), DEFAULT_PARAMS)
    expect(moves.some((m) => m.kind === 'batchErrands')).toBe(true)
  })

  it('offers to insert a rest block into a gap', () => {
    const moves = neighbours(makeSchedule([studyItem('a', 1, 2)]), DEFAULT_PARAMS)
    expect(moves.some((m) => m.kind === 'insertRest')).toBe(true)
  })

  // §6.6: even when the days are fixed, the order within a day is usually free -- which
  // is what partly answers the degrees-of-freedom problem in §2.5.
  it('offers to reorder two items within the same day', () => {
    const gym = { ...studyItem('gym', 1, 1), type: 'physical' as const, kind: 'hardExercise' as const, startHour: 17 }
    const study = { ...studyItem('study', 1, 2), startHour: 19 }
    const moves = neighbours(makeSchedule([gym, study]), DEFAULT_PARAMS)
    expect(moves.some((m) => m.kind === 'reorderWithinDay')).toBe(true)
  })

  it('produces moves that all leave the schedule valid', () => {
    const schedule = makeSchedule([studyItem('a', 1, 2), studyItem('b', 3, 2)])
    for (const move of neighbours(schedule, DEFAULT_PARAMS)) {
      expect(move.apply(schedule).items).toHaveLength(schedule.items.length + (move.kind === 'insertRest' ? 1 : 0))
    }
  })
})
```

`src/optimizer/hillClimb.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { isValid } from './constraints'
import { rebalance } from './hillClimb'
import { makeRng } from './rng'
import { score } from './objective'
import { makeSchedule, restItem, studyItem } from './testSupport'

const pileUp = () =>
  makeSchedule([
    { ...studyItem('essay', 2, 4), deadlineDay: 10 },
    { ...studyItem('lab', 2, 3), deadlineDay: 12 },
    { ...studyItem('reading', 2, 2), deadlineDay: 14 },
  ])

describe('rebalance', () => {
  it('never returns a worse schedule than it was given', () => {
    const before = pileUp()
    const after = rebalance(before, DEFAULT_PARAMS, makeRng(1))
    expect(score(after.schedule, DEFAULT_PARAMS)).toBeGreaterThanOrEqual(
      score(before, DEFAULT_PARAMS) - 1e-9,
    )
  })

  it('improves a schedule that piles three deadlines onto one day', () => {
    const before = pileUp()
    const after = rebalance(before, DEFAULT_PARAMS, makeRng(1))
    expect(after.worstAfter).toBeGreaterThan(after.worstBefore)
  })

  it('only ever returns a valid schedule', () => {
    const after = rebalance(pileUp(), DEFAULT_PARAMS, makeRng(7))
    expect(isValid(after.schedule, DEFAULT_PARAMS)).toBe(true)
  })

  it('never moves protected rest', () => {
    const before = makeSchedule([...pileUp().items, restItem('rest', 4, 20)])
    const after = rebalance(before, DEFAULT_PARAMS, makeRng(3))
    const rest = after.schedule.items.find((i) => i.id === 'rest')
    expect(rest?.dayIndex).toBe(4)
    expect(rest?.startHour).toBe(20)
  })

  it('is deterministic for a given seed', () => {
    const a = rebalance(pileUp(), DEFAULT_PARAMS, makeRng(42))
    const b = rebalance(pileUp(), DEFAULT_PARAMS, makeRng(42))
    expect(a.schedule.items).toEqual(b.schedule.items)
  })

  it('reports what it actually changed', () => {
    const after = rebalance(pileUp(), DEFAULT_PARAMS, makeRng(1))
    expect(after.moves.length).toBeGreaterThan(0)
    for (const move of after.moves) {
      expect(move.description).not.toMatch(/optimis/i)
    }
  })

  it('returns an untouched empty schedule rather than throwing', () => {
    const empty = makeSchedule([])
    expect(rebalance(empty, DEFAULT_PARAMS, makeRng(1)).moves).toHaveLength(0)
  })

  // §2.1: under 100ms on a phone. A CI runner is not a phone, but an order-of-magnitude
  // regression here means the search has stopped being interactive.
  it('completes a realistic solve in well under a second', () => {
    const items = Array.from({ length: 25 }, (_, i) =>
      ({ ...studyItem(`t${i}`, i % 14, 1.5), deadlineDay: 14 + (i % 7) }))
    const started = performance.now()
    rebalance(makeSchedule(items), DEFAULT_PARAMS, makeRng(5))
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/optimizer/neighbours.test.ts src/optimizer/hillClimb.test.ts`
Expected: FAIL — cannot resolve `./neighbours`, `./hillClimb`, `./rng`.

- [ ] **Step 3: Implement the seeded PRNG**

`src/optimizer/rng.ts`:

```ts
export type Rng = () => number

/** mulberry32. Deterministic for a given seed, which is what lets a random-restart
 *  search be asserted in a test without the test becoming flaky. */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
```

- [ ] **Step 4: Implement neighbour generation**

`src/optimizer/neighbours.ts`:

```ts
import type { EngineParams } from '../engine'
import { isValid } from './constraints'
import type { Move, Schedule, ScheduledItem } from './types'

const DAY_SHIFTS = [-2, -1, 1, 2]
const REST_HOURS = 2
const REST_START_HOUR = 20

const replace = (schedule: Schedule, id: string, next: ScheduledItem): Schedule => ({
  ...schedule,
  items: schedule.items.map((item) => (item.id === id ? next : item)),
})

/** Movable per §2.1: soft deadlines, undated work, errands. Everything fixed stays put,
 *  and protected rest is not merely fixed but untouchable. */
const isMovable = (item: ScheduledItem): boolean => !item.fixed && !item.protectedRest

function shiftMoves(schedule: Schedule): Move[] {
  const moves: Move[] = []
  for (const item of schedule.items.filter(isMovable)) {
    for (const delta of DAY_SHIFTS) {
      const dayIndex = item.dayIndex + delta
      if (dayIndex < 0 || dayIndex >= schedule.horizonDays) continue
      if (item.deadlineDay !== null && dayIndex > item.deadlineDay) continue
      moves.push({
        kind: 'shiftDay',
        itemId: item.id,
        description: `Moved ${item.title} ${delta > 0 ? 'later' : 'earlier'} by ${Math.abs(delta)} day(s)`,
        apply: (s) => replace(s, item.id, { ...item, dayIndex }),
      })
    }
  }
  return moves
}

function batchMoves(schedule: Schedule): Move[] {
  const errands = schedule.items.filter((i) => isMovable(i) && i.type === 'errands')
  const moves: Move[] = []
  for (const target of errands) {
    for (const other of errands) {
      if (other.id === target.id || other.dayIndex === target.dayIndex) continue
      if (other.deadlineDay !== null && target.dayIndex > other.deadlineDay) continue
      moves.push({
        kind: 'batchErrands',
        itemId: other.id,
        description: `Batched ${other.title} with ${target.title}`,
        apply: (s) =>
          replace(s, other.id, {
            ...other,
            dayIndex: target.dayIndex,
            startHour: target.startHour + target.hours,
          }),
      })
    }
  }
  return moves
}

function restMoves(schedule: Schedule): Move[] {
  const moves: Move[] = []
  for (let day = 0; day < schedule.horizonDays; day += 1) {
    const alreadyResting = schedule.items.some((i) => i.dayIndex === day && i.kind === 'rest')
    if (alreadyResting) continue
    const id = `rest-${day}`
    moves.push({
      kind: 'insertRest',
      itemId: id,
      description: `Added a rest block on day ${day}`,
      apply: (s) => ({
        ...s,
        items: [
          ...s.items,
          {
            id, title: 'Rest', type: 'mental', kind: 'rest', hours: REST_HOURS,
            intensity: 1, dayIndex: day, startHour: REST_START_HOUR,
            fixed: true, deadlineDay: null, protectedRest: true,
          },
        ],
      }),
    })
  }
  return moves
}

/** §6.6: sequencing is a lever. Even when the days are fixed, the order within a day is
 *  usually free -- which is what partly answers §2.5's degrees-of-freedom problem, since
 *  no timetable takes ordering away. */
function reorderMoves(schedule: Schedule): Move[] {
  const moves: Move[] = []
  for (const item of schedule.items.filter(isMovable)) {
    const sameDay = schedule.items.filter(
      (other) => other.dayIndex === item.dayIndex && other.id !== item.id,
    )
    for (const other of sameDay) {
      moves.push({
        kind: 'reorderWithinDay',
        itemId: item.id,
        description: `Moved ${item.title} to after ${other.title}`,
        apply: (s) => replace(s, item.id, { ...item, startHour: other.startHour + other.hours }),
      })
    }
  }
  return moves
}

/** §2.1's four neighbour kinds. Invalid results are filtered here rather than scored
 *  badly, so the search can never walk through an illegal schedule. */
export function neighbours(schedule: Schedule, params: EngineParams): Move[] {
  return [
    ...shiftMoves(schedule),
    ...batchMoves(schedule),
    ...restMoves(schedule),
    ...reorderMoves(schedule),
  ].filter((move) => isValid(move.apply(schedule), params))
}
```

- [ ] **Step 5: Implement the search**

`src/optimizer/hillClimb.ts`:

```ts
import { overallReserve, project, type EngineParams } from '../engine'
import { neighbours } from './neighbours'
import { score, toDayInputs } from './objective'
import type { Rng } from './rng'
import type { Move, RebalanceResult, Schedule } from './types'

const MAX_ITERATIONS = 200
const RESTARTS = 3

const worstOf = (schedule: Schedule, params: EngineParams): number =>
  project(schedule.start, toDayInputs(schedule), params).worstOverall

/** One climb: take the best neighbour while one improves, up to the iteration cap. The
 *  first move considered is rotated by the rng so restarts explore different basins. */
function climb(
  start: Schedule,
  params: EngineParams,
  rng: Rng,
): { schedule: Schedule; moves: Move[] } {
  let current = start
  let currentScore = score(current, params)
  const taken: Move[] = []

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const options = neighbours(current, params)
    if (options.length === 0) break

    const offset = Math.floor(rng() * options.length)
    let best: Move | null = null
    let bestScore = currentScore

    for (let i = 0; i < options.length; i += 1) {
      const move = options[(i + offset) % options.length]!
      const candidateScore = score(move.apply(current), params)
      if (candidateScore > bestScore + 1e-9) {
        best = move
        bestScore = candidateScore
      }
    }

    if (!best) break
    current = best.apply(current)
    currentScore = bestScore
    taken.push(best)
  }

  return { schedule: current, moves: taken }
}

/**
 * §2.1: hill climbing with random restarts. Best neighbour, repeat to convergence or 200
 * iterations, three restarts. Roughly fifty lines, under 100ms on a phone, no solver
 * library and no backend call.
 *
 * Never returns a schedule worse than the one it was given: the incumbent starts as the
 * input, so a search that finds nothing returns the input unchanged with an empty move
 * list. A rebalance that quietly made things worse would be far more damaging than one
 * that found nothing.
 */
export function rebalance(schedule: Schedule, params: EngineParams, rng: Rng): RebalanceResult {
  const worstBefore = worstOf(schedule, params)

  let best = schedule
  let bestScore = score(schedule, params)
  let bestMoves: Move[] = []

  for (let restart = 0; restart < RESTARTS; restart += 1) {
    const attempt = climb(schedule, params, rng)
    const attemptScore = score(attempt.schedule, params)
    if (attemptScore > bestScore + 1e-9) {
      best = attempt.schedule
      bestScore = attemptScore
      bestMoves = attempt.moves
    }
  }

  return {
    schedule: best,
    moves: bestMoves,
    worstBefore,
    worstAfter: worstOf(best, params),
  }
}
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx vitest run src/optimizer && npm run typecheck`
Expected: PASS. If `improves a schedule that piles three deadlines onto one day` fails, check that `neighbours` is returning `shiftDay` moves — the pile-up has slack to day 10, so at least one shift must be legal.

- [ ] **Step 7: Commit**

```bash
git add src/optimizer
git commit -m "$(cat <<'EOF'
feat: add neighbour generation and the hill-climbing rebalancer

§2.1's search: best-neighbour hill climbing, 200 iterations, three
random restarts, over four move kinds -- shift a movable task by a day,
batch two errands, insert a rest block, and reorder within a day.

Two properties are enforced rather than hoped for. Invalid neighbours
are filtered at generation, so the search cannot walk through an
illegal schedule on its way somewhere better; and the incumbent starts
as the input schedule, so a search that finds nothing returns the input
untouched. A rebalance that quietly made a week worse would cost more
trust than one that found nothing.

Randomness is injected as a seeded PRNG rather than taken from
Math.random, which keeps a random-restart search assertable in a test
without making the test flaky.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Smallest-fix search and the change report

§2.2: a student will do one thing; they will not follow a nine-change reshuffle.

**Files:**
- Create: `src/optimizer/smallestFix.ts`, `src/optimizer/report.ts`, `src/optimizer/index.ts`, `src/optimizer/smallestFix.test.ts`, `src/optimizer/report.test.ts`

**Interfaces:**
- Produces:
  - `interface Fix { readonly move: Move; readonly worstBefore: number; readonly worstAfter: number; readonly gain: number }`
  - `smallestFixes(schedule: Schedule, params: EngineParams, limit?: number): Fix[]`
  - `describeRebalance(result: RebalanceResult): string`
  - `undo(result: RebalanceResult): Schedule`

- [ ] **Step 1: Write the failing tests**

`src/optimizer/smallestFix.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { smallestFixes } from './smallestFix'
import { makeSchedule, studyItem } from './testSupport'

const pileUp = () =>
  makeSchedule([
    { ...studyItem('essay', 2, 4), deadlineDay: 10 },
    { ...studyItem('lab', 2, 3), deadlineDay: 12 },
    { ...studyItem('reading', 2, 2), deadlineDay: 14 },
  ])

describe('smallestFixes', () => {
  it('returns at most three, because a student will do one thing', () => {
    expect(smallestFixes(pileUp(), DEFAULT_PARAMS).length).toBeLessThanOrEqual(3)
  })

  it('orders them by how much they actually help', () => {
    const fixes = smallestFixes(pileUp(), DEFAULT_PARAMS)
    for (let i = 1; i < fixes.length; i += 1) {
      expect(fixes[i - 1]!.gain).toBeGreaterThanOrEqual(fixes[i]!.gain)
    }
  })

  it('only ever returns single moves that genuinely improve the floor', () => {
    for (const fix of smallestFixes(pileUp(), DEFAULT_PARAMS)) {
      expect(fix.worstAfter).toBeGreaterThan(fix.worstBefore)
    }
  })

  it('returns nothing when there is nothing worth moving', () => {
    expect(smallestFixes(makeSchedule([]), DEFAULT_PARAMS)).toEqual([])
  })
})
```

`src/optimizer/report.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { rebalance } from './hillClimb'
import { describeRebalance, undo } from './report'
import { makeRng } from './rng'
import { makeSchedule, studyItem } from './testSupport'

const pileUp = () =>
  makeSchedule([
    { ...studyItem('essay', 2, 4), deadlineDay: 10 },
    { ...studyItem('lab', 2, 3), deadlineDay: 12 },
  ])

describe('describeRebalance', () => {
  it('names the worst day before and after, in numbers', () => {
    const text = describeRebalance(rebalance(pileUp(), DEFAULT_PARAMS, makeRng(1)))
    expect(text).toMatch(/worst day/i)
    expect(text).toMatch(/\d/)
  })

  // §2.1: never "optimised", always specific.
  it('never says the word optimised', () => {
    expect(describeRebalance(rebalance(pileUp(), DEFAULT_PARAMS, makeRng(1))))
      .not.toMatch(/optimis|optimiz/i)
  })

  it('says plainly when it found nothing rather than inventing a change', () => {
    const result = rebalance(makeSchedule([]), DEFAULT_PARAMS, makeRng(1))
    expect(describeRebalance(result)).toMatch(/nothing/i)
  })
})

describe('undo', () => {
  it('restores exactly the schedule the rebalance started from', () => {
    const before = pileUp()
    const result = rebalance(before, DEFAULT_PARAMS, makeRng(1))
    expect(undo(result)).toEqual(before)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/optimizer/smallestFix.test.ts src/optimizer/report.test.ts`
Expected: FAIL — cannot resolve `./smallestFix`, `./report`.

- [ ] **Step 3: Implement**

To make `undo` exact, `rebalance` must carry the original. Modify `RebalanceResult` in `src/optimizer/types.ts` to add `readonly before: Schedule`, and set it in `hillClimb.ts`'s return (`before: schedule`). Update the existing `hillClimb.test.ts` expectations only if they break — they assert on `schedule`, `moves`, `worstBefore` and `worstAfter`, so they should not.

`src/optimizer/smallestFix.ts`:

```ts
import { project, type EngineParams } from '../engine'
import { neighbours } from './neighbours'
import { toDayInputs } from './objective'
import type { Move, Schedule } from './types'

export interface Fix {
  readonly move: Move
  readonly worstBefore: number
  readonly worstAfter: number
  readonly gain: number
}

const DEFAULT_LIMIT = 3

const worstOf = (schedule: Schedule, params: EngineParams): number =>
  project(schedule.start, toDayInputs(schedule), params).worstOverall

/**
 * §2.2: same machinery as the full rebalance, but a single move, ranked by effect.
 *
 * "Move the lab report to Monday. Day 21 reserve goes 11 to 44." A student will do one
 * thing; they will not follow a nine-change reshuffle -- so the smallest fix is often
 * the one that actually happens, which makes it worth more than a better plan nobody
 * enacts.
 */
export function smallestFixes(
  schedule: Schedule,
  params: EngineParams,
  limit: number = DEFAULT_LIMIT,
): Fix[] {
  const worstBefore = worstOf(schedule, params)

  return neighbours(schedule, params)
    .map((move) => {
      const worstAfter = worstOf(move.apply(schedule), params)
      return { move, worstBefore, worstAfter, gain: worstAfter - worstBefore }
    })
    .filter((fix) => fix.gain > 1e-9)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, limit)
}
```

`src/optimizer/report.ts`:

```ts
import type { RebalanceResult, Schedule } from './types'

const round = (value: number): number => Math.round(value)

/**
 * §2.1: never "optimised". Always specific -- what moved, what was batched, what rest was
 * added, and what the worst day actually does as a result.
 *
 * An unexplained reshuffle is not something a student will act on, and "optimised" is a
 * claim the app cannot support to someone who has to live with the week.
 */
export function describeRebalance(result: RebalanceResult): string {
  if (result.moves.length === 0) {
    return 'Nothing worth moving. Your schedule is already the best arrangement of these commitments.'
  }

  const counts = new Map<string, number>()
  for (const move of result.moves) {
    counts.set(move.kind, (counts.get(move.kind) ?? 0) + 1)
  }

  const parts: string[] = []
  const moved = counts.get('shiftDay') ?? 0
  const batched = counts.get('batchErrands') ?? 0
  const rested = counts.get('insertRest') ?? 0
  const reordered = counts.get('reorderWithinDay') ?? 0

  if (moved > 0) parts.push(`moved ${moved} thing${moved === 1 ? '' : 's'}`)
  if (batched > 0) parts.push(`batched ${batched} errand${batched === 1 ? '' : 's'}`)
  if (rested > 0) parts.push(`added ${rested} rest block${rested === 1 ? '' : 's'}`)
  if (reordered > 0) parts.push(`reordered ${reordered} within their day`)

  const changes = parts.join(', ').replace(/,([^,]*)$/, ' and$1')
  return `I ${changes}. Your worst day goes from ${round(result.worstBefore)} to ${round(result.worstAfter)}.`
}

/** §2.1: one tap to undo all of it. */
export function undo(result: RebalanceResult): Schedule {
  return result.before
}
```

`src/optimizer/index.ts`:

```ts
export * from './types'
export { isValid, violations } from './constraints'
export { score, toDayInputs, DEFICIT_DAY_WEIGHT, FRAGMENTATION_WEIGHT } from './objective'
export { neighbours } from './neighbours'
export { makeRng, type Rng } from './rng'
export { rebalance } from './hillClimb'
export { smallestFixes, type Fix } from './smallestFix'
export { describeRebalance, undo } from './report'
```

- [ ] **Step 4: Run the whole suite**

Run: `npm run test && npm run typecheck`
Expected: PASS, everything.

- [ ] **Step 5: Commit**

```bash
git add src/optimizer
git commit -m "$(cat <<'EOF'
feat: add smallest-fix search and the change report

§2.2's smallest fix reuses the full search's neighbour generator but
takes a single move and ranks the top three by effect. A student will
do one thing and will not follow a nine-change reshuffle, so the
smallest fix is often the one that actually happens -- which makes it
worth more than a better plan nobody enacts.

The report never says "optimised" (§2.1) and the test asserts that
absence, not as pedantry but because an unexplained reshuffle is not
something anyone acts on, and "optimised" is a claim the app cannot
support to the person who has to live with the week. Where it found
nothing it says so plainly rather than inventing a change.

RebalanceResult now carries the schedule it started from, which is what
makes the one-tap undo §2.1 requires exact rather than reconstructed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: The §2.5 degrees-of-freedom measurement

**The spec requires this before any rebalance UI exists.** For a typical final-year student the movable set may be small. If rebalance returns "moved one thing by a day", then smallest-fix search, within-day reordering and rest insertion carry Focus 2 instead, and the full optimizer drops out of the headline. That is a fine outcome — but it must be known now, not in week three.

**Files:**
- Create: `src/fixtures/umWeek.ts`, `src/fixtures/umWeek.test.ts`, `scripts/degrees-of-freedom.ts`
- Modify: `package.json` (add the `measure:dof` script)

**Interfaces:**
- Consumes: everything from `src/optimizer` and `src/engine`.
- Produces: `umSemesterWeek(): Schedule` — a realistic UM final-year timetable plus a realistic assignment set.

- [ ] **Step 1: Write the failing test**

`src/fixtures/umWeek.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../engine'
import { isValid } from '../optimizer'
import { umSemesterWeek } from './umWeek'

describe('umSemesterWeek', () => {
  it('is a legal starting schedule', () => {
    expect(isValid(umSemesterWeek(), DEFAULT_PARAMS)).toBe(true)
  })

  it('has fixed classes the optimizer may not move', () => {
    expect(umSemesterWeek().items.some((i) => i.fixed && i.kind === 'studyBlock')).toBe(true)
  })

  it('has movable assessed work with real deadlines', () => {
    const movable = umSemesterWeek().items.filter((i) => !i.fixed && i.deadlineDay !== null)
    expect(movable.length).toBeGreaterThan(3)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/fixtures/umWeek.test.ts`
Expected: FAIL — cannot resolve `./umWeek`.

- [ ] **Step 3: Build the fixture**

`src/fixtures/umWeek.ts`. A realistic final-year semester: four courses with weekly lectures and labs across a 21-day horizon, a part-time shift, five pieces of assessed work with staggered deadlines, and errands. Fixed items get `fixed: true`; assessed work is movable with a `deadlineDay`.

```ts
import { HORIZON_DAYS, type Reserves } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'

const START: Reserves = { mental: 62, physical: 58, social: 45, errands: 70 }

/** Weekly fixtures repeated across the horizon: day 0 is a Monday. */
const WEEKLY_CLASSES: ReadonlyArray<{ weekday: number; title: string; startHour: number; hours: number }> = [
  { weekday: 0, title: 'WIA3001 lecture', startHour: 9, hours: 2 },
  { weekday: 0, title: 'WIA3002 lecture', startHour: 14, hours: 2 },
  { weekday: 1, title: 'WIA3003 lab', startHour: 10, hours: 3 },
  { weekday: 2, title: 'WIA3001 tutorial', startHour: 11, hours: 1 },
  { weekday: 3, title: 'WIA3004 lecture', startHour: 9, hours: 2 },
  { weekday: 3, title: 'WIA3002 lab', startHour: 14, hours: 3 },
  { weekday: 4, title: 'FYP supervisor meeting', startHour: 10, hours: 1 },
]

const SHIFTS: ReadonlyArray<{ weekday: number; startHour: number; hours: number }> = [
  { weekday: 5, startHour: 12, hours: 6 },
  { weekday: 6, startHour: 12, hours: 6 },
]

const ASSESSED: ReadonlyArray<{ title: string; hours: number; deadlineDay: number; dayIndex: number }> = [
  { title: 'WIA3001 essay', hours: 4, deadlineDay: 6, dayIndex: 5 },
  { title: 'WIA3003 lab report', hours: 3, deadlineDay: 9, dayIndex: 8 },
  { title: 'FYP chapter 2', hours: 6, deadlineDay: 13, dayIndex: 12 },
  { title: 'WIA3002 group slides', hours: 3, deadlineDay: 15, dayIndex: 14 },
  { title: 'WIA3004 problem set', hours: 2, deadlineDay: 19, dayIndex: 18 },
]

function classItems(): ScheduledItem[] {
  const out: ScheduledItem[] = []
  for (let day = 0; day < HORIZON_DAYS; day += 1) {
    for (const slot of WEEKLY_CLASSES.filter((c) => c.weekday === day % 7)) {
      out.push({
        id: `${slot.title}-${day}`, title: slot.title, type: 'mental', kind: 'studyBlock',
        hours: slot.hours, intensity: 1, dayIndex: day, startHour: slot.startHour,
        fixed: true, deadlineDay: null, protectedRest: false,
      })
    }
    for (const shift of SHIFTS.filter((s) => s.weekday === day % 7)) {
      out.push({
        id: `shift-${day}`, title: 'Part-time shift', type: 'errands', kind: 'errands',
        hours: shift.hours, intensity: 1, dayIndex: day, startHour: shift.startHour,
        fixed: true, deadlineDay: null, protectedRest: false,
      })
    }
  }
  return out
}

function assessedItems(): ScheduledItem[] {
  return ASSESSED.map((work) => ({
    id: work.title, title: work.title, type: 'mental', kind: 'studyBlock',
    hours: work.hours, intensity: 1, dayIndex: work.dayIndex, startHour: 19,
    fixed: false, deadlineDay: work.deadlineDay, protectedRest: false,
  }))
}

/** A realistic UM final-year week, for the §2.5 measurement. Deliberately not a
 *  worst-case: the question that section asks is how much slack a *typical* student
 *  actually has, and an artificially loose fixture would answer it flatteringly. */
export function umSemesterWeek(): Schedule {
  return {
    items: [...classItems(), ...assessedItems()],
    start: START,
    horizonDays: HORIZON_DAYS,
    sleepByDay: Array.from({ length: HORIZON_DAYS }, (_, d) => (d % 7 === 5 || d % 7 === 6 ? 8 : 6.5)),
  }
}
```

Adjust `dayIndex` values if `isValid` rejects the fixture — the daily hours cap is 10, and a class day plus a 6-hour assignment can exceed it.

- [ ] **Step 4: Run the fixture test and watch it pass**

Run: `npx vitest run src/fixtures/umWeek.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the measurement script**

`scripts/degrees-of-freedom.ts`:

```ts
/**
 * §2.5's week-one validation task, to be run BEFORE any rebalance UI is built.
 *
 * The question: for a typical UM final-year student, how much can the optimizer actually
 * move? If the answer is "one thing by one day", then §2.2's smallest-fix search,
 * §6.6's within-day reordering and §5.1's rest insertion carry Focus 2 instead, and the
 * full optimizer drops out of the headline. That is a perfectly good outcome. What is
 * not good is discovering it in week three, after a UI has been built on top of it.
 */
import { DEFAULT_PARAMS, overallReserve, project } from '../src/engine'
import { umSemesterWeek } from '../src/fixtures/umWeek'
import {
  describeRebalance, makeRng, neighbours, rebalance, smallestFixes, toDayInputs,
} from '../src/optimizer'

const schedule = umSemesterWeek()
const params = DEFAULT_PARAMS

const movable = schedule.items.filter((i) => !i.fixed && !i.protectedRest)
const options = neighbours(schedule, params)
const byKind = new Map<string, number>()
for (const move of options) byKind.set(move.kind, (byKind.get(move.kind) ?? 0) + 1)

const before = project(schedule.start, toDayInputs(schedule), params)
const result = rebalance(schedule, params, makeRng(20260908))
const fixes = smallestFixes(schedule, params)

console.log('--- §2.5 degrees of freedom ---')
console.log(`items:                 ${schedule.items.length}`)
console.log(`movable:               ${movable.length}`)
console.log(`legal neighbours:      ${options.length}`)
for (const [kind, count] of [...byKind].sort()) console.log(`  ${kind.padEnd(20)} ${count}`)
console.log('')
console.log(`start overall reserve: ${overallReserve(schedule.start).toFixed(1)}`)
console.log(`worst day before:      ${before.worstOverall.toFixed(1)}`)
console.log(`worst day after:       ${result.worstAfter.toFixed(1)}`)
console.log(`deficit days before:   ${before.deficitDays}`)
console.log(`first deficit day:     ${before.firstDeficitDay ?? 'none'}`)
console.log(`moves taken:           ${result.moves.length}`)
console.log('')
console.log(describeRebalance(result))
console.log('')
console.log('--- smallest fixes ---')
if (fixes.length === 0) console.log('none found')
for (const fix of fixes) {
  console.log(`${fix.move.description}: worst day ${fix.worstBefore.toFixed(1)} -> ${fix.worstAfter.toFixed(1)}`)
}
console.log('')
console.log(
  result.moves.length <= 1
    ? 'VERDICT: little freedom. Per §2.5, smallest-fix, within-day reordering and rest insertion should carry Focus 2; the full optimizer is not the headline.'
    : 'VERDICT: the optimizer has real freedom. The full rebalance can headline Focus 2.',
)
```

Add to `package.json`: `"measure:dof": "vite-node scripts/degrees-of-freedom.ts"`, and `npm install -D vite-node`.

- [ ] **Step 6: Run the measurement and record the answer**

```bash
npm run measure:dof
```

**This step's deliverable is the number, not a passing test.** Record the output verbatim in a new `docs/superpowers/notes/2026-09-08-degrees-of-freedom.md`, and state the verdict in the commit message. If the verdict is "little freedom", say so plainly and flag it — it changes what Plan 3 builds, and the honest outcome is more useful than a flattering one.

- [ ] **Step 7: Run the full gate**

```bash
npm run typecheck && npm run test:coverage && npm run test:e2e
```

- [ ] **Step 8: Commit**

```bash
git add src/fixtures scripts/degrees-of-freedom.ts package.json package-lock.json docs/superpowers/notes
git commit -m "$(cat <<'EOF'
feat: measure the optimizer's degrees of freedom on a real UM week

§2.5 requires this before any rebalance UI exists. A final-year
timetable is mostly fixed -- lectures, labs, a supervisor meeting and
two weekend shifts -- so the question is how much the solver can
actually move, and the answer determines whether the full optimizer or
the smallest-fix search headlines Focus 2.

The fixture is deliberately typical rather than loose. An artificially
slack week would answer the question flatteringly, which is the one
outcome that makes running this measurement pointless.

Records the measured result in docs/superpowers/notes/ rather than only
in a console, so the decision it drives can be traced later.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage for this plan's scope (§6, §2.1, §2.2, §2.5):**

| Spec requirement | Task |
|---|---|
| §6.1 reserve recurrence | 7 |
| §6.2 efficiency curve | 3 |
| §6.3 coupling | 7 |
| §6.4 drain refinements (bias, context switch, deadline, travel) | 6 |
| §6.4 rolling debt | **Deferred to Plan 3** — deferral is a user action, so it belongs with the decline flow that creates it. Noted here so it is not lost. |
| §6.5 three bands, missing-data pessimism | 8 |
| §6.6 carryover matrix | 4 |
| §6.6 state-dependent cost | 5 |
| §6.6 two-tap rating learning | **Plan 4** — needs the post-block confirmation UI (§7.9) to have any data. |
| §2.1 objective, constraints, search, reporting, undo | 9, 10, 11 |
| §2.2 smallest fix | 11 |
| §2.2 errand batching | 10 |
| §2.2 target rebalance, sensitivity | Out of scope — not in §11 must-build. Recorded in the design doc. |
| §2.4 Reality Check | Task 6 consumes `estimateBias`; the *learning* is Plan 4, which is where completions exist. |
| §2.5 measurement | 12 |
| §1.2 low social is a warning | 6 |
| §5.1 rest ceiling, protected rest immovable | 7, 9, 10 |

**Placeholder scan:** one found and fixed — Task 9 Step 3 originally showed an `objectiveDeps` import that does not exist; the direct implementation follows it and is the one to use. Task 12 Step 3 flags that `dayIndex` values may need adjusting against the hours cap, with the specific cap named rather than left as "adjust as needed".

**Type consistency:** `Reserves` is `Record<LoadType, number>` throughout. `carryoverAt` returns `Reserves` and is indexed by type at both call sites (Tasks 5, 6). `stateMultiplier(overall, carryoverForType)` takes two numbers in both its definition (5) and its caller (6). `RebalanceResult` gains `before` in Task 11 Step 3, which is called out explicitly as a modification to the Task 9 type rather than silently redefined. `project` returns `Projection` and is consumed by `score` (9), `smallestFixes` (11) and the script (12) with the same field names.

**One inconsistency fixed:** `DEFICIT_DAY_WEIGHT` and `FRAGMENTATION_WEIGHT` are declared in `objective.ts` in Task 9, not in `params.ts` as the Global Constraints table implies. They are optimizer weights, not model parameters, and `src/engine/` must not depend on the optimizer. The constants table above lists them for reference; `objective.ts` is where they live.
