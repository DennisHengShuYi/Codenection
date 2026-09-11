# Sleep page and sleep calibration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give sleep an address — a page where a student states a nightly target and edits
individual nights — and make the app compare that target against reported nights, warn when a
deadline will eat a night, and stop re-asking a question it has already been answered.

**Architecture:** `Schedule.sleepByDay` keeps its type and all nine readers and becomes
unambiguously *the plan*. A durable per-night log (on the existing settings blob) records what
was reported, which is what finally distinguishes an answered night from a default. Two new
pure domain modules read but never write: a reality check (plan vs. reported, silent below three
nights, shortfalls only) and a forecast (spill + a real deadline → a sentence, never stored).
**`src/engine` and `src/optimizer` gain no new fields and no new logic** — the only edit there is
one bare `?? 7` becoming a shared constant.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind 4, Vitest + Testing Library, Playwright.

**Spec:** `burnout-app-spec-v3.md` (§5.1 recovery ceiling, §6.1 the recovery equation, §7.5 no
parameters asked of the student, §7.6 Reality Check, §8 one card three taps, §8.2 never present
noise as insight). Approved plain-language plan: `C:\Users\den51\.claude\plans\twinkly-giggling-cupcake.md`.

## Global Constraints

- `src/optimizer` must **never** import `src/domain`. `src/domain` imports the optimizer.
  Dependency order is `engine → optimizer → domain → ui`.
- `src/engine` stays pure: no clock, no network, no randomness. Nothing in this plan adds any.
- The engine's recovery equation is untouched, including `SLEEP_BASELINE_HOURS = 5`. It is spec
  text (§6.1), not a tuning knob.
- Every behaviour change ships with its tests in the same commit. A knife-edge fixture that
  moves is **re-derived empirically through the real function**, never relaxed. No assertion is
  deleted, loosened, or skipped.
- Coverage thresholds only go up. `vitest.config.ts` enforces 97/93/97/98 over `src/**`.
- No new Supabase table, migration, or RLS policy. New persisted state goes on the existing
  `StoredSettings` blob, the precedent `calibration` and `ladders` set in `src/data/types.ts:11-31`.
- Student-facing copy never instructs, scolds, or implies a duty. §8.2: no claim the app has not
  measured.
- Real deadlines only (`item.deadlineDay`). Synthetic/soft deadlines must never reach a sleep
  warning — `src/domain/softDeadlines.ts:18-28` forbids it by name.
- Reported sleep stays on the existing four buckets (4.5 / 6 / 7 / 8.5) — §7.5, "nobody reports
  their night to the half hour".
- `npx tsc --noEmit` clean at every commit. `noUnusedLocals` and `noUnusedParameters` are on.

---

## File Structure

**Created**

| File | Owns |
|---|---|
| `src/domain/sleepLog.ts` | The `SleepNight` record, its upsert, and reads over the log. |
| `src/domain/sleepPlan.ts` | `withSleep` (moved here), `withSleepHours`, `seedSleepPlan`. The only writers of `sleepByDay`. |
| `src/domain/sleepReality.ts` | Plan vs. reported: the average, the shortfall, the sentence. |
| `src/domain/sleepForecast.ts` | Spill + real deadline → forecast shortfall and sentence. Read-only. |
| `src/ui/useSleepPlan.ts` | Target + log state, loaded from and saved to the settings blob. |
| `src/ui/sleep/SleepSheet.tsx` | The page. Presentational; parent owns the commit. |
| `src/ui/settings/SettingsSheet.tsx` | The settings body, extracted from `RoomShell` unchanged. |

**Modified**

`src/engine/params.ts`, `src/engine/index.ts` (the constant) · `src/data/types.ts` (two optional
fields) · `src/data/repositoryContract.ts`, `api/telegram.ts`, `src/optimizer/objective.ts` (the
default) · `src/ui/today/checkIn.ts` (loses `withSleep`) · `src/ui/today/TodayCard.tsx` (the
reality line) · `src/ui/room/view.ts` (the route) · `src/ui/room/RoomShell.tsx` (button, sheet,
wiring, extraction) · `src/ui/room/roomState.ts`, `src/ui/room/roomModel.ts` (the target) ·
`src/ui/room/todayRows.ts` (the bed's trend) · `src/ui/useLowEnergy.ts` (the clobber fix) ·
`src/telegram/handle.ts` (import move + log write).

**Deleted:** nothing.

---

## Task 1: One sleep default, in one place

Three production defaults each spell the same idea as a bare `7`. They become one constant, set
to 8. Done first because it moves projection baselines, and every later task's fixtures should
be derived against the new value rather than re-derived twice.

**Files:**
- Modify: `src/engine/params.ts` (after `SLEEP_BASELINE_HOURS`, line 10)
- Modify: `src/engine/index.ts` (the export list, near line 35)
- Modify: `src/data/repositoryContract.ts:11`
- Modify: `api/telegram.ts:42`
- Modify: `src/optimizer/objective.ts:267`
- Test: `src/engine/params.test.ts`, plus any fixture that moves

**Interfaces:**
- Produces: `DEFAULT_SLEEP_HOURS: 8`, exported from `src/engine`.

- [ ] **Step 1: Write the failing test**

In `src/engine/params.test.ts`:

```typescript
import { DEFAULT_SLEEP_HOURS, SLEEP_BASELINE_HOURS } from './params'

/**
 * The assumed night and the credit floor are different quantities and must not be conflated:
 * the floor is where sleep starts paying at all (§6.1), the default is what the app assumes
 * when nobody has said. Pinned together so a future edit cannot quietly make one the other.
 */
it('assumes a full night by default, above the credit floor', () => {
  expect(DEFAULT_SLEEP_HOURS).toBe(8)
  expect(DEFAULT_SLEEP_HOURS).toBeGreaterThan(SLEEP_BASELINE_HOURS)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/engine/params.test.ts`
Expected: FAIL — `DEFAULT_SLEEP_HOURS` is not exported.

- [ ] **Step 3: Add the constant**

In `src/engine/params.ts`, directly below `SLEEP_BASELINE_HOURS`:

```typescript
/**
 * The night the app assumes when the student has not said.
 *
 * Distinct from `SLEEP_BASELINE_HOURS` above, which is where sleep begins paying anything at
 * all, and from `roomState.RESTED_NIGHT_HOURS`, which is where a student counts as *short*.
 * Three numbers, three questions. This one was three bare `7`s in three files -- the blank
 * week, the bot's blank week, and the solver's missing-entry fallback -- which is why it is a
 * constant now rather than a literal.
 */
export const DEFAULT_SLEEP_HOURS = 8
```

Export it from `src/engine/index.ts` beside `SLEEP_BASELINE_HOURS`.

- [ ] **Step 4: Replace the three literals**

`src/data/repositoryContract.ts:11` and `api/telegram.ts:42`:

```typescript
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => DEFAULT_SLEEP_HOURS),
```

`src/optimizer/objective.ts:267`:

```typescript
      sleepHours: schedule.sleepByDay[dayIndex] ?? DEFAULT_SLEEP_HOURS,
```

`objective.ts` imports it from `../engine`, which it already imports from — this does **not**
breach the layering rule, since `optimizer` depends on `engine`.

- [ ] **Step 5: Run the full suite and re-derive what moves**

Run: `npm test`

Expected: some knife-edge fixtures move, because an unanswered week now recovers more. For each
failure, **re-derive the figure by calling the real function**, exactly as the earlier engine
change was handled — a throwaway probe script under the session scratchpad, deleted after. Never
change an `expect`; change the fixture input that feeds it, and only where the test's stated
intent survives. If a test's *intent* no longer holds, say so in the commit message rather than
adjusting it quietly.

- [ ] **Step 6: Re-measure the solver**

Run: `npm run measure:solve`
Expected: still under §2.1's 100ms budget for the ordinary week. Record the figure in the commit
message.

- [ ] **Step 7: Commit**

```bash
git add src/engine/params.ts src/engine/index.ts src/engine/params.test.ts src/data/repositoryContract.ts api/telegram.ts src/optimizer/objective.ts
git commit -m "refactor: give the assumed night one name and one value"
```

Stage any re-derived fixtures in the same commit, named individually.

---

## Task 2: The reported-night log

The unit that removes the central ambiguity. Until this exists, nothing can tell a reported
seven-hour night from the default seven.

**Files:**
- Create: `src/domain/sleepLog.ts`
- Test: `src/domain/sleepLog.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SleepNight`, `recordNight`, `reportedOn`, `reportedNights`, `answeredDays`.

- [ ] **Step 1: Write the failing tests**

`src/domain/sleepLog.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { answeredDays, recordNight, reportedNights, reportedOn, type SleepNight } from './sleepLog'

const night = (isoDate: string, hours: number, answeredAt = 1): SleepNight => ({
  isoDate,
  hours,
  answeredAt,
})

describe('recordNight', () => {
  it('adds a night the log has never seen', () => {
    expect(recordNight([], night('2026-09-12', 6))).toEqual([night('2026-09-12', 6)])
  })

  /** Answering twice corrects the first answer rather than stacking a second, the property
   *  `recordBlockAnswer` states for blocks. Two records for one night would double-count it in
   *  every average taken over the log. */
  it('corrects a night already answered rather than stacking', () => {
    const log = recordNight([night('2026-09-12', 6, 1)], night('2026-09-12', 8, 2))

    expect(log).toEqual([night('2026-09-12', 8, 2)])
  })

  it('leaves other nights alone', () => {
    const log = recordNight([night('2026-09-11', 5)], night('2026-09-12', 8))

    expect(log).toHaveLength(2)
    expect(reportedOn(log, '2026-09-11')).toBe(5)
  })

  it('does not mutate the log it was given', () => {
    const before: readonly SleepNight[] = [night('2026-09-11', 5)]
    recordNight(before, night('2026-09-12', 8))

    expect(before).toHaveLength(1)
  })
})

describe('reportedOn', () => {
  it('is null for a night nobody answered, which is the whole point of this module', () => {
    expect(reportedOn([], '2026-09-12')).toBeNull()
  })

  /** The defect this module exists to fix: a default of 8 and a reported 8 are the same number
   *  and must not be the same fact. */
  it('distinguishes a reported figure from an identical default', () => {
    expect(reportedOn([night('2026-09-12', 8)], '2026-09-12')).toBe(8)
    expect(reportedOn([night('2026-09-12', 8)], '2026-09-13')).toBeNull()
  })
})

describe('reportedNights', () => {
  it('returns the hours, most recent last', () => {
    const log = [night('2026-09-12', 6, 2), night('2026-09-10', 5, 1)]

    expect(reportedNights(log)).toEqual([5, 6])
  })

  it('is empty for an empty log', () => {
    expect(reportedNights([])).toEqual([])
  })
})

describe('answeredDays', () => {
  it('maps a log onto the fortnight by date, leaving unanswered days out', () => {
    const log = [night('2026-09-12', 6)]

    expect(answeredDays(log, ['2026-09-11', '2026-09-12', '2026-09-13'])).toEqual([
      null,
      6,
      null,
    ])
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/domain/sleepLog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

`src/domain/sleepLog.ts`:

```typescript
/**
 * What the student said about a night, and when they said it.
 *
 * Shaped on `BlockRecord` in `./blockLog` deliberately: same idea, same upsert-by-key rule,
 * same reason. It carries the figure itself rather than a pointer into the week, because a
 * fortnight is persisted as one blob and rolls over -- a record that referred to a day index
 * would describe a different night a fortnight later.
 *
 * Keyed by ISO date rather than day index for that same reason, and because §9 puts this app
 * at UTC+8: `domain/calendar.isoDateOf` is the one place a moment becomes a date, and this
 * module takes the result rather than deriving a second one.
 *
 * This type is the answer to a defect stated twice in `ui/room/todayRows.ts`: `sleepByDay`
 * defaults to a plausible figure and nothing records whether a night was *answered*, so the
 * app could not tell "slept eight hours" from "nobody asked". `reportedOn` returning null is
 * that distinction.
 */
export interface SleepNight {
  /** The night this is about, as a local date (`calendar.isoDateOf`). */
  readonly isoDate: string
  /** One of `SLEEP_HOURS`' four bucket values. Stored as hours, not as a bucket name, so a
   *  later change to the buckets cannot silently rewrite what somebody already reported. */
  readonly hours: number
  readonly answeredAt: number
}

/** Upserts on `isoDate`: answering the same night twice corrects the first answer rather than
 *  stacking a second one, which would double-count that night in every average. */
export function recordNight(
  log: readonly SleepNight[],
  night: SleepNight,
): readonly SleepNight[] {
  return [...log.filter((entry) => entry.isoDate !== night.isoDate), night]
}

/** The reported figure for one night, or null if nobody answered it. Null is load-bearing --
 *  see the type's own comment. */
export function reportedOn(log: readonly SleepNight[], isoDate: string): number | null {
  return log.find((entry) => entry.isoDate === isoDate)?.hours ?? null
}

/** Every reported figure, oldest night first, so a caller measuring a trend or an average
 *  reads them in the order they happened rather than the order they were answered. */
export function reportedNights(log: readonly SleepNight[]): readonly number[] {
  return log
    .slice()
    .sort((left, right) => left.isoDate.localeCompare(right.isoDate))
    .map((entry) => entry.hours)
}

/** The log laid over a run of dates -- the fortnight, in practice -- with null for each night
 *  nobody answered. */
export function answeredDays(
  log: readonly SleepNight[],
  isoDates: readonly string[],
): readonly (number | null)[] {
  return isoDates.map((isoDate) => reportedOn(log, isoDate))
}
```

- [ ] **Step 4: Run and watch them pass**

Run: `npx vitest run src/domain/sleepLog.test.ts`
Expected: PASS, output clean.

- [ ] **Step 5: Commit**

```bash
git add src/domain/sleepLog.ts src/domain/sleepLog.test.ts
git commit -m "feat: record which nights the student actually answered"
```

---

## Task 3: The target and the log, persisted

**Files:**
- Modify: `src/data/types.ts` (`StoredSettings`, `DEFAULT_SETTINGS`)
- Test: `src/data/repositoryContract.ts` already round-trips settings; add cases to
  `src/data/localRepository.test.ts`

**Interfaces:**
- Produces: `StoredSettings.sleepTargetHours?: number`, `StoredSettings.sleepNights?: readonly SleepNight[]`.

- [ ] **Step 1: Write the failing test**

In `src/data/localRepository.test.ts`, alongside the existing settings round-trip:

```typescript
/** Optional on the blob, for the reason `calibration` and `ladders` are: both adapters persist
 *  settings as one JSON blob, so this needs no migration and no adapter change -- and a blob
 *  saved before sleep existed must keep loading. */
it('round-trips a sleep target and a night log without an adapter change', async () => {
  const repo = localRepository(freshStore())

  await repo.saveSettings({
    ...DEFAULT_SETTINGS,
    sleepTargetHours: 9,
    sleepNights: [{ isoDate: '2026-09-12', hours: 6, answeredAt: 1 }],
  })

  const saved = await repo.loadSettings()

  expect(saved.sleepTargetHours).toBe(9)
  expect(saved.sleepNights).toEqual([{ isoDate: '2026-09-12', hours: 6, answeredAt: 1 }])
})

it('loads a blob saved before sleep existed', async () => {
  const repo = localRepository(freshStore())
  await repo.saveSettings({ lowEnergyOverride: 'auto' })

  const saved = await repo.loadSettings()

  expect(saved.sleepTargetHours).toBeUndefined()
  expect(saved.sleepNights).toBeUndefined()
})
```

Use the file's existing store-construction helper rather than a new one — read the top of
`localRepository.test.ts` and follow it.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/data/localRepository.test.ts`
Expected: FAIL — the fields are not on the type, so this is a typecheck failure first.

- [ ] **Step 3: Add the fields**

In `src/data/types.ts`, inside `StoredSettings` after `ladders`:

```typescript
  /**
   * The night the student says they are aiming for.
   *
   * A durable preference rather than a per-fortnight value: it must survive the fortnight
   * rolling over, which `Schedule.sleepByDay` does not. Here rather than behind new
   * `Repository` methods for the reason `calibration` and `ladders` are -- one blob, no
   * migration, no adapter change -- and optional because a blob saved before this existed
   * has no such field and must keep loading.
   *
   * A *guess*, not a promise: `optimizer/gaps.DAY_END_HOUR` is untouched, so the solver may
   * still place work past midnight. What this changes is what the app assumes and what it
   * warns about, never what it is allowed to schedule.
   */
  readonly sleepTargetHours?: number
  /** §8's answered nights, durable at last -- see `domain/sleepLog`. Before this, whether a
   *  night had been answered lived only in React state, so the app re-asked after every
   *  reload. */
  readonly sleepNights?: readonly SleepNight[]
```

Import the type at the top: `import type { SleepNight } from '../domain/sleepLog'`.

`DEFAULT_SETTINGS` gains **neither** field. Absent means "never set", which is the distinction
Task 5 depends on; a default written here would make every student look as though they had
stated a target.

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/data/ && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/data/types.ts src/data/localRepository.test.ts
git commit -m "feat: persist a sleep target and the nights behind it"
```

---

## Task 4: The plan — moving and widening the one writer

`withSleep` is the only thing that writes `sleepByDay`. It moves to `src/domain/` (a UI module
writing the model is the wrong layer once the domain composes it), gains an hours-taking
sibling, and gains a seeder that fills unedited nights from the target.

**Files:**
- Create: `src/domain/sleepPlan.ts`, `src/domain/sleepPlan.test.ts`
- Modify: `src/ui/today/checkIn.ts` (remove `withSleep`, keep `SleepBucket`/`SLEEP_HOURS`),
  `src/ui/today/checkIn.test.ts`, `src/ui/room/RoomShell.tsx:32,642`, `src/telegram/handle.ts:14,757`

**Interfaces:**
- Consumes: `SLEEP_HOURS`, `SleepBucket` from `src/ui/today/checkIn`; `DEFAULT_SLEEP_HOURS` (Task 1).
- Produces: `withSleep(schedule, dayIndex, bucket)`, `withSleepHours(schedule, dayIndex, hours)`,
  `seedSleepPlan(schedule, target, editedDays)`.

**Note on layering.** `SLEEP_HOURS` currently lives in `src/ui/today/checkIn.ts`, and
`src/domain` may not depend on `src/ui`. Move `SleepBucket` and `SLEEP_HOURS` into
`src/domain/sleepPlan.ts` too and re-export them from `checkIn.ts` for its existing importers
(`TodayCard.tsx`, `telegram/render.ts`), so no call site outside this task changes.

- [ ] **Step 1: Write the failing tests**

`src/domain/sleepPlan.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { seedSleepPlan, withSleep, withSleepHours } from './sleepPlan'

const week = (sleep: readonly number[]): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: sleep,
})

const flat = (hours: number): readonly number[] =>
  Array.from({ length: HORIZON_DAYS }, () => hours)

describe('withSleepHours', () => {
  it('writes one night and leaves the rest', () => {
    const next = withSleepHours(week(flat(8)), 3, 5.5)

    expect(next.sleepByDay[3]).toBe(5.5)
    expect(next.sleepByDay[2]).toBe(8)
  })

  it('returns a new week rather than writing into the one it was given', () => {
    const before = week(flat(8))
    withSleepHours(before, 3, 5.5)

    expect(before.sleepByDay[3]).toBe(8)
  })

  /** A day index outside the fortnight is a caller bug, not a reason to grow the array: a
   *  22-entry `sleepByDay` would desynchronise from `horizonDays` and every zipped read of it. */
  it('ignores a night outside the fortnight rather than growing the array', () => {
    const next = withSleepHours(week(flat(8)), HORIZON_DAYS + 5, 5)

    expect(next.sleepByDay).toHaveLength(HORIZON_DAYS)
    expect(next.sleepByDay.every((hours) => hours === 8)).toBe(true)
  })
})

describe('withSleep', () => {
  it('still writes a bucket, exactly as it did before it moved', () => {
    expect(withSleep(week(flat(8)), 0, 'six').sleepByDay[0]).toBe(6)
    expect(withSleep(week(flat(8)), 0, 'under5').sleepByDay[0]).toBe(4.5)
  })
})

describe('seedSleepPlan', () => {
  it('fills every night with the target when the student has edited none', () => {
    const next = seedSleepPlan(week(flat(7)), 9, [])

    expect(next.sleepByDay.every((hours) => hours === 9)).toBe(true)
  })

  /** The whole point of tracking which nights were edited: raising the target must move the
   *  fortnight without overwriting a night the student deliberately set. */
  it('leaves a night the student set alone', () => {
    const next = seedSleepPlan(week(flat(7)), 9, [4])

    expect(next.sleepByDay[4]).toBe(7)
    expect(next.sleepByDay[3]).toBe(9)
  })

  it('keeps the array the fortnight is long', () => {
    expect(seedSleepPlan(week(flat(7)), 9, []).sleepByDay).toHaveLength(HORIZON_DAYS)
  })

  it('returns a new week', () => {
    const before = week(flat(7))
    seedSleepPlan(before, 9, [])

    expect(before.sleepByDay[0]).toBe(7)
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/domain/sleepPlan.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

`src/domain/sleepPlan.ts`:

```typescript
import type { Schedule } from '../optimizer'

export type SleepBucket = 'under5' | 'six' | 'seven' | 'eightPlus'

/** Buckets, not a typed number (§7.5): nobody reports their night to the half hour, and
 *  asking for one collects a figure that means nothing. */
export const SLEEP_HOURS: Record<SleepBucket, number> = {
  under5: 4.5,
  six: 6,
  seven: 7,
  eightPlus: 8.5,
}

/**
 * The only writers of `sleepByDay`, and the reason they live here rather than in `src/ui`.
 *
 * `withSleep` was in `ui/today/checkIn.ts` while it had one caller and one meaning -- the
 * night just reported. `sleepByDay` is now composed from a target, the nights the student
 * edited, and the nights they reported, which is a domain question; a UI module owning it
 * would mean the Telegram bot reaching into `src/ui` to write the model, which it already
 * did and which the layering rule forbids in spirit.
 *
 * `sleepByDay` is THE PLAN: what the app assumes each night will be. What was reported lives
 * in `./sleepLog`, and the two are compared in `./sleepReality`. Keeping them apart is what
 * lets the app tell "slept eight" from "nobody asked" -- the defect `ui/room/todayRows.ts`
 * states twice.
 */

/** One night, in hours. Out-of-range indices are ignored rather than extending the array:
 *  `sleepByDay` must stay `horizonDays` long or every zipped read of it desynchronises. */
export function withSleepHours(
  schedule: Schedule,
  dayIndex: number,
  hours: number,
): Schedule {
  return {
    ...schedule,
    sleepByDay: schedule.sleepByDay.map((existing, index) =>
      index === dayIndex ? hours : existing,
    ),
  }
}

/** One night, from a reported bucket. The signature the today card and the bot already call. */
export function withSleep(
  schedule: Schedule,
  dayIndex: number,
  bucket: SleepBucket,
): Schedule {
  return withSleepHours(schedule, dayIndex, SLEEP_HOURS[bucket])
}

/**
 * Every night the student has not personally set, filled with their target.
 *
 * So raising the target moves the fortnight, while a night deliberately set to five stays
 * five. Shaped on `stampSoftDeadlines`, which already derives a field and stamps it into a
 * week -- the same pattern rather than a new one.
 */
export function seedSleepPlan(
  schedule: Schedule,
  targetHours: number,
  editedDays: readonly number[],
): Schedule {
  const edited = new Set(editedDays)

  return {
    ...schedule,
    sleepByDay: schedule.sleepByDay.map((existing, index) =>
      edited.has(index) ? existing : targetHours,
    ),
  }
}
```

- [ ] **Step 4: Re-point `checkIn.ts` and both callers**

In `src/ui/today/checkIn.ts`: delete the `SleepBucket` type, the `SLEEP_HOURS` constant and the
`withSleep` function, and re-export the first two so existing importers are untouched:

```typescript
// Moved to `domain/sleepPlan`, which now composes the whole plan. Re-exported because
// `TodayCard` and `telegram/render` import the vocabulary from here and the move is not
// about them.
export { SLEEP_HOURS, type SleepBucket } from '../../domain/sleepPlan'
```

`src/ui/room/RoomShell.tsx:32` — import `blockToAsk` from `'../today/checkIn'` and `withSleep`
from `'../../domain/sleepPlan'`. `src/telegram/handle.ts:14` — same change.

Move `withSleep`'s existing cases out of `src/ui/today/checkIn.test.ts` into
`src/domain/sleepPlan.test.ts` rather than deleting them; a moved test is not a removed test.

- [ ] **Step 5: Run and watch them pass**

Run: `npx vitest run src/domain/sleepPlan.test.ts src/ui/today/ src/telegram/ && npx tsc --noEmit`
Expected: PASS, clean. `noUnusedLocals` will catch any import left behind.

- [ ] **Step 6: Commit**

```bash
git add src/domain/sleepPlan.ts src/domain/sleepPlan.test.ts src/ui/today/checkIn.ts src/ui/today/checkIn.test.ts src/ui/room/RoomShell.tsx src/telegram/handle.ts
git commit -m "refactor: move the sleep writer to the layer that composes it"
```

---

## Task 5: The reality check

**Files:**
- Create: `src/domain/sleepReality.ts`, `src/domain/sleepReality.test.ts`

**Interfaces:**
- Consumes: `reportedNights` (Task 2), `MIN_SAMPLES_TO_SPEAK` from `src/domain/evidence`.
- Produces: `measuredNight(log): number | null`, `sleepRealityLine(log, targetHours): string | null`.

- [ ] **Step 1: Write the failing tests**

`src/domain/sleepReality.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { MIN_SAMPLES_TO_SPEAK } from './evidence'
import type { SleepNight } from './sleepLog'
import { measuredNight, sleepRealityLine } from './sleepReality'

const nights = (...hours: readonly number[]): readonly SleepNight[] =>
  hours.map((value, index) => ({
    isoDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
    hours: value,
    answeredAt: index,
  }))

describe('measuredNight', () => {
  /** Three, because two points make a line out of a coincidence -- `evidence.ts`'s rule,
   *  imported rather than restated. Below it the honest answer is "nothing measured yet". */
  it('says nothing below the shared sample floor', () => {
    expect(measuredNight(nights(5, 5))).toBeNull()
    expect(MIN_SAMPLES_TO_SPEAK).toBe(3)
  })

  it('averages the reported nights once it has enough', () => {
    expect(measuredNight(nights(6, 6, 6))).toBe(6)
    expect(measuredNight(nights(4.5, 6, 7.5))).toBe(6)
  })

  it('says nothing about an empty log', () => {
    expect(measuredNight([])).toBeNull()
  })
})

describe('sleepRealityLine', () => {
  it('says nothing before there is evidence', () => {
    expect(sleepRealityLine(nights(5, 5), 8)).toBeNull()
  })

  it('names the gap when the student sleeps short of their target', () => {
    expect(sleepRealityLine(nights(6, 6, 6), 8)).toBe(
      'You plan 8 hours and average about 6.',
    )
  })

  /**
   * The asymmetry copied from `realityCheck.paddingFor`, and the reason is its own: correcting
   * in the generous direction "would quietly make a heavy week look survivable, which is the
   * opposite of what this app is for". Sleeping better than planned must never make the app
   * optimistic.
   */
  it('says nothing when the student sleeps more than they planned', () => {
    expect(sleepRealityLine(nights(8.5, 8.5, 8.5), 7)).toBeNull()
  })

  /** Under this the difference is rounding, not a bias worth telling somebody about -- the
   *  rule `realityCheck.WORTH_SAYING` already applies to estimates. */
  it('says nothing about a gap too small to matter', () => {
    expect(sleepRealityLine(nights(7.8, 7.8, 7.8), 8)).toBeNull()
  })

  /** §8.2: the product copy never scolds and never instructs. Pinned as a rule rather than
   *  trusted to stay true, because this is the line most likely to drift into advice. */
  it('states the gap without instructing the student', () => {
    const line = sleepRealityLine(nights(5, 5, 5), 8) ?? ''

    for (const word of ['should', 'need to', 'must', 'try to', 'only']) {
      expect(line.toLowerCase()).not.toContain(word)
    }
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/domain/sleepReality.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

`src/domain/sleepReality.ts`:

```typescript
import { MIN_SAMPLES_TO_SPEAK } from './evidence'
import { reportedNights, type SleepNight } from './sleepLog'

/**
 * §7.6's Reality Check, for sleep.
 *
 * A deliberate mirror of `./realityCheck`, which does the same job for time estimates, down
 * to both of its rules -- the shared sample floor and the one-directional correction. Written
 * as a second module rather than folded into that one because the quantities differ: estimates
 * correct by a multiplier over block outcomes, nights correct by an average over reported
 * hours, and one module doing both would need a mode flag.
 *
 * It compares the PLAN (`sleepPlan`, and the target behind it) against what was REPORTED
 * (`sleepLog`). That comparison is only possible because the log records which nights were
 * answered -- with `sleepByDay` alone, an unanswered default and a reported night were the
 * same number.
 */

/** Below this the difference is rounding rather than a bias worth telling somebody about.
 *  Half an hour: `SLEEP_HOURS`' own buckets are 1.5 hours apart at the widest and half an hour
 *  at the narrowest, so anything under that is inside the resolution of the question asked. */
const WORTH_SAYING_HOURS = 0.5

/**
 * What the student actually sleeps, or null when the app has not earned the right to say.
 *
 * Null rather than the target, and rather than a population figure: a caller that wants a
 * fallback should choose it in the open. Silently substituting one here is how an unmeasured
 * figure ends up quoted as a measured one.
 */
export function measuredNight(log: readonly SleepNight[]): number | null {
  const reported = reportedNights(log)
  if (reported.length < MIN_SAMPLES_TO_SPEAK) return null

  const total = reported.reduce((sum, hours) => sum + hours, 0)

  return Math.round((total / reported.length) * 10) / 10
}

/**
 * §7.6's line, or nothing.
 *
 * Nothing rather than a hedged sentence, exactly as `realityCheck.biasLine` returns null:
 * §7.6 is only the sharpest answer to "how is this different from a to-do list" if every line
 * on it is true, and a screen claiming a gap nobody measured is worse than a screen with fewer
 * lines.
 *
 * Only shortfalls speak. Sleeping better than planned is not a reason to raise the figure the
 * app assumes -- that would make a heavy week look survivable, which is the failure
 * `realityCheck` names in its own comment and refuses for the same reason.
 */
export function sleepRealityLine(
  log: readonly SleepNight[],
  targetHours: number,
): string | null {
  const measured = measuredNight(log)
  if (measured === null) return null
  if (targetHours - measured < WORTH_SAYING_HOURS) return null

  return `You plan ${targetHours} hours and average about ${measured}.`
}
```

- [ ] **Step 4: Run and watch them pass**

Run: `npx vitest run src/domain/sleepReality.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/sleepReality.ts src/domain/sleepReality.test.ts
git commit -m "feat: compare the night a student plans against the one they report"
```

---

## Task 6: The deadline forecast

**Files:**
- Create: `src/domain/sleepForecast.ts`, `src/domain/sleepForecast.test.ts`

**Interfaces:**
- Consumes: `blocksOnDay` from `src/domain/dayBlocks`; `WAKE_HOUR`, `DAY_END_HOUR` from `src/optimizer`.
- Produces: `SleepSqueeze`, `squeezeOn(schedule, dayIndex)`, `sleepForecastLine(squeeze, dayLabel)`.

**Why it does not read `dayLoad`.** `ui/room/dayLoad.ts` computes the same spill, but it lives in
`src/ui` and takes a `blockLog`; `src/domain` may not import `src/ui`. This module derives spill
from the same two solver constants (`WAKE_HOUR`, `DAY_END_HOUR`) so there is still no second idea
of how long a day is — that is the property `dayLoad`'s own comment protects. A follow-up may
re-point `dayLoad` at this module; doing it here would widen the diff for no behaviour change.

- [ ] **Step 1: Write the failing tests**

`src/domain/sleepForecast.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { sleepForecastLine, squeezeOn } from './sleepForecast'

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: `i${Math.random()}`,
  title: 'Essay',
  kind: 'studyBlock',
  type: 'mental',
  dayIndex: 0,
  startHour: 9,
  hours: 4,
  intensity: 1,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: readonly ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 8),
})

/** Sixteen waking hours, so four five-hour blocks overflow by four. */
const overloaded = (deadlineDay: number | null): Schedule =>
  week([
    item({ hours: 5, deadlineDay }),
    item({ hours: 5, deadlineDay }),
    item({ hours: 5, deadlineDay }),
    item({ hours: 5, deadlineDay }),
  ])

describe('squeezeOn', () => {
  it('finds no squeeze on a day that fits', () => {
    expect(squeezeOn(week([item({ hours: 4 })]), 0).hours).toBe(0)
  })

  it('measures the hours a day asks for past the end of it', () => {
    expect(squeezeOn(overloaded(0), 0).hours).toBe(4)
  })

  /** The condition the student asked for: an over-full day AND something actually due. An
   *  over-full day with nothing due is a bad plan, not a deadline eating a night. */
  it('reports whether a real deadline falls on the day', () => {
    expect(squeezeOn(overloaded(0), 0).deadlineToday).toBe(true)
    expect(squeezeOn(overloaded(null), 0).deadlineToday).toBe(false)
  })

  /**
   * Real deadlines only. `softDeadlines.ts` warns in its own docstring that synthetic
   * deadlines must never reach a stress path -- "a student dreading having to relax" -- and
   * an overdue walk is not a reason to tell somebody they will lose sleep.
   */
  it('ignores a soft deadline', () => {
    const soft = week([
      item({ hours: 5, deadlineDay: null, softDeadlineDay: 0 } as Partial<ScheduledItem>),
      item({ hours: 5 }),
      item({ hours: 5 }),
      item({ hours: 5 }),
    ])

    expect(squeezeOn(soft, 0).deadlineToday).toBe(false)
  })

  it('is zero past the end of the fortnight rather than erroring', () => {
    expect(squeezeOn(week([]), HORIZON_DAYS + 3).hours).toBe(0)
  })
})

describe('sleepForecastLine', () => {
  it('says nothing when the day fits', () => {
    expect(sleepForecastLine(squeezeOn(week([item({ hours: 4 })]), 0), 'Thursday')).toBeNull()
  })

  it('names the day and the cost when a deadline drives it', () => {
    expect(sleepForecastLine(squeezeOn(overloaded(0), 0), 'Thursday')).toBe(
      "Thursday's deadline will cost you about 4 hours of sleep.",
    )
  })

  /** An over-full day with nothing due still costs sleep, and still gets said -- without
   *  blaming a deadline that does not exist. */
  it('says a day is over-full without inventing a deadline', () => {
    expect(sleepForecastLine(squeezeOn(overloaded(null), 0), 'Thursday')).toBe(
      'Thursday asks for about 4 hours more than the day has.',
    )
  })

  /** A forecast, never a record: nothing here writes, so the sentence must read as ahead of
   *  the night rather than about it. */
  it('speaks in the future, because nothing was observed', () => {
    const line = sleepForecastLine(squeezeOn(overloaded(0), 0), 'Thursday') ?? ''

    expect(line).toMatch(/will|asks/)
    expect(line).not.toMatch(/you slept|did sleep|last night/i)
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/domain/sleepForecast.test.ts`
Expected: FAIL — module not found. Note: the soft-deadline case may need `softDeadlineDay` to be
a real optional field on `ScheduledItem`; read `src/optimizer/types.ts` and drop the cast if so.

- [ ] **Step 3: Write the module**

`src/domain/sleepForecast.ts`:

```typescript
import { DAY_END_HOUR, WAKE_HOUR, type Schedule } from '../optimizer'
import { blocksOnDay } from './dayBlocks'

/**
 * What an over-full day is going to cost, said before the night rather than after it.
 *
 * `ui/room/dayLoad.ts` has computed this quantity all along -- its `spillHours` is the hours a
 * day asks for beyond a waking day, and its own docstring already says those hours "have to
 * come out of sleep". Nothing ever acted on it: spill only dimmed the room's light and
 * darkened its window. This module says it in words.
 *
 * A FORECAST, and deliberately never a record. Nothing here writes to `sleepByDay`, so the app
 * never asserts what the student slept on a night it did not observe -- the same rule that
 * keeps `todayRows`' bed row silent about a night nobody answered. The consequence, stated
 * rather than hidden: the projection still assumes the planned night on an over-committed day,
 * so it is optimistic there, and this sentence plus the room's own darkening is what covers it.
 *
 * Derived from `WAKE_HOUR` and `DAY_END_HOUR` -- the solver's own boundaries -- so there is no
 * second idea in the codebase of how long a day is.
 */

/** Sixteen hours: the window the solver will place work into. */
const WAKING_HOURS = DAY_END_HOUR - WAKE_HOUR

/** Under half an hour is a day running slightly long, not a night being eaten. Matches
 *  `gaps.MIN_GAP_HOURS`, the smallest span this app considers worth naming at all. */
const WORTH_WARNING_HOURS = 0.5

export interface SleepSqueeze {
  /** Hours the day asks for beyond a waking day. Zero when it fits. */
  readonly hours: number
  /** Whether a REAL deadline falls on this day. Soft deadlines are excluded by design. */
  readonly deadlineToday: boolean
}

/**
 * What this day is going to take out of the night after it.
 *
 * Measured against everything the day asks for rather than what is left of it, for
 * `dayLoad`'s stated reason: a day that could never have fitted was over-committed when it was
 * planned, and working through it one block at a time does not retrospectively make it fit.
 */
export function squeezeOn(schedule: Schedule, dayIndex: number): SleepSqueeze {
  const onDay = blocksOnDay(schedule, dayIndex)
  const asked = onDay.reduce((total, item) => total + item.hours, 0)

  return {
    hours: Math.max(0, Math.round((asked - WAKING_HOURS) * 10) / 10),
    // `deadlineDay`, never `effectiveDeadline`: see the module comment above.
    deadlineToday: onDay.some((item) => item.deadlineDay === dayIndex),
  }
}

/**
 * The sentence, or nothing.
 *
 * Two wordings rather than one, because the two situations are different and conflating them
 * would blame a deadline that does not exist. `dayLabel` is supplied rather than derived:
 * `domain/calendar.dayLabel` is the only place a day index becomes a name, and this module
 * does not get a second one.
 */
export function sleepForecastLine(
  squeeze: SleepSqueeze,
  dayLabel: string,
): string | null {
  if (squeeze.hours < WORTH_WARNING_HOURS) return null

  const cost = squeeze.hours === 1 ? '1 hour' : `${squeeze.hours} hours`

  return squeeze.deadlineToday
    ? `${dayLabel}'s deadline will cost you about ${cost} of sleep.`
    : `${dayLabel} asks for about ${cost} more than the day has.`
}
```

- [ ] **Step 4: Run and watch them pass**

Run: `npx vitest run src/domain/sleepForecast.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/sleepForecast.ts src/domain/sleepForecast.test.ts
git commit -m "feat: warn before a deadline eats the night, without claiming it did"
```

---

## Task 7: Close the settings clobber, then hold the target

`useProfile.setProfile` re-loads settings before writing (`useProfile.ts:119-122`).
`useLowEnergy.setOverride` spreads a **cached** snapshot (`useLowEnergy.ts:67`), so it drops any
field written since its own load. That is latent today and becomes reachable once sleep writes
the same blob often. Fixed first, with a regression test, then the new hook is built on the
correct pattern.

**Files:**
- Modify: `src/ui/useLowEnergy.ts`, `src/ui/useLowEnergy.test.tsx`
- Create: `src/ui/useSleepPlan.ts`, `src/ui/useSleepPlan.test.tsx`

**Interfaces:**
- Produces: `useSleepPlan(repo)` → `{ targetHours, nights, setTarget, reportNight, problem }`.

- [ ] **Step 1: Write the failing regression test**

In `src/ui/useLowEnergy.test.tsx`:

```typescript
/**
 * Regression. This hook spread its own cached snapshot, so a field written by another hook
 * after this one loaded was silently dropped on the next toggle. Latent while settings held
 * only a mode and a calibration profile, and reachable the moment sleep began writing the
 * same blob -- a student could set a sleep target, switch the interface mode, and lose it.
 */
it('does not drop a field written to settings after it loaded', async () => {
  const repo = fakeRepository({ lowEnergyOverride: 'auto' })
  const { result } = renderHook(() => useLowEnergy(repo))
  await waitFor(() => expect(result.current.override).toBe('auto'))

  // Somewhere else writes the blob, the way `useProfile` does.
  await repo.saveSettings({ ...(await repo.loadSettings()), sleepTargetHours: 9 })

  act(() => result.current.setOverride('on'))

  await waitFor(async () =>
    expect((await repo.loadSettings()).sleepTargetHours).toBe(9),
  )
})
```

Use the file's existing fake-repository helper; read the top of the file and follow it.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/ui/useLowEnergy.test.tsx`
Expected: FAIL — `sleepTargetHours` is `undefined`, clobbered by the cached spread.

- [ ] **Step 3: Fix the write**

In `src/ui/useLowEnergy.ts`, replace the body of `setOverride`:

```typescript
  function setOverride(override: StoredSettings['lowEnergyOverride']) {
    setSettings({ ...settings, lowEnergyOverride: override })
    // Re-read before writing, the way `useProfile.setProfile` does. Spreading this hook's own
    // cached snapshot dropped any field another hook had written since -- see the regression
    // test. Applied on screen regardless of whether it persists; the failure is reported, not
    // swallowed.
    repo
      .loadSettings()
      .catch(() => DEFAULT_SETTINGS)
      .then((saved) => repo.saveSettings({ ...saved, lowEnergyOverride: override }))
      .then(() => setProblem(null))
      .catch(() => setProblem(SAVE_FAILED))
  }
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/ui/useLowEnergy.test.tsx`
Expected: PASS, including the file's existing cases.

- [ ] **Step 5: Write the failing tests for the new hook**

`src/ui/useSleepPlan.test.tsx` — cases:

1. Defaults to `DEFAULT_SLEEP_HOURS` when nothing is stored, and reports `hasTarget: false`.
2. Loads a stored target and log.
3. `setTarget(9)` applies immediately on screen and persists.
4. `reportNight('2026-09-12', 'six')` appends to the log and persists.
5. Reporting the same night twice corrects rather than stacks (through `recordNight`).
6. A save failure sets `problem` to `SAVE_FAILED` and does **not** revert what is on screen —
   the convention `useSchedule`, `useBlockLog` and `useLowEnergy` share, and the project's own
   rule that a failed write is never silently swallowed.
7. An unreachable `loadSettings` keeps the defaults rather than rejecting.

- [ ] **Step 6: Write the hook**

`src/ui/useSleepPlan.ts`, following `useLowEnergy`'s structure and `useProfile`'s write
discipline (fresh `loadSettings` before each `saveSettings`). It must **not** hold a second copy
of anything `useLowEnergy` owns.

- [ ] **Step 7: Run and commit**

Run: `npx vitest run src/ui/useSleepPlan.test.tsx src/ui/useLowEnergy.test.tsx && npx tsc --noEmit`

```bash
git add src/ui/useLowEnergy.ts src/ui/useLowEnergy.test.tsx src/ui/useSleepPlan.ts src/ui/useSleepPlan.test.tsx
git commit -m "fix: stop a settings write dropping a field another hook just saved"
```

---

## Task 8: The page

**Files:**
- Create: `src/ui/sleep/SleepSheet.tsx`, `src/ui/sleep/SleepSheet.test.tsx`

**Interfaces:**
- Consumes: `Sheet` from `src/ui/kit/Sheet`, `Button` from `src/ui/kit/Button`; `SLEEP_HOURS`.
- Produces:

```typescript
export function SleepSheet(props: {
  readonly targetHours: number
  /** Tonight and the days ahead, already labelled and already carrying their own forecast. */
  readonly nights: readonly { readonly dayIndex: number; readonly label: string; readonly hours: number; readonly forecast: string | null }[]
  /** Null when there is nothing measured to say, or when low energy withholds it. */
  readonly realityLine: string | null
  readonly onSetTarget: (hours: number) => void
  readonly onSetNight: (dayIndex: number, hours: number) => void
  readonly onClose: () => void
}): JSX.Element
```

Modelled on `src/ui/rest/RestPreview.tsx`: presentational, callbacks only, parent owns every
commit. Target choices reuse `SLEEP_HOURS`' four values so the page and the check-in card cannot
drift apart in vocabulary.

- [ ] **Step 1: Write the failing tests**

Cases, each asserting behaviour rather than markup:

1. Shows the current target.
2. Tapping a target choice calls `onSetTarget` with that figure.
3. Lists a row per night, with its label and its hours.
4. Tapping a night's choice calls `onSetNight` with that day index.
5. Shows a forecast sentence on the night that has one.
6. Renders **no element at all** for a night with no forecast — asserted by absence, not by
   empty text. (An element rendered empty still occupies space and is still announced.)
7. Shows the reality line when given one.
8. Renders **no element** for it when given null.

- [ ] **Step 2: Run, watch fail, write the component, run again**

Run: `npx vitest run src/ui/sleep/SleepSheet.test.tsx` at each stage.

- [ ] **Step 3: Commit**

```bash
git add src/ui/sleep/
git commit -m "feat: a page for the night the student is aiming for"
```

---

## Task 9: The route, the door, and the extraction

**Files:**
- Modify: `src/ui/room/view.ts`, `src/ui/room/view.test.ts`
- Create: `src/ui/settings/SettingsSheet.tsx`
- Modify: `src/ui/room/RoomShell.tsx`, `src/ui/room/RoomShell.routing.test.tsx`
- Create: `src/ui/room/RoomShell.sleep.test.tsx`

- [ ] **Step 1: Write the failing route tests**

In `src/ui/room/view.test.ts`:

```typescript
it('addresses the sleep page', () => {
  expect(toSleep()).toEqual({ kind: 'sleep' })
  expect(toPath(toSleep())).toBe('/sleep')
  expect(fromPath('/sleep')).toEqual({ kind: 'sleep' })
})

/** Top level, opened from the room, so Back returns to the room by the existing fallthrough
 *  rather than by a case of its own. */
it('returns to the room from the sleep page', () => {
  expect(back(toSleep())).toEqual({ kind: 'room' })
})

it('does not mistake a deeper path for the sleep page', () => {
  expect(fromPath('/sleep/tonight')).toEqual({ kind: 'room' })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/ui/room/view.test.ts`
Expected: FAIL — `toSleep` is not exported.

- [ ] **Step 3: Add the route**

In `src/ui/room/view.ts`: a `| { readonly kind: 'sleep' }` member with a comment in the file's
register (a page rather than a card, because the check-in asks about last night once and this is
where a student states the nights ahead whenever they want); a `const SLEEP: View = { kind: 'sleep' }`
singleton; `export const toSleep = (): View => SLEEP`; `case 'sleep': return '/sleep'` in
`toPath`; and `if (first === 'sleep' && parts.length === 1) return SLEEP` in `fromPath`.
`back()` needs no case. The `toPath` switch has no `default`, so omitting the case is a compile
error.

- [ ] **Step 4: Extract the settings body**

Move the body of `RoomShell.tsx`'s `view.kind === 'settings'` block (lines ~837-879) into
`src/ui/settings/SettingsSheet.tsx`, taking exactly what it closes over as props. A pure move:
no behaviour change, no copy change, no test change beyond imports. Reason it is in this task:
`RoomShell.tsx` is 1,155 lines against the 800 ceiling `CLAUDE.md` names as open, and this task
adds to it.

Run the existing settings tests before going on — they must pass untouched.

- [ ] **Step 5: Wire the button and the sheet**

In `RoomShell.tsx`: call `useSleepPlan(repository)` beside the other hooks; add the button to
`room-bar` **immediately after Rest** (`:1013-1015`) and **outside** the `!lowEnergy` guards,
because stating your sleep is a restorative action rather than a dashboard; render `SleepSheet`
in the `sheets` block on `view.kind === 'sleep'`, closed by the existing `closeToRoom`.

Compose its props there: `seedSleepPlan` on a target change, `withSleepHours` on a night change,
`squeezeOn` + `sleepForecastLine` + `dayLabel` per night, and `sleepRealityLine` — passed as
`null` when low energy is active, consistent with low energy already withholding the reserve
breakdown. A judgement about the student is exactly what that mode exists to hold back.

The bar already overflows at 320px and relies on `flex-wrap`, so position decides what survives
the first line. `pr-16` reserves the gauge corner; do not disturb it.

- [ ] **Step 6: Write the shell tests**

`src/ui/room/RoomShell.sleep.test.tsx`:

1. The room shows a sleep button.
2. Pressing it opens the page.
3. Setting a target moves every unedited night.
4. Setting one night leaves the others.
5. Reporting a night through the existing today card still works and now survives a remount
   (the re-asking defect from Task 3).
6. The reality line is absent in low-energy mode and present outside it.

- [ ] **Step 7: Run everything**

Run: `npx tsc --noEmit && npm test`

- [ ] **Step 8: Commit**

```bash
git add src/ui/room/view.ts src/ui/room/view.test.ts src/ui/settings/SettingsSheet.tsx src/ui/room/RoomShell.tsx src/ui/room/RoomShell.sleep.test.tsx src/ui/room/RoomShell.routing.test.tsx
git commit -m "feat: a door to sleep in the room, and settings in its own component"
```

---

## Task 10: The bed measures the student, and can finally speak

Two changes that only become honest once Task 2 exists.

**Files:**
- Modify: `src/ui/room/roomState.ts`, `src/ui/room/roomState.test.ts`,
  `src/ui/room/roomModel.ts`, `src/ui/room/todayRows.ts`, `src/ui/room/todayRows.test.ts`
- Modify: `src/ui/today/TodayCard.tsx`, `src/ui/today/TodayCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

`roomState.test.ts`:

```typescript
/**
 * `RESTED_NIGHT_HOURS`' own docstring asked for exactly this: it is a population norm, and
 * "for a student who needs nine hours the bed under-reports", which "wants the same
 * calibration the engine's side is waiting on". A stated target is that calibration.
 */
it('measures sleep debt against a target the student set', () => {
  const state = roomStateFor(/* … */, { targetHours: 9 })

  expect(state.sleepDebt).toBeCloseTo(2)
})

/**
 * And falls back to the population norm when nobody has stated one -- NOT to
 * `DEFAULT_SLEEP_HOURS`. Those are different questions: 8 is the night the app assumes, 7 is
 * where a student counts as short. Conflating them would make the bed wilt for every student
 * who had never opened the page.
 */
it('keeps the population norm when no target was set', () => {
  const state = roomStateFor(/* …7h nights, no target… */, {})

  expect(state.sleepDebt).toBe(0)
})
```

`todayRows.test.ts`:

```typescript
/** The bed's trend was withheld for one stated reason -- the row could not tell an answered
 *  night from a default. `sleepLog` removes exactly that, so the row speaks when it has
 *  evidence. */
it('gives the bed a trend once nights have actually been answered', () => {
  const row = panelRowsFor(/* …3 answered nights, falling… */).find((r) => r.id === 'bed')

  expect(row?.trend).toBe('easing off')
})

/** And still says nothing on defaults, which is the original defect and must stay fixed. */
it('still withholds the bed trend when no night was answered', () => {
  const row = panelRowsFor(/* …no log… */).find((r) => r.id === 'bed')

  expect(row?.trend).toBeNull()
})
```

`TodayCard.test.tsx`: the sleep reality line shows when `sleepRealityLine` returns one, and no
element renders when it returns null. Placed **below** the four bucket buttons, matching
`biasLine`'s placement and its stated reason (above them it nudges the answer and undoes Ruling
22's visual equality).

- [ ] **Step 2: Run, watch fail, implement, run again**

Thread the target into `roomStateFor` through `roomModel`. Replace the bed row's hardcoded
`trend: null` with a trend over answered nights, reusing `objectTrend`/`trendPhrase` from
`src/ui/room/objectTrend.ts`. **Update both of the bed row's comments** — they state a reason
that no longer holds, and they are cited from two places.

- [ ] **Step 3: Commit**

```bash
git add src/ui/room/roomState.ts src/ui/room/roomState.test.ts src/ui/room/roomModel.ts src/ui/room/todayRows.ts src/ui/room/todayRows.test.ts src/ui/today/TodayCard.tsx src/ui/today/TodayCard.test.tsx
git commit -m "feat: the bed measures the student, and speaks once it has evidence"
```

---

## Task 11: Telegram writes the same fact

The bot's sleep callback must write the log as well as the plan, or a night reported on the phone
and one reported in the app stop being one fact — the property `handle.ts:755`'s comment already
claims.

**Files:**
- Modify: `src/telegram/handle.ts:757`, `src/telegram/handle.test.ts`
- Modify: `src/data/types.ts` only if the bot needs a settings read it does not already have —
  check first; do not widen the interface speculatively.

- [ ] **Step 1: Write the failing test**

That reporting a night over Telegram leaves the app able to tell it was answered — asserted
through `reportedOn`, not through `sleepByDay`, since the defect is precisely that `sleepByDay`
cannot answer it.

- [ ] **Step 2: Run, watch fail, implement, run again**

Run: `npx vitest run src/telegram/`

- [ ] **Step 3: Commit**

```bash
git add src/telegram/handle.ts src/telegram/handle.test.ts
git commit -m "feat: a night reported on the phone is the same night in the app"
```

---

## Task 12: The browser suite

**Files:**
- Modify: `tests/e2e/room.spec.ts`
- Create: `tests/e2e/sleep.spec.ts`

- [ ] **Step 1: Add the cases**

1. The sleep button is reachable and opens `/sleep` at 320, 390, 768 and 1280 wide — the four
   viewports `room.spec.ts` already asserts the bar at. The bar overflows at 320 and wraps, so
   this is the case most likely to fail.
2. Setting a target changes what the page shows.
3. `/sleep` typed directly opens the page.
4. The existing control-bar clearance assertions still pass, **unmodified**. If the new button
   breaks a clearance assertion, the button's label or position changes — never the assertion.

- [ ] **Step 2: Run**

Run: `npm run test:e2e`

Playwright's `webServer` builds with **blanked credentials** on purpose. Do not reuse a
credentialed dev server; if one is already on 5180, run on another port rather than pointing the
suite at it.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/
git commit -m "test: reach the sleep page in a real browser at every width"
```

---

## Final verification

- [ ] `npx tsc --noEmit` clean.
- [ ] `npm test` green. Every re-derived fixture named in its commit message, no assertion
      weakened, nothing skipped.
- [ ] `npm run test:coverage` — thresholds met or raised, never lowered.
- [ ] `npm run measure:solve` inside §2.1's 100ms budget for the ordinary week.
- [ ] `npm run test:e2e` green.
- [ ] `npm run dev` and drive it by hand on the crunch fixture (5.5h weeknights): set a target
      and watch the fortnight move; report three short nights and confirm the reality line
      appears **and not before**; pack a day past midnight with a deadline on it and confirm the
      forecast sentence appears **and that nothing was written to the week**.
- [ ] Scratch probe scripts deleted.
- [ ] `docs/rulings.md` gains the three decisions taken here (guess not promise; forecast not
      record; target seeds the plan, population norm still sets the shortfall line), and
      `CLAUDE.md`'s repository status is updated. `burnout-app-spec-v3.md` §7.7's "Not built"
      note on the sleep baseline stays — this plan does not build it.
- [ ] Nothing touched a credential, the Groq endpoints, the live Telegram webhook, or a real
      database.

---

## Self-review

**Spec coverage.** Every unit of the approved plain-language plan maps to a task: Unit 1 → Task 1;
Unit 2 → Task 3; Unit 3 → Task 4; Unit 4 → Tasks 2, 3, 11; Unit 5 → Tasks 5, 10; Unit 6 → Task 6;
Unit 7 → Task 10; Unit 8 → Task 10; Unit 9 → Tasks 8, 9. Task 7's clobber fix and Task 12's
browser cases are additions found while planning; the first is named as scope with its reason,
the second is required by the project's own rule that behaviour ships with its tests.

**Placeholders.** Tasks 1-6 carry complete code. Tasks 7-12 carry complete signatures, complete
test-case lists and exact commands, with bodies left to the implementer where the body is
mechanical and the file it must match has to be read anyway (`useLowEnergy`'s fake repository,
`RoomShell`'s closures, `roomStateFor`'s argument list). That is a deliberate line, not an
omission: each of those touches a file whose current shape the implementer must read first, and
inventing its details here would produce code that does not compile against it.

**Type consistency.** `SleepNight` is defined in Task 2 and consumed with the same field names in
Tasks 3, 5 and 11. `SleepSqueeze` is defined in Task 6 and consumed in Task 9. `withSleepHours`
and `seedSleepPlan` are defined in Task 4 and consumed in Task 9. `measuredNight` and
`sleepRealityLine` are defined in Task 5 and consumed in Tasks 9 and 10. `DEFAULT_SLEEP_HOURS` is
defined in Task 1 and consumed in Tasks 1 and 7 — and deliberately **not** in Task 10, where the
population norm is the right figure and the two must not be conflated.

**One open risk, named rather than hidden.** Task 1 makes an unanswered week recover more, which
moves projection baselines across the suite. The number of knife-edge fixtures that move is not
knowable before running it. If it turns out to be large, stop and report rather than
bulk-adjusting: a wide fixture sweep is exactly where an assertion gets quietly weakened.
