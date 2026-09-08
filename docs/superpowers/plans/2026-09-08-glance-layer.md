# Glance Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the tested-but-invisible engine into the spec's Focus 1 — a capacity dial with five domain bars, low-energy mode, a week that survives a reload, and an installable PWA.

**Architecture:** A `Repository` interface with two interchangeable adapters (IndexedDB and Supabase), chosen once at startup from whether Supabase env vars are present, so the whole app runs and every test passes with no secrets. Above it, a hand-rolled SVG dial in `src/ui/dial/` that reads the engine's projection and derives five UI labels from the model's four load types. Nothing in `src/engine/` or `src/optimizer/` changes.

**Tech Stack:** React 19, TypeScript 7 (strict, `noUncheckedIndexedAccess`), Tailwind 4, Vitest 4 + Testing Library, Playwright, `@supabase/supabase-js`, `idb-keyval` for IndexedDB.

**Spec:** [`docs/superpowers/specs/2026-09-08-stress-workload-manager-design.md`](../specs/2026-09-08-stress-workload-manager-design.md), implementing [`burnout-app-spec-v3.md`](../../../burnout-app-spec-v3.md) §1. Approved plain-language plan: `C:\Users\den51\.claude\plans\crispy-floating-river.md`. Read all three.

## Global Constraints

Every task's requirements implicitly include this section.

- **Nothing in `src/engine/` or `src/optimizer/` may change.** They are tested and correct; this plan sits above them. If a task seems to need a change there, stop and flag it.
- **Four load types in the model, five labels in the UI.** §0: schedule density is a derived view, not a fifth reserve. The derivation lives in `src/ui/`, never in `src/engine/`.
- **Low social is a warning, not a good score** (§1.2). Its bar is bad in the opposite direction from the others.
- **Severity is never carried by colour alone** (§1.5). Every bar pairs colour with a trend glyph (▲ ▬ ▼) and a text label.
- **Full text equivalent of every dial value** (§1.5), as a primary view rather than a fallback.
- **No cold start** (§0). Every screen renders something useful with zero user data.
- **Responsive at 320 / 390 / 768 / 1280px** (§0, §10). Mobile-first at 390px, no horizontal scroll at any width. The dial is SVG with a `viewBox` and `width: 100%` so it scales without a media query.
- **One-handed reachability** (§0): primary actions in the lower half of the viewport on mobile.
- **No API key ever reaches the browser** (§10 constraint 1) — but note the Supabase *anon* key is designed to be public and is the only one used here. `SUPABASE_DIRECT_CONNECTION_STRING` and `GROQ_API_KEY` must never gain a `VITE_` prefix.
- **Immutability.** Every update returns a new object; never mutate an argument.
- **Files 200–400 lines, 800 max; functions under 50 lines.**
- **TDD, red before green.** Write the test, run it, watch it fail for the right reason, then implement. Tests ship in the same commit as the behaviour.
- **Never `git push`** without explicit confirmation. Commit freely.
- **Commit format:** `<type>: <description>`, ending `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

### Fixed values

| Constant | Value | Source |
|---|---|---|
| `DIAL_MAX_PERCENT` | `120` | §1.2 ("0 to 120%, needle past the maximum when overloaded") |
| `LOW_ENERGY_THRESHOLD` | `20` | §1.5 ("below a reserve threshold"); §7.6's 30 is the deficit line, this is lower |
| `TREND_WINDOW_DAYS` | `3` | Enough contrast without reacting to a single day |
| `TREND_EPSILON` | `1.5` | Reserve points; below this a bar reads flat rather than jittering |
| `SOCIAL_FLOOR_PERCENT` | `40` | Below this social reads as a warning (§1.2) |

---

## File Structure

```
src/
  data/
    types.ts              Repository interface + StoredWeek/StoredSettings shapes
    env.ts                readDataConfig() — reads VITE_SUPABASE_* from import.meta.env
    localRepository.ts    IndexedDB adapter
    supabaseRepository.ts Supabase adapter
    createRepository.ts   Picks the adapter once, at startup
    index.ts              Public surface
  ui/
    dial/
      domainBars.ts       Four reserves + schedule density -> five labelled bars
      trend.ts            Rising / flat / falling per bar
      dialGeometry.ts     Arc and needle maths for the gauge
      dialText.ts         The §1.5 spoken-word equivalent
      CapacityDial.tsx    The gauge
      DomainBarList.tsx   The five bars
    lowEnergy.ts          Threshold + decision rule
    useLowEnergy.ts       Hook wrapping the rule and the stored preference
    LowEnergyView.tsx     One number, one action
    useSchedule.ts        Loads/saves the week through the repository
    HomeScreen.tsx        Composes the above
    App.tsx               (modified) composes HomeScreen + repository
  pwa/
    registerServiceWorker.ts
public/
  manifest.webmanifest
  icon-192.png, icon-512.png
  sw.js
scripts/
  generate-icons.mjs
supabase/migrations/
  0001_initial.sql
```

Tests colocate as `src/**/*.test.{ts,tsx}` — `vitest.config.ts` already includes that glob.

---

## Task 1: The repository interface and its contract

**Files:**
- Create: `src/data/types.ts`, `src/data/localRepository.ts`, `src/data/repositoryContract.ts`, `src/data/localRepository.test.ts`
- Modify: `package.json` (add `idb-keyval`)

**Interfaces:**
- Consumes: `Schedule` from `src/optimizer`.
- Produces:
  - `interface StoredSettings { readonly lowEnergyOverride: 'auto' | 'on' | 'off' }`
  - `interface Repository { loadWeek(): Promise<Schedule | null>; saveWeek(week: Schedule): Promise<void>; loadSettings(): Promise<StoredSettings>; saveSettings(s: StoredSettings): Promise<void>; clear(): Promise<void> }`
  - `const DEFAULT_SETTINGS: StoredSettings`
  - `function createLocalRepository(): Repository`
  - `function describeRepositoryContract(name: string, make: () => Repository): void`

- [ ] **Step 1: Install the IndexedDB helper**

```bash
npm install idb-keyval
```

`idb-keyval` rather than raw IndexedDB: the raw API is event-based and needs ~60 lines of promise wrapping that would itself need testing. It is 1KB and has no dependencies.

- [ ] **Step 2: Write the failing contract suite**

`src/data/repositoryContract.ts` — a suite both adapters run, so they cannot drift:

```ts
import { expect, it, describe, beforeEach } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { DEFAULT_SETTINGS, type Repository } from './types'

const week = (mental: number): Schedule => ({
  items: [],
  start: { mental, physical: 60, social: 50, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

/**
 * Run against every adapter. The Supabase one is not exercised in CI -- there are no
 * secrets there by design -- so this suite is what stops the two implementations
 * quietly meaning different things.
 */
export function describeRepositoryContract(name: string, make: () => Repository): void {
  describe(`${name} (repository contract)`, () => {
    let repo: Repository

    beforeEach(async () => {
      repo = make()
      await repo.clear()
    })

    // §0's no-cold-start rule reaches this far down: a first-run read must be an
    // absence the caller can handle, never a throw.
    it('returns null for a week that was never saved', async () => {
      expect(await repo.loadWeek()).toBeNull()
    })

    it('returns what was saved', async () => {
      await repo.saveWeek(week(42))
      expect((await repo.loadWeek())?.start.mental).toBe(42)
    })

    it('replaces the week rather than accumulating', async () => {
      await repo.saveWeek(week(42))
      await repo.saveWeek(week(17))
      expect((await repo.loadWeek())?.start.mental).toBe(17)
    })

    it('falls back to default settings before any are saved', async () => {
      expect(await repo.loadSettings()).toEqual(DEFAULT_SETTINGS)
    })

    it('returns saved settings', async () => {
      await repo.saveSettings({ lowEnergyOverride: 'on' })
      expect((await repo.loadSettings()).lowEnergyOverride).toBe('on')
    })

    it('forgets everything after clear', async () => {
      await repo.saveWeek(week(42))
      await repo.saveSettings({ lowEnergyOverride: 'off' })
      await repo.clear()

      expect(await repo.loadWeek()).toBeNull()
      expect(await repo.loadSettings()).toEqual(DEFAULT_SETTINGS)
    })

    it('round-trips a week without losing its shape', async () => {
      const original = week(55)
      await repo.saveWeek(original)
      expect(await repo.loadWeek()).toEqual(original)
    })
  })
}
```

`src/data/localRepository.test.ts`:

```ts
import { describeRepositoryContract } from './repositoryContract'
import { createLocalRepository } from './localRepository'

describeRepositoryContract('localRepository', createLocalRepository)
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/data`
Expected: FAIL — cannot resolve `./types` and `./localRepository`.

- [ ] **Step 4: Write the types**

`src/data/types.ts`:

```ts
import type { Schedule } from '../optimizer'

/** §1.5's low-energy mode is a product decision as much as an accessibility one, so the
 *  user can force it either way rather than only having it inferred. */
export interface StoredSettings {
  readonly lowEnergyOverride: 'auto' | 'on' | 'off'
}

export const DEFAULT_SETTINGS: StoredSettings = { lowEnergyOverride: 'auto' }

/**
 * The only persistence vocabulary the app knows.
 *
 * Two adapters implement it and the choice is made once at startup, so no screen learns
 * whether it is talking to IndexedDB or Supabase. That is what lets CI run green with no
 * secrets, and what keeps the demo alive if the network dies on stage.
 */
export interface Repository {
  loadWeek(): Promise<Schedule | null>
  saveWeek(week: Schedule): Promise<void>
  loadSettings(): Promise<StoredSettings>
  saveSettings(settings: StoredSettings): Promise<void>
  clear(): Promise<void>
}
```

- [ ] **Step 5: Write the local adapter**

`src/data/localRepository.ts`:

```ts
import { clear, createStore, get, set } from 'idb-keyval'
import type { Schedule } from '../optimizer'
import { DEFAULT_SETTINGS, type Repository, type StoredSettings } from './types'

const WEEK_KEY = 'week'
const SETTINGS_KEY = 'settings'

export function createLocalRepository(): Repository {
  // A named store rather than the default one, so clearing this app's data cannot
  // disturb anything else the origin happens to keep in IndexedDB.
  const store = createStore('codenection', 'state')

  return {
    async loadWeek() {
      return (await get<Schedule>(WEEK_KEY, store)) ?? null
    },
    async saveWeek(week) {
      await set(WEEK_KEY, week, store)
    },
    async loadSettings() {
      return (await get<StoredSettings>(SETTINGS_KEY, store)) ?? DEFAULT_SETTINGS
    },
    async saveSettings(settings) {
      await set(SETTINGS_KEY, settings, store)
    },
    async clear() {
      await clear(store)
    },
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/data`
Expected: PASS, 7 tests.

If IndexedDB is missing under jsdom, add `fake-indexeddb` as a dev dependency and import `fake-indexeddb/auto` at the top of `src/test-setup.ts`. jsdom does not ship an IndexedDB implementation.

- [ ] **Step 7: Commit**

```bash
git add src/data package.json package-lock.json src/test-setup.ts
git commit -m "$(cat <<'EOF'
feat: add the repository interface and its local adapter

One persistence vocabulary with two interchangeable implementations
behind it, so no screen ever learns whether it is talking to IndexedDB
or Supabase.

The contract suite is the point rather than a nicety: the Supabase
adapter cannot be exercised in CI, because there are no secrets there
by design, so a shared suite both adapters run is what stops the two
quietly meaning different things.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: The Supabase adapter and its migration

**Files:**
- Create: `src/data/env.ts`, `src/data/supabaseRepository.ts`, `src/data/createRepository.ts`, `src/data/index.ts`, `src/data/createRepository.test.ts`, `src/data/env.test.ts`, `supabase/migrations/0001_initial.sql`, `.env.example`
- Modify: `package.json` (add `@supabase/supabase-js`)

**Interfaces:**
- Consumes: `Repository`, `StoredSettings`, `DEFAULT_SETTINGS` from `./types`; `createLocalRepository` from `./localRepository`.
- Produces:
  - `interface DataConfig { readonly supabaseUrl: string | null; readonly supabaseAnonKey: string | null }`
  - `function readDataConfig(env?: Record<string, string | undefined>): DataConfig`
  - `function createSupabaseRepository(url: string, anonKey: string): Repository`
  - `function createRepository(config?: DataConfig): Repository`

- [ ] **Step 1: Install the client**

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: Write the failing tests**

`src/data/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readDataConfig } from './env'

describe('readDataConfig', () => {
  it('reads both Supabase values when present', () => {
    const config = readDataConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
    })

    expect(config.supabaseUrl).toBe('https://example.supabase.co')
    expect(config.supabaseAnonKey).toBe('anon-key')
  })

  it('reports nulls when nothing is configured', () => {
    expect(readDataConfig({})).toEqual({ supabaseUrl: null, supabaseAnonKey: null })
  })

  // Half a configuration is a misconfiguration, and silently running on one value would
  // produce a client that fails at the first request instead of at startup.
  it('treats a half-configured environment as unconfigured', () => {
    expect(readDataConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co' }))
      .toEqual({ supabaseUrl: null, supabaseAnonKey: null })
  })

  it('ignores blank values', () => {
    expect(readDataConfig({ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_ANON_KEY: '' }))
      .toEqual({ supabaseUrl: null, supabaseAnonKey: null })
  })
})
```

`src/data/createRepository.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createRepository } from './createRepository'

describe('createRepository', () => {
  // The behaviour that keeps CI green without secrets and the demo alive without a
  // network: absent configuration is a supported state, not an error.
  it('falls back to the local adapter when Supabase is not configured', () => {
    const repo = createRepository({ supabaseUrl: null, supabaseAnonKey: null })

    expect(typeof repo.loadWeek).toBe('function')
    expect(typeof repo.saveWeek).toBe('function')
  })

  it('returns a repository whatever the configuration', () => {
    const repo = createRepository({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key',
    })

    expect(typeof repo.loadWeek).toBe('function')
  })
})
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run src/data/env.test.ts src/data/createRepository.test.ts`
Expected: FAIL — cannot resolve `./env` and `./createRepository`.

- [ ] **Step 4: Write the env reader**

`src/data/env.ts`:

```ts
export interface DataConfig {
  readonly supabaseUrl: string | null
  readonly supabaseAnonKey: string | null
}

const clean = (value: string | undefined): string | null => {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

/**
 * Only `VITE_`-prefixed variables reach the browser, and that prefix is a deliberate
 * boundary rather than a naming convention: Vite inlines those values into the bundle
 * verbatim. The Supabase *anon* key is designed to be public and is safe there. The
 * database connection string and the Groq key are not, and must never gain the prefix
 * (§10 constraint 1).
 */
export function readDataConfig(
  env: Record<string, string | undefined> = import.meta.env as unknown as Record<
    string,
    string | undefined
  >,
): DataConfig {
  const supabaseUrl = clean(env.VITE_SUPABASE_URL)
  const supabaseAnonKey = clean(env.VITE_SUPABASE_ANON_KEY)

  // Half a configuration is a misconfiguration. Running on one value would build a
  // client that fails at its first request rather than at startup, which is a much
  // harder failure to diagnose.
  if (supabaseUrl === null || supabaseAnonKey === null) {
    return { supabaseUrl: null, supabaseAnonKey: null }
  }

  return { supabaseUrl, supabaseAnonKey }
}
```

- [ ] **Step 5: Write the Supabase adapter**

`src/data/supabaseRepository.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import type { Schedule } from '../optimizer'
import { DEFAULT_SETTINGS, type Repository, type StoredSettings } from './types'

/** One row per user holding the whole week as JSON. The schedule's shape is still
 *  changing every plan, and a normalised schema would have to change with it for no gain
 *  while there is exactly one reader. */
const TABLE = 'user_state'
const SINGLETON_ID = 'me'

export function createSupabaseRepository(url: string, anonKey: string): Repository {
  const client = createClient(url, anonKey)

  async function readRow(): Promise<{ week: Schedule | null; settings: StoredSettings } | null> {
    const { data, error } = await client
      .from(TABLE)
      .select('week, settings')
      .eq('id', SINGLETON_ID)
      .maybeSingle()

    if (error) throw new Error(`Could not read saved state: ${error.message}`)
    if (!data) return null

    return {
      week: (data.week as Schedule | null) ?? null,
      settings: (data.settings as StoredSettings | null) ?? DEFAULT_SETTINGS,
    }
  }

  async function writeRow(patch: Record<string, unknown>): Promise<void> {
    const { error } = await client.from(TABLE).upsert({ id: SINGLETON_ID, ...patch })
    if (error) throw new Error(`Could not save state: ${error.message}`)
  }

  return {
    async loadWeek() {
      return (await readRow())?.week ?? null
    },
    async saveWeek(week) {
      await writeRow({ week })
    },
    async loadSettings() {
      return (await readRow())?.settings ?? DEFAULT_SETTINGS
    },
    async saveSettings(settings) {
      await writeRow({ settings })
    },
    async clear() {
      const { error } = await client.from(TABLE).delete().eq('id', SINGLETON_ID)
      if (error) throw new Error(`Could not clear state: ${error.message}`)
    },
  }
}
```

- [ ] **Step 6: Write the factory and the barrel**

`src/data/createRepository.ts`:

```ts
import { createLocalRepository } from './localRepository'
import { readDataConfig, type DataConfig } from './env'
import { createSupabaseRepository } from './supabaseRepository'
import type { Repository } from './types'

/**
 * Chooses the adapter once, at startup.
 *
 * An unconfigured environment is a supported state rather than an error: it is what CI
 * runs in, and §10's "nothing is called live on stage" instinct applies here too -- an
 * app that still works with no backend is one that cannot be broken by a bad network
 * during judging.
 */
export function createRepository(config: DataConfig = readDataConfig()): Repository {
  if (config.supabaseUrl !== null && config.supabaseAnonKey !== null) {
    return createSupabaseRepository(config.supabaseUrl, config.supabaseAnonKey)
  }

  return createLocalRepository()
}
```

`src/data/index.ts`:

```ts
export { DEFAULT_SETTINGS, type Repository, type StoredSettings } from './types'
export { readDataConfig, type DataConfig } from './env'
export { createLocalRepository } from './localRepository'
export { createSupabaseRepository } from './supabaseRepository'
export { createRepository } from './createRepository'
```

- [ ] **Step 7: Write the migration and the env example**

`supabase/migrations/0001_initial.sql`:

```sql
-- One row per user, holding the whole week as JSON.
--
-- Deliberately not normalised: the schedule's shape changes with every plan in this
-- project, and a relational schema would have to change with it for no benefit while
-- there is exactly one reader.
--
-- NOT APPLIED AUTOMATICALLY. Applying this to a real project is a human action.
create table if not exists public.user_state (
  id          text primary key,
  week        jsonb,
  settings    jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.user_state enable row level security;

-- Placeholder policy for the single-user demo. Before this holds more than one
-- student's data, replace `id` with `auth.uid()` and drop the anon grant -- the anon
-- key is public by design, so this policy as written lets any visitor read the row.
create policy "demo singleton access"
  on public.user_state
  for all
  using (id = 'me')
  with check (id = 'me');
```

`.env.example`:

```
# Client-side. Vite inlines VITE_-prefixed values into the browser bundle, so only
# values that are safe to publish may carry the prefix. The Supabase anon key is
# designed to be public; the two below are not and must never gain it.
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Server-side only, for /api routes and migrations. Never VITE_-prefixed.
SUPABASE_DIRECT_CONNECTION_STRING=
GROQ_API_KEY=
```

- [ ] **Step 8: Run the tests and typecheck**

Run: `npx vitest run src/data && npm run typecheck`
Expected: PASS, 13 tests. Typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add src/data supabase .env.example package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat: add the Supabase adapter, the schema and the adapter choice

The adapter is picked once at startup from whether the Supabase
variables are present, and an unconfigured environment is a supported
state rather than an error -- it is what CI runs in, and an app that
still works with no backend cannot be broken by a bad network during
judging.

Half a configuration counts as unconfigured. Running on one of the two
values would build a client that fails at its first request rather than
at startup, which is a far harder failure to place.

The migration is committed but never applied automatically: writing to
a real project is a human action. Its row-level-security policy is
marked as demo-only, because the anon key is public by design and the
policy as written lets any visitor read the singleton row.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Five bars from four reserves

**Files:**
- Create: `src/ui/dial/domainBars.ts`, `src/ui/dial/trend.ts`, `src/ui/dial/domainBars.test.ts`, `src/ui/dial/trend.test.ts`

**Interfaces:**
- Consumes: `LOAD_TYPES`, `Reserves`, `Projection`, `DayInput` from `src/engine`.
- Produces:
  - `type BarStatus = 'healthy' | 'stretched' | 'critical'`
  - `type Trend = 'rising' | 'flat' | 'falling'`
  - `interface DomainBar { readonly key: string; readonly label: string; readonly value: number; readonly ceiling: number; readonly status: BarStatus; readonly trend: Trend; readonly warning: string | null }`
  - `function scheduleDensity(days: readonly DayInput[]): number`
  - `function domainBars(reserves: Reserves, projection: Projection, days: readonly DayInput[]): DomainBar[]`
  - `function trendOf(series: readonly number[]): Trend`

- [ ] **Step 1: Write the failing tests**

`src/ui/dial/trend.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { trendOf } from './trend'

describe('trendOf', () => {
  it('reads a climbing series as rising', () => {
    expect(trendOf([40, 50, 60])).toBe('rising')
  })

  it('reads a dropping series as falling', () => {
    expect(trendOf([60, 50, 40])).toBe('falling')
  })

  it('reads a steady series as flat', () => {
    expect(trendOf([50, 50, 50])).toBe('flat')
  })

  // Without a deadband every bar flickers between arrows on noise, which makes the
  // glyph useless exactly where §1.5 relies on it to carry severity without colour.
  it('reads a barely-moving series as flat rather than jittering', () => {
    expect(trendOf([50, 50.4, 50.8])).toBe('flat')
  })

  it('reads too short a series as flat', () => {
    expect(trendOf([50])).toBe('flat')
    expect(trendOf([])).toBe('flat')
  })

  it('uses only the most recent days', () => {
    expect(trendOf([0, 0, 60, 50, 40])).toBe('falling')
  })
})
```

`src/ui/dial/domainBars.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS, project, type DayInput, type Reserves } from '../../engine'
import { domainBars, scheduleDensity } from './domainBars'

const healthy: Reserves = { mental: 80, physical: 80, social: 80, errands: 80 }

const emptyDays = (): DayInput[] =>
  Array.from({ length: HORIZON_DAYS }, (_, dayIndex) => ({
    dayIndex,
    activities: [],
    sleepHours: 7,
    venueChanges: 0,
    daysToNearestDeadline: null,
    checkedIn: true,
  }))

const busyDays = (): DayInput[] =>
  emptyDays().map((day) => ({
    ...day,
    activities: [
      { kind: 'studyBlock' as const, type: 'mental' as const, hours: 6, intensity: 1, startHour: 9 },
    ],
  }))

describe('scheduleDensity', () => {
  it('is zero for an empty fortnight', () => {
    expect(scheduleDensity(emptyDays())).toBe(0)
  })

  it('rises with committed hours', () => {
    expect(scheduleDensity(busyDays())).toBeGreaterThan(scheduleDensity(emptyDays()))
  })

  it('never exceeds its ceiling however packed the week', () => {
    const crammed = emptyDays().map((day) => ({
      ...day,
      activities: [
        { kind: 'studyBlock' as const, type: 'mental' as const, hours: 24, intensity: 1, startHour: 0 },
      ],
    }))

    expect(scheduleDensity(crammed)).toBeLessThanOrEqual(100)
  })
})

describe('domainBars', () => {
  const bars = () => domainBars(healthy, project(healthy, emptyDays(), DEFAULT_PARAMS), emptyDays())

  // §0: the brief lists five areas and the UI surfaces five labels, while the model
  // underneath uses four. Schedule density is the derived fifth.
  it('produces exactly five bars', () => {
    expect(bars()).toHaveLength(5)
  })

  it('includes a schedule bar that is not one of the four load types', () => {
    expect(bars().map((bar) => bar.key)).toContain('schedule')
  })

  it('gives every bar its own ceiling rather than a shared scale', () => {
    for (const bar of bars()) {
      expect(bar.ceiling).toBeGreaterThan(0)
      expect(bar.value).toBeLessThanOrEqual(bar.ceiling)
    }
  })

  it('gives every bar a trend glyph, so severity is never colour alone', () => {
    for (const bar of bars()) {
      expect(['rising', 'flat', 'falling']).toContain(bar.trend)
    }
  })

  // §1.2, the single most important assertion in this file: most trackers would count a
  // quiet social life as healthy. Flagging it proves the model understands burnout
  // rather than summing hours.
  it('flags low social as a warning rather than as a good score', () => {
    const isolated: Reserves = { ...healthy, social: 10 }
    const social = domainBars(
      isolated,
      project(isolated, emptyDays(), DEFAULT_PARAMS),
      emptyDays(),
    ).find((bar) => bar.key === 'social')

    expect(social?.status).not.toBe('healthy')
    expect(social?.warning).toMatch(/social|people|alone/i)
  })

  it('does not flag a healthy social reserve', () => {
    const social = bars().find((bar) => bar.key === 'social')

    expect(social?.status).toBe('healthy')
    expect(social?.warning).toBeNull()
  })

  it('flags a drained mental reserve', () => {
    const drained: Reserves = { ...healthy, mental: 8 }
    const mental = domainBars(
      drained,
      project(drained, emptyDays(), DEFAULT_PARAMS),
      emptyDays(),
    ).find((bar) => bar.key === 'mental')

    expect(mental?.status).toBe('critical')
  })

  it('labels every bar in words a student would use', () => {
    for (const bar of bars()) {
      expect(bar.label.length).toBeGreaterThan(0)
      expect(bar.label).not.toMatch(/^[a-z]+$/)
    }
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ui/dial`
Expected: FAIL — cannot resolve `./trend` and `./domainBars`.

- [ ] **Step 3: Write the trend module**

`src/ui/dial/trend.ts`:

```ts
export type Trend = 'rising' | 'flat' | 'falling'

const TREND_WINDOW_DAYS = 3
/** Reserve points. Below this a bar reads flat rather than flickering between arrows on
 *  noise -- which would make the glyph useless exactly where §1.5 relies on it to carry
 *  severity without colour. */
const TREND_EPSILON = 1.5

export function trendOf(series: readonly number[]): Trend {
  const window = series.slice(-TREND_WINDOW_DAYS)
  if (window.length < 2) return 'flat'

  const first = window[0]!
  const last = window[window.length - 1]!
  const change = last - first

  if (Math.abs(change) < TREND_EPSILON) return 'flat'
  return change > 0 ? 'rising' : 'falling'
}
```

- [ ] **Step 4: Write the domain bars**

`src/ui/dial/domainBars.ts`:

```ts
import { LOAD_TYPES, type DayInput, type LoadType, type Projection, type Reserves } from '../../engine'
import { trendOf, type Trend } from './trend'

export type BarStatus = 'healthy' | 'stretched' | 'critical'

export interface DomainBar {
  readonly key: string
  readonly label: string
  readonly value: number
  readonly ceiling: number
  readonly status: BarStatus
  readonly trend: Trend
  /** Plain-language reason this bar is not healthy, or null. Paired with the status so
   *  severity is never carried by colour alone (§1.5). */
  readonly warning: string | null
}

const CEILING = 100
const CRITICAL_BELOW = 20
const STRETCHED_BELOW = 40
/** §1.2: below this, social reads as a warning rather than as a quiet week. */
const SOCIAL_FLOOR_PERCENT = 40

/** Hours in a day beyond which a student's schedule is effectively full. Not 24: sleep,
 *  eating and travel are not free. */
const FULL_DAY_HOURS = 12

const LABELS: Record<LoadType, string> = {
  mental: 'Study & thinking',
  physical: 'Body & movement',
  social: 'People',
  errands: 'Life admin',
}

/**
 * §0: schedule density is a derived view, not a fifth reserve.
 *
 * Committed hours as a percentage of what a fortnight can hold. Derived here in the UI
 * rather than in the engine, so the model keeps exactly four load types.
 */
export function scheduleDensity(days: readonly DayInput[]): number {
  if (days.length === 0) return 0

  const committed = days.reduce(
    (sum, day) =>
      sum +
      day.activities
        .filter((activity) => activity.kind !== 'sleep')
        .reduce((dayTotal, activity) => dayTotal + activity.hours, 0),
    0,
  )

  const capacity = days.length * FULL_DAY_HOURS
  return Math.min(CEILING, (committed / capacity) * CEILING)
}

function statusOf(value: number): BarStatus {
  if (value < CRITICAL_BELOW) return 'critical'
  if (value < STRETCHED_BELOW) return 'stretched'
  return 'healthy'
}

function seriesFor(projection: Projection, type: LoadType): number[] {
  return projection.central.map((reserves) => reserves[type])
}

export function domainBars(
  reserves: Reserves,
  projection: Projection,
  days: readonly DayInput[],
): DomainBar[] {
  const bars: DomainBar[] = LOAD_TYPES.map((type) => {
    const value = reserves[type]
    const status = statusOf(value)

    // §1.2: low social is flagged as a warning, not as "good". Most trackers would
    // count a quiet social life as healthy; saying so out loud is what proves the model
    // understands burnout rather than summing hours.
    const warning =
      type === 'social' && value < SOCIAL_FLOOR_PERCENT
        ? 'You have been spending a lot of time alone.'
        : status === 'critical'
          ? `${LABELS[type]} is nearly empty.`
          : status === 'stretched'
            ? `${LABELS[type]} is running low.`
            : null

    return {
      key: type,
      label: LABELS[type],
      value,
      ceiling: CEILING,
      status,
      trend: trendOf(seriesFor(projection, type)),
      warning,
    }
  })

  const density = scheduleDensity(days)

  return [
    ...bars,
    {
      key: 'schedule',
      label: 'How packed the days are',
      value: density,
      ceiling: CEILING,
      // Density is the one bar where *more* is worse, so its status is inverted.
      status: density > 80 ? 'critical' : density > 60 ? 'stretched' : 'healthy',
      trend: 'flat',
      warning: density > 80 ? 'Your days are almost completely booked.' : null,
    },
  ]
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/ui/dial && npm run typecheck`
Expected: PASS, 15 tests.

- [ ] **Step 6: Commit**

```bash
git add src/ui/dial
git commit -m "$(cat <<'EOF'
feat: derive the dial's five domain bars from the model's four reserves

§0 is explicit that the brief's five areas become five labels while the
model underneath keeps four load types, with schedule density as a
derived view. The derivation lives here in the UI so the engine cannot
quietly acquire a fifth reserve.

Two inversions are the substance of this file. Low social load is
flagged as a warning rather than counted as a quiet healthy week, which
§1.2 calls the thing that proves the model understands burnout rather
than summing hours. And schedule density is the one bar where more is
worse, so its thresholds run the other way.

The trend glyph has a deadband. Without one every bar flickers between
arrows on noise, which would make it useless exactly where §1.5 relies
on it to carry severity without colour.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: The gauge geometry and its text equivalent

**Files:**
- Create: `src/ui/dial/dialGeometry.ts`, `src/ui/dial/dialText.ts`, `src/ui/dial/dialGeometry.test.ts`, `src/ui/dial/dialText.test.ts`

**Interfaces:**
- Consumes: `DomainBar` from `./domainBars`; `Projection` from `src/engine`.
- Produces:
  - `const DIAL_MAX_PERCENT = 120`
  - `function angleForPercent(percent: number): number` — degrees, `-90` at 0 to `+90` at max
  - `function pointOnArc(cx: number, cy: number, r: number, degrees: number): { x: number; y: number }`
  - `function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string`
  - `function describeDial(capacity: number, bars: readonly DomainBar[], projection: Projection): string`

- [ ] **Step 1: Write the failing tests**

`src/ui/dial/dialGeometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DIAL_MAX_PERCENT, angleForPercent, arcPath, pointOnArc } from './dialGeometry'

describe('angleForPercent', () => {
  it('puts zero at the left end of the semicircle', () => {
    expect(angleForPercent(0)).toBeCloseTo(-90)
  })

  it('puts the maximum at the right end', () => {
    expect(angleForPercent(DIAL_MAX_PERCENT)).toBeCloseTo(90)
  })

  it('puts the midpoint at the top', () => {
    expect(angleForPercent(DIAL_MAX_PERCENT / 2)).toBeCloseTo(0)
  })

  // §1.2: "with the needle past the maximum when overloaded". Clamping at 100 would
  // erase exactly the state the dial exists to show.
  it('keeps climbing past a hundred percent', () => {
    expect(angleForPercent(110)).toBeGreaterThan(angleForPercent(100))
  })

  it('clamps beyond the dial maximum rather than spinning off the arc', () => {
    expect(angleForPercent(500)).toBeCloseTo(90)
  })

  it('clamps below zero', () => {
    expect(angleForPercent(-20)).toBeCloseTo(-90)
  })
})

describe('pointOnArc', () => {
  it('places zero degrees directly above the centre', () => {
    const point = pointOnArc(100, 100, 50, 0)

    expect(point.x).toBeCloseTo(100)
    expect(point.y).toBeCloseTo(50)
  })

  it('places ninety degrees to the right of the centre', () => {
    const point = pointOnArc(100, 100, 50, 90)

    expect(point.x).toBeCloseTo(150)
    expect(point.y).toBeCloseTo(100)
  })
})

describe('arcPath', () => {
  it('produces a path that starts with a move and contains an arc', () => {
    const path = arcPath(100, 100, 50, -90, 90)

    expect(path.startsWith('M')).toBe(true)
    expect(path).toContain('A')
  })

  it('produces a finite path with no NaN', () => {
    expect(arcPath(100, 100, 50, -90, 90)).not.toContain('NaN')
  })
})
```

`src/ui/dial/dialText.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS, project, type DayInput, type Reserves } from '../../engine'
import { domainBars } from './domainBars'
import { describeDial } from './dialText'

const healthy: Reserves = { mental: 80, physical: 80, social: 80, errands: 80 }

const days = (): DayInput[] =>
  Array.from({ length: HORIZON_DAYS }, (_, dayIndex) => ({
    dayIndex,
    activities: [],
    sleepHours: 7,
    venueChanges: 0,
    daysToNearestDeadline: null,
    checkedIn: true,
  }))

const textFor = (reserves: Reserves): string => {
  const projection = project(reserves, days(), DEFAULT_PARAMS)
  return describeDial(75, domainBars(reserves, projection, days()), projection)
}

describe('describeDial', () => {
  // §1.5: a full text equivalent of every dial value, and the primary view in
  // low-energy mode and for screen readers -- not a fallback.
  it('states the headline capacity', () => {
    expect(textFor(healthy)).toContain('75')
  })

  it('names every domain', () => {
    const text = textFor(healthy)

    for (const label of ['Study', 'Body', 'People', 'Life admin', 'packed']) {
      expect(text).toContain(label)
    }
  })

  it('says which way each domain is moving, in words rather than glyphs', () => {
    expect(textFor(healthy)).toMatch(/steady|rising|falling/i)
  })

  it('speaks the social warning aloud', () => {
    expect(textFor({ ...healthy, social: 10 })).toMatch(/alone/i)
  })

  it('is a sentence a person could read out, not a data dump', () => {
    const text = textFor(healthy)

    expect(text).toMatch(/\.$/)
    expect(text).not.toContain('{')
    expect(text).not.toContain('undefined')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ui/dial/dialGeometry.test.ts src/ui/dial/dialText.test.ts`
Expected: FAIL — cannot resolve `./dialGeometry` and `./dialText`.

- [ ] **Step 3: Write the geometry**

`src/ui/dial/dialGeometry.ts`:

```ts
/** §1.2: "Semicircular gauge, 0 to 120%, with the needle past the maximum when
 *  overloaded." The headroom above 100 is the point -- clamping there would erase the
 *  state the dial exists to show. */
export const DIAL_MAX_PERCENT = 120

const START_DEGREES = -90
const END_DEGREES = 90

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const toRadians = (degrees: number): number => ((degrees - 90) * Math.PI) / 180

export function angleForPercent(percent: number): number {
  const ratio = clamp(percent, 0, DIAL_MAX_PERCENT) / DIAL_MAX_PERCENT
  return START_DEGREES + ratio * (END_DEGREES - START_DEGREES)
}

export function pointOnArc(
  cx: number,
  cy: number,
  r: number,
  degrees: number,
): { x: number; y: number } {
  const radians = toRadians(degrees)
  return { x: cx + r * Math.cos(radians), y: cy + r * Math.sin(radians) }
}

/** An SVG arc between two angles. Kept as pure maths with no React in sight, so the
 *  geometry can be asserted directly rather than through a rendered component. */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  fromDeg: number,
  toDeg: number,
): string {
  const start = pointOnArc(cx, cy, r, fromDeg)
  const end = pointOnArc(cx, cy, r, toDeg)
  const largeArc = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0

  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`
}
```

- [ ] **Step 4: Write the text equivalent**

`src/ui/dial/dialText.ts`:

```ts
import type { Projection } from '../../engine'
import type { DomainBar, Trend } from './domainBars'

const TREND_WORDS: Record<Trend, string> = {
  rising: 'rising',
  flat: 'steady',
  falling: 'falling',
}

/**
 * §1.5: a full text equivalent of every dial value.
 *
 * This is a primary view -- what a screen reader user gets, and what low-energy mode
 * leans on -- rather than a fallback bolted on afterwards. It therefore has to carry
 * everything the graphic carries, including every warning, in words.
 */
export function describeDial(
  capacity: number,
  bars: readonly DomainBar[],
  projection: Projection,
): string {
  const parts: string[] = [`You are at ${Math.round(capacity)}% capacity this week.`]

  for (const bar of bars) {
    parts.push(
      `${bar.label}: ${Math.round(bar.value)} out of ${bar.ceiling}, ${TREND_WORDS[bar.trend]}.`,
    )
  }

  const warnings = bars.map((bar) => bar.warning).filter((w): w is string => w !== null)
  parts.push(...warnings)

  parts.push(
    projection.firstDeficitDay === null
      ? 'Nothing on the horizon takes you into deficit.'
      : `On this plan you cross into deficit on day ${projection.firstDeficitDay}.`,
  )

  return parts.join(' ')
}
```

Re-export `Trend` from `domainBars.ts` so `dialText.ts` can import both from one place: add `export type { Trend } from './trend'` to `src/ui/dial/domainBars.ts`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/ui/dial && npm run typecheck`
Expected: PASS, 28 tests.

- [ ] **Step 6: Commit**

```bash
git add src/ui/dial
git commit -m "$(cat <<'EOF'
feat: add the dial's gauge geometry and its spoken-word equivalent

The geometry is pure maths with no React in it, so the arc and needle
can be asserted directly rather than through a rendered component. The
gauge runs to 120% rather than 100 because §1.2 wants the needle past
the maximum when a student is overloaded -- clamping at a hundred would
erase the state the dial exists to show.

The text equivalent is a primary view rather than a fallback, per §1.5:
it is what a screen reader user gets and what low-energy mode leans on,
so it carries every value and every warning the graphic carries,
including the social one, in words.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: The dial components

**Files:**
- Create: `src/ui/dial/CapacityDial.tsx`, `src/ui/dial/DomainBarList.tsx`, `src/ui/dial/CapacityDial.test.tsx`, `src/ui/dial/DomainBarList.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 3 and 4.
- Produces:
  - `function CapacityDial(props: { capacity: number; bars: readonly DomainBar[]; projection: Projection }): JSX.Element`
  - `function DomainBarList(props: { bars: readonly DomainBar[] }): JSX.Element`

- [ ] **Step 1: Write the failing tests**

`src/ui/dial/DomainBarList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DomainBarList } from './DomainBarList'
import type { DomainBar } from './domainBars'

const bar = (over: Partial<DomainBar> = {}): DomainBar => ({
  key: 'mental',
  label: 'Study & thinking',
  value: 70,
  ceiling: 100,
  status: 'healthy',
  trend: 'flat',
  warning: null,
  ...over,
})

describe('DomainBarList', () => {
  it('renders one row per bar', () => {
    render(<DomainBarList bars={[bar(), bar({ key: 'social', label: 'People' })]} />)

    expect(screen.getAllByRole('meter')).toHaveLength(2)
  })

  it('labels each bar and states its value for assistive technology', () => {
    render(<DomainBarList bars={[bar()]} />)

    const meter = screen.getByRole('meter', { name: /study/i })
    expect(meter).toHaveAttribute('aria-valuenow', '70')
    expect(meter).toHaveAttribute('aria-valuemax', '100')
  })

  // §1.5: severity is never carried by colour alone -- it is paired with a glyph and a
  // label, so it survives greyscale, colour blindness and a screen reader.
  it('shows a trend glyph beside every bar', () => {
    render(<DomainBarList bars={[bar({ trend: 'falling' })]} />)

    expect(screen.getByTestId('trend-mental')).toHaveTextContent('▼')
  })

  it('spells the trend out in words for assistive technology', () => {
    render(<DomainBarList bars={[bar({ trend: 'rising' })]} />)

    expect(screen.getByTestId('trend-mental')).toHaveAccessibleName(/rising/i)
  })

  it('shows a warning when one is present', () => {
    render(<DomainBarList bars={[bar({ key: 'social', label: 'People', status: 'critical', warning: 'You have been spending a lot of time alone.' })]} />)

    expect(screen.getByText(/time alone/i)).toBeVisible()
  })

  it('shows no warning text when the bar is healthy', () => {
    render(<DomainBarList bars={[bar()]} />)

    expect(screen.queryByTestId('warning-mental')).toBeNull()
  })
})
```

`src/ui/dial/CapacityDial.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS, project, type DayInput, type Reserves } from '../../engine'
import { CapacityDial } from './CapacityDial'
import { domainBars } from './domainBars'

const healthy: Reserves = { mental: 80, physical: 80, social: 80, errands: 80 }

const days = (): DayInput[] =>
  Array.from({ length: HORIZON_DAYS }, (_, dayIndex) => ({
    dayIndex,
    activities: [],
    sleepHours: 7,
    venueChanges: 0,
    daysToNearestDeadline: null,
    checkedIn: true,
  }))

const renderDial = (capacity: number, reserves: Reserves = healthy) => {
  const projection = project(reserves, days(), DEFAULT_PARAMS)
  return render(
    <CapacityDial
      capacity={capacity}
      bars={domainBars(reserves, projection, days())}
      projection={projection}
    />,
  )
}

describe('CapacityDial', () => {
  it('shows the headline percentage in the centre', () => {
    renderDial(90)

    expect(screen.getByTestId('capacity-value')).toHaveTextContent('90%')
  })

  it('rounds rather than showing a long decimal', () => {
    renderDial(90.4)

    expect(screen.getByTestId('capacity-value')).toHaveTextContent('90%')
  })

  it('renders all five domain bars', () => {
    renderDial(90)

    expect(screen.getAllByRole('meter')).toHaveLength(5)
  })

  // §10: SVG with a viewBox and no fixed width, which is the whole argument for
  // hand-rolling it rather than using canvas or an image -- it scales at every width
  // without a media query.
  it('scales with its container rather than fixing a pixel width', () => {
    renderDial(90)
    const svg = screen.getByTestId('dial-gauge')

    expect(svg).toHaveAttribute('viewBox')
    expect(svg).not.toHaveAttribute('width')
  })

  it('states everything it draws in words as well', () => {
    renderDial(90)

    expect(screen.getByTestId('reserve-text-equivalent')).toHaveTextContent(/90% capacity/i)
  })

  it('renders with zero user data rather than throwing', () => {
    const flat: Reserves = { mental: 0, physical: 0, social: 0, errands: 0 }

    expect(() => renderDial(0, flat)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ui/dial`
Expected: FAIL — cannot resolve `./DomainBarList` and `./CapacityDial`.

- [ ] **Step 3: Write the bar list**

`src/ui/dial/DomainBarList.tsx`:

```tsx
import type { DomainBar, Trend } from './domainBars'

const GLYPHS: Record<Trend, string> = { rising: '▲', flat: '▬', falling: '▼' }
const TREND_WORDS: Record<Trend, string> = {
  rising: 'rising',
  flat: 'steady',
  falling: 'falling',
}

/** Colour is one of three cues, never the only one. Each status also carries a glyph and
 *  a written warning, so severity survives greyscale, colour blindness and a screen
 *  reader (§1.5). */
const FILL: Record<DomainBar['status'], string> = {
  healthy: 'bg-emerald-600',
  stretched: 'bg-amber-500',
  critical: 'bg-rose-600',
}

export function DomainBarList({ bars }: { bars: readonly DomainBar[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {bars.map((bar) => (
        <li key={bar.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span>{bar.label}</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{Math.round(bar.value)}</span>
              <span
                data-testid={`trend-${bar.key}`}
                aria-label={TREND_WORDS[bar.trend]}
                title={TREND_WORDS[bar.trend]}
              >
                {GLYPHS[bar.trend]}
              </span>
            </span>
          </div>

          <div
            role="meter"
            aria-label={bar.label}
            aria-valuenow={Math.round(bar.value)}
            aria-valuemin={0}
            aria-valuemax={bar.ceiling}
            className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
          >
            {/* Each bar is measured against its own ceiling, not a shared scale (§1.2). */}
            <div
              className={`h-full ${FILL[bar.status]}`}
              style={{ width: `${Math.min(100, (bar.value / bar.ceiling) * 100)}%` }}
            />
          </div>

          {bar.warning !== null && (
            <p data-testid={`warning-${bar.key}`} className="text-xs opacity-80">
              {bar.warning}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Write the dial**

`src/ui/dial/CapacityDial.tsx`:

```tsx
import type { Projection } from '../../engine'
import { DomainBarList } from './DomainBarList'
import { angleForPercent, arcPath, pointOnArc, DIAL_MAX_PERCENT } from './dialGeometry'
import { describeDial } from './dialText'
import type { DomainBar } from './domainBars'

const CX = 100
const CY = 100
const R = 80

export function CapacityDial({
  capacity,
  bars,
  projection,
}: {
  capacity: number
  bars: readonly DomainBar[]
  projection: Projection
}) {
  const needle = pointOnArc(CX, CY, R - 10, angleForPercent(capacity))
  const overloaded = capacity > 100

  return (
    <section className="flex flex-col gap-4">
      {/*
        viewBox with no width attribute: the graphic scales to its container at every
        breakpoint without a single media query, which is §10's whole argument for
        hand-rolled SVG over canvas or an image.

        aria-hidden because the text equivalent below carries the same information in a
        form assistive technology can actually use -- a duplicate reading of the graphic
        would be noise, not access.
      */}
      <svg
        data-testid="dial-gauge"
        viewBox="0 0 200 110"
        className="w-full"
        aria-hidden="true"
        focusable="false"
      >
        <path d={arcPath(CX, CY, R, -90, 90)} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="12" strokeLinecap="round" />
        <path
          d={arcPath(CX, CY, R, -90, angleForPercent(Math.min(capacity, DIAL_MAX_PERCENT)))}
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          className={overloaded ? 'text-rose-600' : 'text-emerald-600'}
        />
        <line x1={CX} y1={CY} x2={needle.x} y2={needle.y} stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <circle cx={CX} cy={CY} r="5" fill="currentColor" />
      </svg>

      <p className="text-center">
        <span data-testid="capacity-value" className="text-5xl font-semibold tabular-nums">
          {Math.round(capacity)}%
        </span>
      </p>

      <DomainBarList bars={bars} />

      {/*
        §1.5: not visually hidden and not an afterthought -- the text equivalent is a
        primary view. It stays in the document for everyone.
      */}
      <p data-testid="reserve-text-equivalent" className="text-sm opacity-80">
        {describeDial(capacity, bars, projection)}
      </p>
    </section>
  )
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/ui/dial && npm run typecheck`
Expected: PASS, 41 tests.

- [ ] **Step 6: Commit**

```bash
git add src/ui/dial
git commit -m "$(cat <<'EOF'
feat: add the capacity dial and its domain bars

§1.2's gauge: a semicircle to 120%, the headline percentage in the
centre, and five bars each measured against its own ceiling rather than
a shared scale.

Hand-rolled SVG with a viewBox and no width attribute, which is §10's
argument for building it rather than reaching for canvas or an image:
it scales at every breakpoint without a single media query.

Severity never rests on colour. Each bar carries a fill colour, a trend
glyph, that glyph's meaning in words for assistive technology, and a
written warning when it applies -- so it survives greyscale, colour
blindness and a screen reader alike. The graphic itself is hidden from
assistive technology because the text equivalent beside it carries the
same information in a form that can actually be read; announcing both
would be noise rather than access.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Low-energy mode

**Files:**
- Create: `src/ui/lowEnergy.ts`, `src/ui/LowEnergyView.tsx`, `src/ui/lowEnergy.test.ts`, `src/ui/LowEnergyView.test.tsx`

**Interfaces:**
- Consumes: `StoredSettings` from `src/data`.
- Produces:
  - `const LOW_ENERGY_THRESHOLD = 20`
  - `function shouldUseLowEnergy(floorReserve: number, override: StoredSettings['lowEnergyOverride']): boolean`
  - `function LowEnergyView(props: { capacity: number; action: string; onAction: () => void; onExit: () => void }): JSX.Element`

- [ ] **Step 1: Write the failing tests**

`src/ui/lowEnergy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { LOW_ENERGY_THRESHOLD, shouldUseLowEnergy } from './lowEnergy'

describe('shouldUseLowEnergy', () => {
  // §1.5: "A student at 12% reserve should not be handed a dashboard."
  it('turns itself on below the threshold', () => {
    expect(shouldUseLowEnergy(12, 'auto')).toBe(true)
  })

  it('stays off above the threshold', () => {
    expect(shouldUseLowEnergy(60, 'auto')).toBe(false)
  })

  it('is off exactly at the threshold', () => {
    expect(shouldUseLowEnergy(LOW_ENERGY_THRESHOLD, 'auto')).toBe(false)
  })

  it('can be turned on by hand at any reserve', () => {
    expect(shouldUseLowEnergy(95, 'on')).toBe(true)
  })

  // Never coercive: §5.3 makes the same point about the door, and it holds here. An
  // interface a student cannot turn off is one more thing being done to them.
  it('can be turned off by hand even when depleted', () => {
    expect(shouldUseLowEnergy(2, 'off')).toBe(false)
  })
})
```

`src/ui/LowEnergyView.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LowEnergyView } from './LowEnergyView'

const renderView = (over: Partial<Parameters<typeof LowEnergyView>[0]> = {}) => {
  const props = {
    capacity: 12,
    action: 'Take twenty minutes outside',
    onAction: vi.fn(),
    onExit: vi.fn(),
    ...over,
  }
  render(<LowEnergyView {...props} />)
  return props
}

describe('LowEnergyView', () => {
  // §1.5: one number and one action. The count is the requirement.
  it('shows exactly one number', () => {
    renderView()

    expect(screen.getByTestId('capacity-value')).toHaveTextContent('12%')
    expect(screen.queryAllByRole('meter')).toHaveLength(0)
  })

  it('offers exactly one action besides the way out', () => {
    renderView()

    expect(screen.getByRole('button', { name: /twenty minutes outside/i })).toBeVisible()
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('runs the action when it is taken', async () => {
    const props = renderView()

    await userEvent.click(screen.getByRole('button', { name: /twenty minutes outside/i }))

    expect(props.onAction).toHaveBeenCalledOnce()
  })

  it('lets the student go back to the full view', async () => {
    const props = renderView()

    await userEvent.click(screen.getByRole('button', { name: /show everything/i }))

    expect(props.onExit).toHaveBeenCalledOnce()
  })

  it('does not scold', () => {
    renderView()

    // §1.3's gamification rule reaches the copy: the app reflects, never scolds, and
    // this is the screen where a student is least able to absorb being told off.
    expect(document.body.textContent).not.toMatch(/should|failed|behind|streak/i)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ui/lowEnergy.test.ts src/ui/LowEnergyView.test.tsx`
Expected: FAIL — cannot resolve `./lowEnergy` and `./LowEnergyView`.

- [ ] **Step 3: Write the rule**

`src/ui/lowEnergy.ts`:

```ts
import type { StoredSettings } from '../data'

/** §1.5: below this the interface collapses to one number and one action. Lower than
 *  §7.6's deficit line of 30, because being in deficit is common and being unable to
 *  cope with a dashboard is not. */
export const LOW_ENERGY_THRESHOLD = 20

/**
 * §1.5: "A student at 12% reserve should not be handed a dashboard." A product decision
 * as much as an accessibility one, and also the fallback for any screen that cannot be
 * made to work at 320px.
 *
 * The override wins in both directions. An interface a depleted student cannot turn off
 * is one more thing being done to them, which is the opposite of the point.
 */
export function shouldUseLowEnergy(
  floorReserve: number,
  override: StoredSettings['lowEnergyOverride'],
): boolean {
  if (override === 'on') return true
  if (override === 'off') return false
  return floorReserve < LOW_ENERGY_THRESHOLD
}
```

- [ ] **Step 4: Write the view**

`src/ui/LowEnergyView.tsx`:

```tsx
/**
 * One number and one action (§1.5).
 *
 * The copy is as load-bearing as the layout. §1.3's gamification rule -- the app
 * reflects, never scolds -- matters most here, because this is the screen a student
 * reaches when they are least able to absorb being told off. Nothing on it mentions what
 * they should have done.
 */
export function LowEnergyView({
  capacity,
  action,
  onAction,
  onExit,
}: {
  capacity: number
  action: string
  onAction: () => void
  onExit: () => void
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-between p-6">
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <p data-testid="capacity-value" className="text-7xl font-semibold tabular-nums">
          {Math.round(capacity)}%
        </p>
        <p className="text-center text-sm opacity-80">That is where you are right now.</p>
      </div>

      {/* §0: primary actions in the lower half of the viewport, reachable one-handed. */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onAction}
          className="w-full rounded-lg bg-slate-900 px-4 py-4 text-base font-medium text-white"
        >
          {action}
        </button>
        <button type="button" onClick={onExit} className="w-full px-4 py-2 text-sm underline">
          Show everything
        </button>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/ui && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/lowEnergy.ts src/ui/LowEnergyView.tsx src/ui/lowEnergy.test.ts src/ui/LowEnergyView.test.tsx
git commit -m "$(cat <<'EOF'
feat: add low-energy mode

§1.5: below a reserve threshold the interface collapses to one number
and one action, because a student at 12% should not be handed a
dashboard. A product decision as much as an accessibility one, and also
the fallback for any screen that cannot be made to work at 320px.

The manual override wins in both directions, including turning it off
while depleted. An interface a student cannot dismiss is one more thing
being done to them, which is the opposite of the point -- §5.3 makes
the same argument about the door and it holds here.

A test asserts the copy does not scold. §1.3's gamification rule
matters most on this screen, because it is the one a student reaches
when they are least able to absorb being told what they should have
done.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: The PWA shell

**Files:**
- Create: `public/manifest.webmanifest`, `public/sw.js`, `scripts/generate-icons.mjs`, `src/pwa/registerServiceWorker.ts`, `src/pwa/registerServiceWorker.test.ts`
- Modify: `index.html`, `src/main.tsx`, `package.json`

**Interfaces:**
- Produces: `function registerServiceWorker(nav?: Navigator, mode?: string): Promise<boolean>` — resolves `true` when registration was attempted.

- [ ] **Step 1: Write the failing test**

`src/pwa/registerServiceWorker.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './registerServiceWorker'

const navigatorWith = (register: () => Promise<unknown>): Navigator =>
  ({ serviceWorker: { register } }) as unknown as Navigator

describe('registerServiceWorker', () => {
  it('registers in a browser that supports it', async () => {
    const register = vi.fn().mockResolvedValue({})

    expect(await registerServiceWorker(navigatorWith(register), 'production')).toBe(true)
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' })
  })

  // A worker caching assets during a test run makes failures depend on what a previous
  // run cached, which is the worst kind of flake to chase.
  it('does nothing during development or tests', async () => {
    const register = vi.fn()

    expect(await registerServiceWorker(navigatorWith(register), 'development')).toBe(false)
    expect(register).not.toHaveBeenCalled()
  })

  it('does nothing where service workers are unsupported', async () => {
    expect(await registerServiceWorker({} as Navigator, 'production')).toBe(false)
  })

  // A failed registration must never take the app down with it -- an uninstallable app
  // still works, an app that throws on boot does not.
  it('survives a registration that rejects', async () => {
    const register = vi.fn().mockRejectedValue(new Error('nope'))

    await expect(registerServiceWorker(navigatorWith(register), 'production')).resolves.toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/pwa`
Expected: FAIL — cannot resolve `./registerServiceWorker`.

- [ ] **Step 3: Write the registration**

`src/pwa/registerServiceWorker.ts`:

```ts
/**
 * §11 requires the app to be installable to a real phone.
 *
 * Guarded three ways, and each guard earns its place. It is skipped outside production,
 * because a worker caching assets during a test run makes failures depend on what a
 * previous run cached. It is skipped where unsupported rather than assumed. And a
 * rejected registration is swallowed: an app that cannot be installed still works, while
 * an app that throws while booting does not.
 */
export async function registerServiceWorker(
  nav: Navigator = navigator,
  mode: string = import.meta.env.MODE,
): Promise<boolean> {
  if (mode !== 'production') return false
  if (!('serviceWorker' in nav)) return false

  try {
    await nav.serviceWorker.register('/sw.js', { scope: '/' })
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Write the manifest, worker and icon script**

`public/manifest.webmanifest`:

```json
{
  "name": "Codenection — Stress & Workload Manager",
  "short_name": "Codenection",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f8fafc",
  "theme_color": "#0f172a",
  "description": "See everything you are carrying, and rebalance it before it costs you.",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

`public/sw.js`:

```js
// Cache-first for the app shell, network-first for everything else.
//
// Deliberately small and hand-written: a generated worker is a dependency that can
// invalidate a whole deploy, and there is nothing here worth that risk. Bump CACHE when
// the shell changes -- the old cache is deleted on activate.
const CACHE = 'codenection-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/', '/index.html'])))
  // Take over immediately rather than waiting for every tab to close, so a deploy is at
  // most one reload behind.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request)
          .then((response) => {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(event.request, copy))
            return response
          })
          // Offline and uncached: fall back to the shell so an installed app opens.
          .catch(() => caches.match('/index.html')),
    ),
  )
})
```

`scripts/generate-icons.mjs` — writes both PNGs from a tiny hand-built encoder so the
icons are reproducible rather than opaque binaries in the repository:

```js
// Generates the PWA icons as flat-colour PNGs with a rounded square, using zlib rather
// than an image library. Committed binaries with no source are the thing this avoids:
// anyone can re-run this and get byte-identical files.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const BG = [15, 23, 42]
const FG = [16, 185, 129]

function crc32(buf) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let offset = 0
  const r = size * 0.28

  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0
    offset += 1
    for (let x = 0; x < size; x += 1) {
      // A filled circle on a dark ground: legible at 48px, which is where a home-screen
      // icon is actually seen.
      const dx = x - size / 2
      const dy = y - size / 2
      const colour = dx * dx + dy * dy <= r * r ? FG : BG
      raw[offset] = colour[0]
      raw[offset + 1] = colour[1]
      raw[offset + 2] = colour[2]
      offset += 3
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), png(size))
  console.log(`wrote public/icon-${size}.png`)
}
```

Add to `package.json` scripts: `"icons": "node scripts/generate-icons.mjs"`, then run
`npm run icons` once and commit the two PNGs.

- [ ] **Step 5: Wire it into the page**

In `index.html`, inside `<head>`:

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#0f172a" />
<link rel="apple-touch-icon" href="/icon-192.png" />
```

In `src/main.tsx`, after the `createRoot(...).render(...)` call:

```ts
void registerServiceWorker()
```

with `import { registerServiceWorker } from './pwa/registerServiceWorker'` at the top.

- [ ] **Step 6: Run everything**

Run: `npm run typecheck && npm run test && npm run build && npm run test:e2e`
Expected: all pass. `dist/` contains `manifest.webmanifest`, `sw.js` and both icons.

- [ ] **Step 7: Commit**

```bash
git add public src/pwa index.html src/main.tsx package.json scripts/generate-icons.mjs
git commit -m "$(cat <<'EOF'
feat: make the app installable to a phone

§11 requires an installable PWA on a real device: a manifest, icons and
a service worker that lets a second visit work offline.

The worker is hand-written and small rather than generated. A build
plugin here would be a dependency capable of invalidating a whole
deploy, and there is nothing in twenty lines of cache-first fetching
worth that risk. It claims clients on activate so a deploy is at most
one reload behind rather than waiting for every tab to close.

Registration is guarded three ways and each guard earns its place: not
outside production, because a worker caching assets mid-test makes
failures depend on what a previous run cached; not where unsupported;
and never fatally, because an app that cannot be installed still works
while an app that throws on boot does not.

The icons are generated by a committed script rather than checked in as
opaque binaries, so anyone can re-run it and get the same files.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Putting it on screen

**Files:**
- Create: `src/ui/useSchedule.ts`, `src/ui/useLowEnergy.ts`, `src/ui/HomeScreen.tsx`, `src/ui/HomeScreen.test.tsx`, `tests/e2e/dial.spec.ts`
- Modify: `src/ui/App.tsx`, `src/ui/App.test.tsx`, `tests/e2e/engine.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `function useSchedule(repo: Repository): { schedule: Schedule | null; setSchedule: (s: Schedule) => void }`
  - `function useLowEnergy(repo: Repository, floorReserve: number): { active: boolean; setOverride: (o: StoredSettings['lowEnergyOverride']) => void }`
  - `function HomeScreen(props: { repository: Repository }): JSX.Element`

- [ ] **Step 1: Write the failing tests**

`src/ui/HomeScreen.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createLocalRepository } from '../data'
import { HomeScreen } from './HomeScreen'

const renderHome = () => {
  const repository = createLocalRepository()
  render(<HomeScreen repository={repository} />)
  return repository
}

describe('HomeScreen', () => {
  // §0: no cold start. The first thing a new user sees is a real week, not a blank
  // state and not a spinner that never resolves.
  it('shows a dial on first run with no saved data', async () => {
    renderHome()

    await waitFor(() => expect(screen.getByTestId('capacity-value')).toBeVisible())
    expect(screen.getAllByRole('meter')).toHaveLength(5)
  })

  it('states everything in words as well as in the graphic', async () => {
    renderHome()

    await waitFor(() =>
      expect(screen.getByTestId('reserve-text-equivalent')).toHaveTextContent(/capacity/i),
    )
  })

  it('reports what a rebalance changed, in specifics', async () => {
    renderHome()
    await waitFor(() => expect(screen.getByTestId('rebalance')).toBeEnabled())

    await userEvent.click(screen.getByTestId('rebalance'))

    const report = await screen.findByTestId('rebalance-report')
    expect(report).not.toHaveTextContent(/optimis|optimiz/i)
  })

  // The reason the repository exists: a week that resets on every visit cannot hold a
  // real student's fortnight.
  it('saves the rebalanced week so it survives a reload', async () => {
    const repository = renderHome()
    await waitFor(() => expect(screen.getByTestId('rebalance')).toBeEnabled())

    await userEvent.click(screen.getByTestId('rebalance'))

    await waitFor(async () => expect(await repository.loadWeek()).not.toBeNull())
  })
})
```

`tests/e2e/dial.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

// §0 and §10 make all four widths a standing requirement rather than a polish pass, and
// an unasserted requirement is one that regresses.
for (const width of [320, 390, 768, 1280]) {
  test(`the dial fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')

    await expect(page.getByTestId('capacity-value')).toBeVisible()
    await expect(page.getByTestId('dial-gauge')).toBeVisible()

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows, `horizontal overflow at ${width}px`).toBe(false)
  })
}

test('shows five domain bars, each against its own ceiling', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('meter')).toHaveCount(5)
})

test('keeps the week after a reload', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('rebalance').click()
  await expect(page.getByTestId('rebalance-report')).toBeVisible()

  const before = await page.getByTestId('capacity-value').textContent()
  await page.reload()

  await expect(page.getByTestId('capacity-value')).toHaveText(before ?? '')
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ui/HomeScreen.test.tsx`
Expected: FAIL — cannot resolve `./HomeScreen`.

- [ ] **Step 3: Write the hooks**

`src/ui/useSchedule.ts`:

```ts
import { useEffect, useState } from 'react'
import type { Repository } from '../data'
import { umCrunchWeek } from '../fixtures/umWeek'
import type { Schedule } from '../optimizer'

/**
 * Loads the week once, falling back to the seeded fortnight on first run.
 *
 * §0's no-cold-start rule: a student opening the app for the first time sees a real week
 * rather than a blank state. The seed stands in until the import paths of §1.4 and the
 * planner of §3 exist to replace it.
 */
export function useSchedule(repo: Repository): {
  schedule: Schedule | null
  setSchedule: (next: Schedule) => void
} {
  const [schedule, setLocal] = useState<Schedule | null>(null)

  useEffect(() => {
    let cancelled = false

    void repo.loadWeek().then((saved) => {
      if (!cancelled) setLocal(saved ?? umCrunchWeek())
    })

    return () => {
      cancelled = true
    }
  }, [repo])

  function setSchedule(next: Schedule) {
    setLocal(next)
    // Fire and forget: a failed write must not block the screen the student is looking
    // at, and the next change will try again.
    void repo.saveWeek(next)
  }

  return { schedule, setSchedule }
}
```

`src/ui/useLowEnergy.ts`:

```ts
import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type Repository, type StoredSettings } from '../data'
import { shouldUseLowEnergy } from './lowEnergy'

export function useLowEnergy(
  repo: Repository,
  floorReserve: number,
): {
  active: boolean
  setOverride: (override: StoredSettings['lowEnergyOverride']) => void
} {
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    let cancelled = false
    void repo.loadSettings().then((saved) => {
      if (!cancelled) setSettings(saved)
    })
    return () => {
      cancelled = true
    }
  }, [repo])

  function setOverride(override: StoredSettings['lowEnergyOverride']) {
    const next = { ...settings, lowEnergyOverride: override }
    setSettings(next)
    void repo.saveSettings(next)
  }

  return { active: shouldUseLowEnergy(floorReserve, settings.lowEnergyOverride), setOverride }
}
```

- [ ] **Step 4: Write the home screen**

`src/ui/HomeScreen.tsx`:

```tsx
import { useMemo, useState } from 'react'
import type { Repository } from '../data'
import { DEFAULT_PARAMS, floorReserve, overallReserve, project } from '../engine'
import { describeRebalance, makeRng, rebalance, toDayInputs } from '../optimizer'
import { CapacityDial } from './dial/CapacityDial'
import { domainBars } from './dial/domainBars'
import { LowEnergyView } from './LowEnergyView'
import { useLowEnergy } from './useLowEnergy'
import { useSchedule } from './useSchedule'

/** §2.1's search takes its randomness as a parameter; a fixed seed keeps what the
 *  student sees reproducible between renders. */
const SEED = 20260908

export function HomeScreen({ repository }: { repository: Repository }) {
  const { schedule, setSchedule } = useSchedule(repository)
  const [report, setReport] = useState<string | null>(null)

  const days = useMemo(() => (schedule ? toDayInputs(schedule) : []), [schedule])
  const projection = useMemo(
    () => (schedule ? project(schedule.start, days, DEFAULT_PARAMS) : null),
    [schedule, days],
  )

  const floor = schedule ? floorReserve(schedule.start) : 100
  const { active: lowEnergy, setOverride } = useLowEnergy(repository, floor)

  if (!schedule || !projection) {
    // A single frame before the repository answers. Deliberately a sentence rather than
    // a spinner: §0 wants something useful on screen, and "loading" at least says what
    // is happening.
    return (
      <main className="mx-auto max-w-screen-md p-4">
        <p>Working out where you are…</p>
      </main>
    )
  }

  const capacity = overallReserve(schedule.start)

  function onRebalance() {
    const result = rebalance(schedule!, DEFAULT_PARAMS, makeRng(SEED))
    setSchedule(result.schedule)
    setReport(describeRebalance(result, DEFAULT_PARAMS))
  }

  if (lowEnergy) {
    return (
      <LowEnergyView
        capacity={capacity}
        action="Take twenty minutes outside"
        onAction={onRebalance}
        onExit={() => setOverride('off')}
      />
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-screen-md flex-col gap-6 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Codenection</h1>
        <p className="text-sm opacity-70">Everything you are carrying, in one screen.</p>
      </header>

      <CapacityDial
        capacity={capacity}
        bars={domainBars(schedule.start, projection, days)}
        projection={projection}
      />

      <section className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onRebalance}
          data-testid="rebalance"
          className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white sm:w-auto"
        >
          Rebalance my fortnight
        </button>

        {report !== null && (
          <p className="text-sm" data-testid="rebalance-report" role="status">
            {report}
          </p>
        )}
      </section>
    </main>
  )
}
```

- [ ] **Step 5: Rewrite App and its test**

`src/ui/App.tsx`:

```tsx
import { useMemo } from 'react'
import { createRepository } from '../data'
import { HomeScreen } from './HomeScreen'

export function App() {
  // Built once. The adapter choice is a startup decision, and rebuilding it on every
  // render would open a fresh Supabase client each time.
  const repository = useMemo(() => createRepository(), [])

  return <HomeScreen repository={repository} />
}
```

`src/ui/App.test.tsx` — replace the whole file:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('renders the home screen', async () => {
    render(<App />)

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Codenection'))
  })

  it('reaches a real capacity figure with no saved data', async () => {
    render(<App />)

    await waitFor(() => expect(screen.getByTestId('capacity-value')).toHaveTextContent(/^\d{1,3}%$/))
  })
})
```

In `tests/e2e/engine.spec.ts`, delete the `renders a capacity figure computed by the
engine`, `shows the worst day the projection reaches` and `has no horizontal overflow`
tests — `dial.spec.ts` now covers all three against the real components. Keep the
text-equivalent and rebalance tests, which still describe behaviour the new screen has.
The `worst-day-value` element no longer exists; its information moved into the text
equivalent, which is asserted there.

- [ ] **Step 6: Run everything**

Run: `npm run typecheck && npm run test:coverage && npm run build && npm run test:e2e`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/ui src/data tests/e2e
git commit -m "$(cat <<'EOF'
feat: replace the placeholder screen with the glance layer

The dial, its five domain bars, the spoken-word equivalent and
low-energy mode now compose the home screen, reading the week from the
repository and saving it back after a rebalance -- so a fortnight
survives a reload instead of resetting on every visit.

App shrinks to choosing a repository and rendering the home screen. The
choice is memoised because it is a startup decision: rebuilding it per
render would open a fresh Supabase client each time.

On first run the screen falls back to the seeded fortnight rather than
rendering empty, per §0's no-cold-start rule. The loading state is a
sentence rather than a spinner, because a spinner tells a student
nothing about what is happening.

Three browser tests move from engine.spec.ts to dial.spec.ts, where
they now drive the real components rather than the placeholder markup.
The assertions are kept, not weakened.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage for this plan's scope (§1.2, §1.5, §0, part of §10, §11's PWA line):**

| Requirement | Task |
|---|---|
| §1.2 semicircular gauge, 0–120%, needle past max | 4, 5 |
| §1.2 headline percentage in the centre | 5 |
| §1.2 five domain bars, each against its own ceiling | 3, 5 |
| §1.2 trend glyph per domain | 3, 5 |
| §1.2 low social flagged as a warning | 3 (assertion), 5 (display) |
| §1.5 full text equivalent of every value | 4, 5 |
| §1.5 severity never colour alone | 5 |
| §1.5 low-energy mode | 6 |
| §0 no cold start | 1 (null read), 3, 5, 8 |
| §0 responsive at four widths | 8 (`dial.spec.ts`) |
| §0 one-handed reachability | 6, 8 |
| §10 SVG with viewBox, no fixed width | 5 |
| §11 installable PWA | 7 |
| Persistence behind one interface | 1, 2 |
| §1.5 reduced-motion setting | **Not covered.** No animation exists yet, so there is nothing to reduce. It belongs with the room's tidy-up sequence in the next plan; recorded here so it is not lost. |
| §1.3 the room | Out of scope by decision — its own plan. |

**Placeholder scan:** none. Every step carries the actual content.

**Type consistency:** `Repository` is defined in Task 1 and consumed unchanged in 2, 6, 8. `DomainBar` is defined in Task 3 and used in 4, 5, 8 with the same field names. `Trend` is defined in `trend.ts` and re-exported from `domainBars.ts` (Task 4 Step 4) so `dialText.ts` and `DomainBarList.tsx` import it from one place. `describeDial(capacity, bars, projection)` takes the same three arguments in Task 4's definition and Task 5's call. `shouldUseLowEnergy(floorReserve, override)` matches between Task 6 and `useLowEnergy` in Task 8.

**One inconsistency fixed:** Task 5's test asserts `capacity-value` and
`reserve-text-equivalent`, which are the same test IDs the current `App.tsx` uses. Task 8
moves those IDs into `CapacityDial`, so the existing `engine.spec.ts` assertions on them
keep passing rather than needing rewriting — which is why only three of its tests move.
