# Request Box Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Price an incoming request in what it costs, draft the reply in three tones, and make every acceptance provisional — §2.3's three must-build items.

**Architecture:** `priceRequest` adds a proposed item to a copy of the week and reads the difference out of the existing projection; `readRequest` reuses the planner's parser; `draftReplies` asks a server endpoint with a real template fallback; commitments ride inside the saved week so no migration is needed. Nothing is ever sent — the app drafts and the student copies.

**Tech Stack:** React 19, TypeScript 7 (strict, `noUncheckedIndexedAccess`), Tailwind 4, Zod, Vercel Edge functions, Vitest 4 + Testing Library, Playwright.

**Spec:** Approved plain-language plan at `C:\Users\den51\.claude\plans\crispy-floating-river.md`. Product spec [`burnout-app-spec-v3.md`](../../../burnout-app-spec-v3.md) §2.3 (all of it), §1.3's two-state room, §11's must-build tier, §10. Read all four.

**Base:** `main`. Not stacked on PR #24 — stacking auto-closed #23 when its base was deleted.

## A correction to the approved plan, before anything is built

The plain-language plan said the cost would name **"which recovery blocks got eaten"**, echoing §2.3's own example of "two gym sessions and one evening out". Building it showed that is not something this app can honestly say:

- **The optimizer never removes anything.** Its moves are `shiftDay`, `batchErrands`, `insertRest`, `insertSocial` and `reorderWithinDay` (`src/optimizer/types.ts`). Nothing is deleted, so no block is ever "eaten" and there is no such list to read off.
- **A gym session is not recovery in this model.** `recoveryForDay` (`src/engine/recovery.ts`) credits exactly three things: hours of sleep above baseline, `rest` blocks, and `socialRestorative` blocks. `lightExercise` is load, not recovery. So §2.3's illustrative sentence does not map onto the engine that was actually built.

So the cost is stated as an **equivalence derived from the engine's own constants** — "this costs about as much as two evenings with a friend" — alongside two things that *are* directly measured: the day the fortnight crosses into deficit, and the reserve floor. That is a real number rather than a fabricated audit trail, and it keeps the §2.3 promise that matters: never "this takes 6 hours", always what it costs you.

**Never describe the equivalence as blocks removed.** Wording that implies the optimizer deleted something is a lie about the model, and it is the kind a student would eventually catch.

## Global Constraints

- **The app never sends anything.** No messaging integration (§2.3 rejected it), no share target, no autonomous decline. Drafts are copied by the student. This feature must contain no outward-facing action.
- **No API key reaches the browser** (§10, constraint 1). Drafting goes through `api/`, like the planner.
- **Every model reply is Zod-validated at the boundary.** A drafted reply is untrusted text.
- **A model may propose, never originate authority.** It may not set a review date the code did not compute, create protected rest, or write to storage.
- **The template fallback is real.** §10 requires it, and unlike a photograph a decline genuinely can be written by rules — the app already knows what was asked and what it costs.
- **`src/engine/**` and `src/optimizer/**` logic must not change.** One additive optional field on the `Schedule` type is the single exception, and nothing in either package may read it.
- **Backwards compatibility:** weeks saved before this feature must still load. Tested.
- **Responsive at 320 / 390 / 768 / 1280px**; two rooms never sit side by side below 768px (already handled by `RoomComparison`).
- **Immutability**; files 200–400 lines; functions under 50 lines.
- **TDD, red before green.** Tests ship in the same commit as behaviour.
- **Coverage thresholds only go up.** Currently 97 / 91 / 97 / 98.
- **Never `git push`** without explicit confirmation.
- **Commit format:** `<type>: <description>`, ending `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

### Fixed values

| Constant | Value | Rationale |
|---|---|---|
| `REVIEW_DAYS` | `7` | Far enough out that a week can change, close enough that a lapse still leaves time to withdraw gracefully. |
| `EVENING_HOURS` | `2` | What one `socialRestorative` block is worth as an equivalence unit. |
| `MAX_REQUEST_LENGTH` | `1000` | A request, not a document. Shorter than the planner's brain dump. |
| `DRAFT_TIMEOUT_MS` | `8000` | Matches the planner. Text, not an image. |

---

## File Structure

```
src/
  domain/
    requestCost.ts         price a proposed item against the week
    requestCost.test.ts
    commitments.ts         a provisional yes, and when it lapses
    commitments.test.ts
  ai/
    readRequest.ts         pasted text -> one proposed item
    readRequest.test.ts
    drafts.ts              client entry: ask /api/draft, fall back to templates
    drafts.test.ts
    draftTemplates.ts      the real fallback
    draftTemplates.test.ts
    draftSchema.ts         Zod for a drafted reply
    draftSchema.test.ts
    writer.ts              the model call, server-side only
    writer.test.ts
    index.ts               MODIFY
  optimizer/
    types.ts               MODIFY: one optional field on Schedule
  ui/request/
    RequestBoxScreen.tsx
    RequestBoxScreen.test.tsx
    LapsedNotice.tsx
    LapsedNotice.test.tsx
  ui/
    HomeScreen.tsx         MODIFY: third entry point + lapsed surfacing
    HomeScreen.request.test.tsx
api/
  draft.ts                 third Vercel function; same key
tests/e2e/
  request.spec.ts
```

---

## Task 1: What a request costs

**Files:**
- Create: `src/domain/requestCost.ts`, `src/domain/requestCost.test.ts`

**Interfaces:**
- Consumes: `addItems` (`src/domain/addItems.ts`), `project`/`summarise`/`overallReserve` (`src/engine`), `toDayInputs` (`src/optimizer`).
- Produces:
  - `interface RequestCost { firstDeficitDayBefore: number | null; firstDeficitDayAfter: number | null; floorBefore: number; floorAfter: number; capacityAfter: number; eveningsEquivalent: number; absorbable: boolean }`
  - `function firstDeficitDay(projection: Projection): number | null`
  - `function priceRequest(schedule: Schedule, item: ParsedItem, params: EngineParams): RequestCost`

- [ ] **Step 1: Write the failing test**

`src/domain/requestCost.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ParsedItem } from '../ai'
import { DEFAULT_PARAMS, HORIZON_DAYS, project } from '../engine'
import { toDayInputs, type Schedule } from '../optimizer'
import { firstDeficitDay, priceRequest } from './requestCost'

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const request = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  id: 'r1',
  title: 'FYP presentation help',
  type: 'mental',
  hours: 3,
  deadlineDay: 4,
  hard: false,
  confident: true,
  ...over,
})

const priceOf = (schedule: Schedule, item = request()) =>
  priceRequest(schedule, item, DEFAULT_PARAMS)

describe('firstDeficitDay', () => {
  it('is null for a fortnight that never crosses', () => {
    const projection = project(week().start, toDayInputs(week()), DEFAULT_PARAMS)

    expect(firstDeficitDay(projection)).toBeNull()
  })

  /**
   * §2.3 asks for "moves your deficit crossing from day 21 to day 14". The projection
   * already counts deficit days but never says when the first one arrives, and the day is
   * the half a student can act on.
   */
  it('names the first day the floor falls into deficit', () => {
    const exhausted = week({ start: { mental: 8, physical: 8, social: 8, errands: 8 } })
    const projection = project(exhausted.start, toDayInputs(exhausted), DEFAULT_PARAMS)

    expect(firstDeficitDay(projection)).toBe(0)
  })
})

describe('priceRequest', () => {
  it('leaves the week it was given untouched', () => {
    const before = week()
    const snapshot = JSON.stringify(before)

    priceOf(before)

    expect(JSON.stringify(before)).toBe(snapshot)
  })

  // The whole point: a request costs something, and the number moves.
  it('lowers the reserve floor', () => {
    const cost = priceOf(week())

    expect(cost.floorAfter).toBeLessThan(cost.floorBefore)
  })

  it('costs more for a bigger ask', () => {
    const small = priceOf(week(), request({ hours: 1 }))
    const large = priceOf(week(), request({ hours: 12 }))

    expect(large.floorAfter).toBeLessThan(small.floorAfter)
  })

  it('states the cost as an equivalence a student can picture', () => {
    expect(priceOf(week(), request({ hours: 12 })).eveningsEquivalent).toBeGreaterThan(0)
  })

  it('reports a bigger equivalence for a bigger ask', () => {
    const small = priceOf(week(), request({ hours: 1 })).eveningsEquivalent
    const large = priceOf(week(), request({ hours: 12 })).eveningsEquivalent

    expect(large).toBeGreaterThan(small)
  })

  it('reports the capacity the student would be at', () => {
    expect(priceOf(week()).capacityAfter).toBeGreaterThan(0)
  })

  // §2.3's "this pushes you to 105%" case: a week that cannot take it.
  it('says plainly when a week cannot absorb the request', () => {
    const stretched = week({ start: { mental: 12, physical: 12, social: 12, errands: 12 } })

    expect(priceOf(stretched, request({ hours: 20 })).absorbable).toBe(false)
  })

  it('says a comfortable week can absorb a small ask', () => {
    expect(priceOf(week(), request({ hours: 1 })).absorbable).toBe(true)
  })

  // The sentence §2.3 actually asks for.
  it('reports the deficit crossing moving earlier when one appears', () => {
    const thin = week({ start: { mental: 34, physical: 34, social: 34, errands: 34 } })
    const cost = priceOf(thin, request({ hours: 14 }))

    if (cost.firstDeficitDayAfter !== null && cost.firstDeficitDayBefore !== null) {
      expect(cost.firstDeficitDayAfter).toBeLessThanOrEqual(cost.firstDeficitDayBefore)
    } else {
      expect(cost.firstDeficitDayAfter).not.toBeNull()
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/domain/requestCost.test.ts`
Expected: FAIL — cannot resolve `./requestCost`.

- [ ] **Step 3: Implement**

`src/domain/requestCost.ts`:

```ts
import type { ParsedItem } from '../ai'
import {
  DEFICIT_THRESHOLD,
  FULL_RESERVE,
  overallReserve,
  project,
  type EngineParams,
  type Projection,
} from '../engine'
import { toDayInputs, type Schedule } from '../optimizer'
import { addItems } from './addItems'

/**
 * Hours of restorative company that one "evening" stands for.
 *
 * The unit is a socialRestorative block, because that is one of only three things
 * `recoveryForDay` actually credits -- sleep above baseline, rest blocks, and restorative
 * social contact. §2.3's own example says "two gym sessions", but exercise is load in this
 * model rather than recovery, so pricing in gym sessions would be a number with nothing
 * behind it.
 */
const EVENING_HOURS = 2

export interface RequestCost {
  readonly firstDeficitDayBefore: number | null
  readonly firstDeficitDayAfter: number | null
  readonly floorBefore: number
  readonly floorAfter: number
  /**
   * The headline reserve figure after taking it on — the same number the dial shows.
   *
   * §2.3's phrasing is "this pushes you to 105%", which is committed load against
   * capacity. This app has no such metric: the dial (§1.2) shows *reserve*, and
   * `overallReserve` returns it on a 0–100 scale already. Inventing a second percentage
   * that moves the opposite way would put two conflicting numbers on the same screen, so
   * the warning is stated in the app's own units — "this takes you from 62 to 41" — which
   * is the same information in the language the student has already learned.
   */
  readonly capacityAfter: number
  /**
   * How many evenings of restorative company it would take to cover what this costs.
   *
   * An equivalence, NOT a list of blocks the optimizer removed -- it removes nothing; its
   * moves only shift, batch, insert and reorder. Wording that implies otherwise would be a
   * lie about the model, and one a student would eventually catch.
   */
  readonly eveningsEquivalent: number
  /** False when taking it on drops the floor into deficit. §2.3's "this pushes you to
   *  105%" warning, expressed as something the model can actually answer. */
  readonly absorbable: boolean
}

/**
 * The first day the floor crosses into deficit, or null if it never does.
 *
 * The projection already counts deficit days but never says when the first one arrives,
 * and the day is the half a student can act on -- §2.3 asks for "day 21 to day 14", not
 * "seven deficit days".
 */
export function firstDeficitDay(projection: Projection): number | null {
  for (const [day, reserves] of projection.central.entries()) {
    const floor = Math.min(reserves.mental, reserves.physical, reserves.social, reserves.errands)
    if (floor < DEFICIT_THRESHOLD) return day
  }

  return null
}

const floorOf = (projection: Projection): number => projection.worstFloor

/**
 * Prices a proposed commitment against the week as it stands.
 *
 * §2.3: never "this takes 6 hours", always what it costs you. The work is done by adding
 * it to a *copy* of the week and reading the difference out of the projection that already
 * exists -- the model already knows the answer, because it has just been asked to carry it.
 */
export function priceRequest(
  schedule: Schedule,
  item: ParsedItem,
  params: EngineParams,
): RequestCost {
  const before = project(schedule.start, toDayInputs(schedule), params)

  // addItems returns a new week; the caller's is never touched.
  const withRequest = addItems(schedule, [item])
  const after = project(withRequest.start, toDayInputs(withRequest), params)

  const floorBefore = floorOf(before)
  const floorAfter = floorOf(after)

  const lost = Math.max(0, floorBefore - floorAfter)
  const perEvening = params.kSocialContact * EVENING_HOURS

  return {
    firstDeficitDayBefore: firstDeficitDay(before),
    firstDeficitDayAfter: firstDeficitDay(after),
    floorBefore,
    floorAfter,
    // Already 0-100; FULL_RESERVE is 100, so scaling it again would be a no-op dressed up
    // as a conversion.
    capacityAfter: Math.round(overallReserve(withRequest.start)),
    eveningsEquivalent: perEvening > 0 ? Math.round((lost / perEvening) * 10) / 10 : 0,
    absorbable: floorAfter >= DEFICIT_THRESHOLD,
  }
}
```

> If `overallReserve` already returns a percentage, drop the `/ FULL_RESERVE * 100`. Check
> its signature in `src/engine/efficiency.ts` before writing this line rather than assuming.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/domain && npm run typecheck`

```bash
git add src/domain
git commit -m "$(cat <<'EOF'
feat: price a request in what it costs, not in hours

§2.3 is explicit: never "this takes 6 hours", always what it costs you.
The work is done by adding the request to a copy of the week and reading
the difference out of the projection that already exists -- the model
already knows, because it has just been asked to carry it.

Two things are measured directly: the day the fortnight crosses into
deficit, and the reserve floor. The crossing day is new -- the
projection counted deficit days but never said when the first arrived,
and the day is the half a student can act on.

The third number is an equivalence, and deliberately not what the
approved plan said. That plan promised to name "which recovery blocks
got eaten", echoing §2.3's own "two gym sessions" example. Neither
survives contact with the engine that was actually built: the optimizer
removes nothing -- its moves only shift, batch, insert and reorder -- so
no block is ever eaten and there is no list to read off; and exercise is
load in this model rather than recovery, so a price in gym sessions
would be a number with nothing behind it.

So the cost is stated in evenings of restorative company, which is one
of the three things recoveryForDay actually credits. A real derivation
rather than a fabricated audit trail, and the §2.3 promise that matters
is kept.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Reading the request

**Files:**
- Create: `src/ai/readRequest.ts`, `src/ai/readRequest.test.ts`
- Modify: `src/ai/index.ts`, `src/ai/types.ts` (add `MAX_REQUEST_LENGTH`)

**Interfaces:**
- Consumes: `parseBrainDump` (`src/ai/parseBrainDump.ts`), unchanged.
- Produces: `function readRequest(text: string): Promise<ParsedItem | null>`

- [ ] **Step 1: Write the failing test**

`src/ai/readRequest.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readRequest } from './readRequest'

// The endpoint is stubbed unreachable throughout, so this exercises the rule-based path --
// which is what CI and a key-less machine run on.
const offline = () => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no endpoint')))

afterEach(() => vi.unstubAllGlobals())

describe('readRequest', () => {
  it('turns a pasted request into one proposed commitment', async () => {
    offline()

    const item = await readRequest('can you help with our group meeting on thursday')

    expect(item?.title.toLowerCase()).toContain('meeting')
    expect(item?.type).toBe('social')
  })

  it('reads a stated effort', async () => {
    offline()

    expect((await readRequest('cover my shift, 3 hours'))?.hours).toBe(3)
  })

  it('reads a stated day', async () => {
    offline()

    expect((await readRequest('help with the essay by friday'))?.deadlineDay).not.toBeNull()
  })

  // One request, not a list. A message mentioning three things is still one ask.
  it('takes a single commitment even when the message rambles', async () => {
    offline()

    const item = await readRequest('hey, so, gym later, but also can you cover my shift')

    expect(item).not.toBeNull()
  })

  it('returns nothing for an empty request', async () => {
    offline()

    expect(await readRequest('   ')).toBeNull()
  })

  it('returns nothing for something far longer than a request', async () => {
    offline()

    expect(await readRequest('x'.repeat(5000))).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ai/readRequest.test.ts`
Expected: FAIL — cannot resolve `./readRequest`.

- [ ] **Step 3: Implement**

Add to `src/ai/types.ts`:

```ts
/** A request, not a document — shorter than the planner's brain dump, because this is one
 *  message somebody sent you. */
export const MAX_REQUEST_LENGTH = 1000
```

`src/ai/readRequest.ts`:

```ts
import { parseBrainDump } from './parseBrainDump'
import { MAX_REQUEST_LENGTH, type ParsedItem } from './types'

/**
 * Turns a pasted request into one proposed commitment.
 *
 * No new model call and no second parser: the say-anything planner already turns
 * unstructured text into exactly this shape, fallback included, so the request box asks it
 * for one thing instead of many. A second parser here would be a second set of rules to
 * drift out of step with the first.
 */
export async function readRequest(text: string): Promise<ParsedItem | null> {
  const trimmed = text.trim()
  if (trimmed === '' || trimmed.length > MAX_REQUEST_LENGTH) return null

  const outcome = await parseBrainDump(trimmed)

  // A message that mentions three things is still one ask, so the first item is the
  // commitment being proposed. The student can correct it on the chip before being priced.
  return outcome.items[0] ?? null
}
```

Export `readRequest` and `MAX_REQUEST_LENGTH` from `src/ai/index.ts`.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/ai && npm run typecheck`

```bash
git add src/ai
git commit -m "$(cat <<'EOF'
feat: read a pasted request into one proposed commitment

No new model call and no second parser. The say-anything planner already
turns unstructured text into exactly this shape, rule-based fallback
included, so the request box asks it for one thing instead of many.

A second parser here would be a second set of rules to drift out of step
with the first, and the drift would show up as the request box reading a
message differently from the planner reading the same words.

A message that mentions three things is still one ask, so the first item
is taken as the commitment -- and the student can correct it on the chip
before being priced on it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Three drafted replies

**Files:**
- Create: `src/ai/draftSchema.ts`, `src/ai/draftSchema.test.ts`, `src/ai/draftTemplates.ts`, `src/ai/draftTemplates.test.ts`, `src/ai/drafts.ts`, `src/ai/drafts.test.ts`, `src/ai/writer.ts`, `src/ai/writer.test.ts`, `api/draft.ts`
- Modify: `src/ai/index.ts`, `.env.example`

**Interfaces:**
- Consumes: `RequestCost` (Task 1), `ParsedItem`.
- Produces:
  - `type Tone = 'decline' | 'defer' | 'accept'`
  - `interface Draft { tone: Tone; text: string }`
  - `function parseDraftReply(raw: unknown): Draft[] | null`
  - `function templateDrafts(item: ParsedItem, cost: RequestCost): Draft[]`
  - `function draftReplies(item: ParsedItem, cost: RequestCost): Promise<{ drafts: Draft[]; source: 'model' | 'fallback' }>`
  - `function askWriter(prompt: string, apiKey: string): Promise<Draft[] | null>`

**This task mirrors the planner's shape exactly** — schema, fallback, client entry, server call, endpoint. Follow `src/ai/schema.ts`, `fallbackParser.ts`, `parseBrainDump.ts`, `groq.ts` and `api/plan.ts` as the reference implementations; the reasoning in their comments applies unchanged.

- [ ] **Step 1: Write the failing tests**

`src/ai/draftTemplates.test.ts` — the fallback is the important one, because it is what runs
with no key:

```ts
import { describe, expect, it } from 'vitest'
import type { RequestCost } from '../domain/requestCost'
import { templateDrafts } from './draftTemplates'
import type { ParsedItem } from './types'

const item = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  id: 'r1',
  title: 'FYP presentation help',
  type: 'mental',
  hours: 3,
  deadlineDay: 4,
  hard: false,
  confident: true,
  ...over,
})

const cost = (over: Partial<RequestCost> = {}): RequestCost => ({
  firstDeficitDayBefore: null,
  firstDeficitDayAfter: 14,
  floorBefore: 62,
  floorAfter: 28,
  capacityAfter: 88,
  eveningsEquivalent: 2,
  absorbable: false,
  ...over,
})

describe('templateDrafts', () => {
  // §2.3 names exactly three: soft decline, defer with a date, accept with the trade-off.
  it('offers all three tones', () => {
    expect(templateDrafts(item(), cost()).map((draft) => draft.tone)).toEqual([
      'decline',
      'defer',
      'accept',
    ])
  })

  it('writes something a person could actually send', () => {
    for (const draft of templateDrafts(item(), cost())) {
      expect(draft.text.length).toBeGreaterThan(20)
      // No placeholders left in the sent text.
      expect(draft.text).not.toMatch(/\{|\}|undefined|null/)
    }
  })

  it('names what was asked for', () => {
    const drafts = templateDrafts(item({ title: 'covering Saturday' }), cost())

    expect(drafts.some((draft) => draft.text.includes('covering Saturday'))).toBe(true)
  })

  // The point of deferring rather than refusing: a date, not a vague "later".
  it('proposes an actual date in the defer draft', () => {
    const defer = templateDrafts(item(), cost()).find((draft) => draft.tone === 'defer')

    expect(defer?.text).toMatch(/day \d+|next week/i)
  })

  /**
   * §2.3: accept with a *named* trade-off. An acceptance that hides the cost is the
   * behaviour the whole feature exists to replace.
   */
  it('names the trade-off in the accept draft rather than hiding it', () => {
    const accept = templateDrafts(item(), cost({ eveningsEquivalent: 2 })).find(
      (draft) => draft.tone === 'accept',
    )

    expect(accept?.text).toMatch(/evening/i)
  })

  it('does not promise a trade-off that costs nothing', () => {
    const accept = templateDrafts(item(), cost({ eveningsEquivalent: 0, absorbable: true })).find(
      (draft) => draft.tone === 'accept',
    )

    expect(accept?.text).not.toMatch(/\b0 evenings\b/)
  })

  // The app never declines on anyone's behalf: these are drafts the student sends.
  it('writes in the student\'s own voice, not the app\'s', () => {
    for (const draft of templateDrafts(item(), cost())) {
      expect(draft.text).not.toMatch(/\bthe app\b|codenection/i)
    }
  })
})
```

`src/ai/draftSchema.test.ts` — same shape as `schema.test.ts`: accepts a well-formed reply;
rejects an invented tone; rejects a non-object; rejects an empty text; rejects a reply that
is not three drafts; rejects text longer than a message plausibly is.

`src/ai/drafts.test.ts` — same shape as `parseBrainDump.test.ts`: uses the model when the
endpoint answers; falls back to templates on 503, on a network failure, and on a reply that
fails validation; never calls out when there is nothing to draft.

`src/ai/writer.test.ts` — same shape as `groq.test.ts`: returns validated drafts; sends the
key in the authorization header and nowhere else; gives up on a refusal, on no content, on
prose, on a network failure, and on a model that never answers.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ai`
Expected: FAIL — the four new modules do not resolve.

- [ ] **Step 3: Implement**

`src/ai/draftTemplates.ts` — the shape that matters:

```ts
import type { RequestCost } from '../domain/requestCost'
import type { ParsedItem } from './types'

export type Tone = 'decline' | 'defer' | 'accept'

export interface Draft {
  readonly tone: Tone
  readonly text: string
}

/**
 * A real fallback, not a stub.
 *
 * Unlike a photograph, a decline genuinely can be written by rules: the app already knows
 * the only two facts that matter -- what was asked, and what saying yes would cost. §10
 * requires a hardcoded fallback for every external dependency, and this one keeps the
 * feature working on a machine with no key, which includes CI and the demo laptop.
 *
 * Written in the student's own voice. The app never declines on anyone's behalf; it does
 * the work of declining and hands over the words (§2.3).
 */
export function templateDrafts(item: ParsedItem, cost: RequestCost): Draft[] {
  const what = item.title.trim()
  const evenings = cost.eveningsEquivalent

  const tradeOff =
    evenings >= 1
      ? ` It will cost me about ${evenings === 1 ? 'an evening' : `${evenings} evenings`} of downtime, so I want to be upfront that I will be tight that week.`
      : ' I want to be upfront that my next couple of weeks are already full.'

  const when = cost.firstDeficitDayAfter === null ? 'next week' : `day ${cost.firstDeficitDayAfter}`

  return [
    {
      tone: 'decline',
      text: `Thanks for thinking of me for ${what}. I am going to have to pass this time — my next two weeks are already fuller than I would like, and I would rather say no now than let you down later.`,
    },
    {
      tone: 'defer',
      text: `I would like to help with ${what}, but not this week — I am already at my limit. Could it wait until around ${when}? I could give it proper attention then.`,
    },
    {
      tone: 'accept',
      text: `Happy to help with ${what}.${tradeOff} Let me know what you need from me.`,
    },
  ]
}
```

`api/draft.ts` — copy `api/plan.ts` exactly, changing only the input field, the length cap
(`MAX_REQUEST_LENGTH`) and the call (`askWriter`). Keep `export const config = { runtime: 'edge' }`
and the same 503-when-no-key behaviour.

Update `.env.example`'s `GROQ_API_KEY` comment to say three endpoints read it.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/ai && npm run typecheck && npm run build`, then the bundle check:

```bash
grep -rl "api.groq.com\|GROQ_API_KEY" dist/ && echo "LEAK" || echo "OK"
```

```bash
git add src/ai api .env.example
git commit -m "$(cat <<'EOF'
feat: draft the reply in three tones, and mean all three

§2.3 names exactly three: a soft decline, a defer with a real date, and
an accept with the trade-off said out loud. The last one is the reason
the feature exists -- an acceptance that hides its cost is the behaviour
being replaced, so the accept draft names what it will cost and does not
invent a trade-off when there is none.

The templates are a real fallback. Unlike a photograph, a decline can
honestly be written by rules: the app already knows the only two facts
that matter, what was asked and what yes would cost. So this works on a
machine with no key, which includes CI and the demo laptop.

Written in the student's own voice, and tested for it. The app never
declines on anyone's behalf and never sends anything -- it does the work
of declining and hands over the words.

api/draft.ts is the third and last reader of GROQ_API_KEY. Bundle
checked again for the model URL and the key name; neither appears.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Provisional yes

**Files:**
- Create: `src/domain/commitments.ts`, `src/domain/commitments.test.ts`
- Modify: `src/optimizer/types.ts`

**Interfaces:**
- Produces:
  - `interface Commitment { id: string; title: string; reviewDay: number; itemId: string }`
  - `function accept(schedule: Schedule, item: ParsedItem, today: number): Schedule`
  - `function lapsed(schedule: Schedule, today: number, params: EngineParams): Commitment[]`

- [ ] **Step 1: Write the failing test**

`src/domain/commitments.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ParsedItem } from '../ai'
import { DEFAULT_PARAMS, HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { accept, lapsed, REVIEW_DAYS } from './commitments'

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const item = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  id: 'r1',
  title: 'FYP presentation help',
  type: 'mental',
  hours: 3,
  deadlineDay: 4,
  hard: false,
  confident: true,
  ...over,
})

describe('accept', () => {
  it('puts the commitment into the week', () => {
    expect(accept(week(), item(), 0).items).toHaveLength(1)
  })

  // §2.3: every acceptance carries a review date the model picks.
  it('remembers it with a review date', () => {
    const after = accept(week(), item(), 0)

    expect(after.commitments).toHaveLength(1)
    expect(after.commitments?.[0]?.reviewDay).toBe(REVIEW_DAYS)
  })

  it('names what was accepted, so a lapse can be explained', () => {
    expect(accept(week(), item(), 0).commitments?.[0]?.title).toBe('FYP presentation help')
  })

  it('keeps commitments already remembered', () => {
    const once = accept(week(), item(), 0)

    expect(accept(once, item({ id: 'r2' }), 0).commitments).toHaveLength(2)
  })

  it('does not modify the week it was given', () => {
    const before = week()
    const snapshot = JSON.stringify(before)

    accept(before, item(), 0)

    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('lapsed', () => {
  it('finds nothing before the review date arrives', () => {
    expect(lapsed(accept(week(), item(), 0), 1, DEFAULT_PARAMS)).toEqual([])
  })

  /**
   * The direction-flip §2.3 is built on: saying no becomes the thing that happens by
   * itself, and staying in requires the act.
   */
  it('lapses a commitment the reserve can no longer hold', () => {
    const thin = week({ start: { mental: 10, physical: 10, social: 10, errands: 10 } })
    const accepted = accept(thin, item({ hours: 20 }), 0)

    expect(lapsed(accepted, REVIEW_DAYS, DEFAULT_PARAMS)).toHaveLength(1)
  })

  it('leaves one the reserve can still hold', () => {
    const accepted = accept(week(), item({ hours: 1 }), 0)

    expect(lapsed(accepted, REVIEW_DAYS, DEFAULT_PARAMS)).toEqual([])
  })

  it('finds nothing in a week with no commitments at all', () => {
    expect(lapsed(week(), 30, DEFAULT_PARAMS)).toEqual([])
  })

  /**
   * Weeks saved before this feature have no commitments field at all. They must keep
   * loading -- a student who opened the app yesterday should not lose their week today.
   */
  it('handles a week saved before commitments existed', () => {
    const old = JSON.parse(JSON.stringify(week())) as Schedule

    expect(old.commitments).toBeUndefined()
    expect(() => lapsed(old, 30, DEFAULT_PARAMS)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/domain/commitments.test.ts`
Expected: FAIL — cannot resolve `./commitments`.

- [ ] **Step 3: Add the field**

In `src/optimizer/types.ts`, on `Schedule`:

```ts
  /**
   * Provisional acceptances and their review dates (§2.3).
   *
   * Carried inside the week rather than in a storage concept of its own, so no migration
   * is needed and neither adapter changes -- the record genuinely is part of the week, and
   * it is persisted by the same `saveWeek` that already runs.
   *
   * Optional because weeks saved before this feature have no such field, and they must
   * keep loading. NOTHING in `src/engine` or `src/optimizer` may read it: it is state the
   * week carries, not an input to the model.
   */
  readonly commitments?: readonly Commitment[]
```

with `Commitment` defined alongside:

```ts
export interface Commitment {
  readonly id: string
  readonly title: string
  /** Day index by which the reserve has to be able to hold it, or it lapses. */
  readonly reviewDay: number
  /** The scheduled item this acceptance created, so a lapse can remove the right one. */
  readonly itemId: string
}
```

- [ ] **Step 4: Implement**

`src/domain/commitments.ts`:

```ts
import type { ParsedItem } from '../ai'
import { DEFICIT_THRESHOLD, project, type EngineParams } from '../engine'
import { toDayInputs, type Commitment, type Schedule } from '../optimizer'
import { addItems } from './addItems'

/**
 * How long a provisional yes stands before it has to prove itself.
 *
 * Far enough out that a week can genuinely change, close enough that a lapse still leaves
 * time to withdraw gracefully rather than on the morning.
 */
export const REVIEW_DAYS = 7

/**
 * §2.3's provisional yes.
 *
 * Students do not struggle to say no because they lack a reason; they struggle because
 * saying no requires an act. So an acceptance carries a review date, and if the reserve
 * cannot hold it by then it lapses on its own. The effort changes direction: leaving is
 * the default, staying in is the act.
 */
export function accept(schedule: Schedule, item: ParsedItem, today: number): Schedule {
  const withItem = addItems(schedule, [item])
  const added = withItem.items[withItem.items.length - 1]

  const commitment: Commitment = {
    id: `commitment-${item.id}`,
    title: item.title,
    reviewDay: today + REVIEW_DAYS,
    itemId: added?.id ?? item.id,
  }

  return { ...withItem, commitments: [...(schedule.commitments ?? []), commitment] }
}

/**
 * Commitments whose review date has arrived and which the reserve can no longer hold.
 *
 * The check is the same projection the rest of the app runs on, so a lapse means the same
 * thing the dial and the room already mean.
 */
export function lapsed(
  schedule: Schedule,
  today: number,
  params: EngineParams,
): Commitment[] {
  const due = (schedule.commitments ?? []).filter((commitment) => commitment.reviewDay <= today)
  if (due.length === 0) return []

  const projection = project(schedule.start, toDayInputs(schedule), params)
  if (projection.worstFloor >= DEFICIT_THRESHOLD) return []

  return due
}
```

- [ ] **Step 5: Run and commit**

Run: `npx vitest run src/domain src/optimizer && npm run typecheck`

```bash
git add src/domain src/optimizer
git commit -m "$(cat <<'EOF'
feat: make every yes provisional, with a date it has to survive

§2.3's sharpest idea, and the one the whole section is built on:
students do not struggle to say no because they lack a reason, they
struggle because saying no requires an act. So an acceptance carries a
review date, and if the reserve cannot hold it by then it lapses on its
own. The effort changes direction -- leaving becomes the default and
staying in becomes the act.

The record rides inside the week that is already saved rather than in a
storage concept of its own. That means no migration, no change to either
adapter, and nothing for anyone to run: the record genuinely is part of
the week. The cost is one optional field on the optimizer's Schedule
type that nothing in the engine or the optimizer reads.

Optional because weeks saved before this have no such field, and they
must keep loading -- there is a test for exactly that, because a student
who opened the app yesterday should not lose their week today.

The lapse check runs the same projection the dial and the room already
run on, so a lapse means the same thing everything else on screen means.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: The screen

**Files:**
- Create: `src/ui/request/RequestBoxScreen.tsx`, `src/ui/request/RequestBoxScreen.test.tsx`, `src/ui/request/LapsedNotice.tsx`, `src/ui/request/LapsedNotice.test.tsx`

**Interfaces:**
- Consumes: `readRequest`, `priceRequest`, `draftReplies`, `accept`, `ItemChip`, `RoomComparison`, `roomStateFor`.
- Produces: `RequestBoxScreen({ schedule, onAccept, onCancel })`, `LapsedNotice({ commitments, onDismiss })`

**Flow:** paste → chip to correct what was read → price and two rooms → three drafts → copy
one → accept or cancel. Acceptance is a separate act from copying a draft: a student may
copy the decline and still not want the item in their week.

- [ ] **Step 1: Write the failing tests**

`src/ui/request/RequestBoxScreen.test.tsx` covers, each individually:

- Opens with an empty box and no price shown.
- A pasted request becomes a correctable chip.
- The price appears, naming the capacity it would put them at.
- **Both rooms appear** — `room-comparison`, §2.3's explicit requirement.
- The cost sentence never claims blocks were removed: asserts the text does not match
  `/removed|deleted|gave up your/i`, guarding the correction at the top of this plan.
- All three drafts are offered, each labelled by tone.
- A draft can be edited before copying.
- **Nothing is accepted until the student says so** — asserted before and after the tap.
- Cancelling changes nothing.
- A request it cannot read says so rather than showing an empty price.
- **No test asserts anything was sent**, because nothing can be: the screen has no send.

`src/ui/request/LapsedNotice.test.tsx`: shows what lapsed and why; offers the drafted
withdrawal; can be dismissed; renders nothing when nothing lapsed.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ui/request`

- [ ] **Step 3: Implement**

Follow `PhotoImportScreen.tsx` for structure: dynamic `import('../../ai')` inside the
handler to keep Zod out of the initial bundle, `data-testid` on every asserted element, a
`role="status"` line for anything a screen reader must hear, and the same Tailwind idiom.

Copying uses `navigator.clipboard.writeText` guarded by a `try/catch` and a fallback that
selects the text — clipboard access can be denied, and a copy button that silently does
nothing is worse than one that tells you to select the text yourself.

- [ ] **Step 4: Run and commit**

```bash
git add src/ui/request
git commit -m "$(cat <<'EOF'
feat: show what a request would cost, in two rooms and three drafts

§2.3 asks for the warning to be shown with §1.3's two-state room
comparison, and RoomComparison was built for this in the room plan with
a comment saying so. This is the caller it was waiting for: your room as
it is, beside your room if you say yes.

Accepting is a separate act from copying a draft. A student may well
copy the decline and want nothing in their week -- collapsing the two
would put an item in their fortnight as a side effect of reading a
suggestion.

There is a test asserting the cost sentence never says a block was
removed. The optimizer removes nothing, and the wording is the only
place that truth could quietly rot.

Copying is guarded: clipboard access can be denied, and a copy button
that silently does nothing is worse than one that tells you to select
the text yourself.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: The third way in

**Files:**
- Modify: `src/ui/HomeScreen.tsx`
- Create: `src/ui/HomeScreen.request.test.tsx`, `tests/e2e/request.spec.ts`

- [ ] **Step 1: Write the failing test**

`src/ui/HomeScreen.request.test.tsx`, mirroring `HomeScreen.photo.test.tsx`:

- The request-box entry point is offered (`open-request`).
- Cancelling changes nothing in the stored week.
- **An accepted request reaches the saved week, with its commitment recorded.**
- A lapsed commitment is surfaced when the app opens.
- All three entry points stay visible together.

`tests/e2e/request.spec.ts`:

- Pasting a request in a real browser produces a price and two rooms — this one works
  end to end with no key, because the parser and the drafts both have real fallbacks. Unlike
  photo import, there is no gap here.
- Fits at 320 / 390 / 768 / 1280px, and the two rooms stack rather than sitting side by side
  below 768px.

- [ ] **Step 2: Run and watch fail**

- [ ] **Step 3: Wire it in**

Add `requesting` state and a branch beside `planning` and `photographing`, and an
`open-request` button in the same section. Surface lapsed commitments above the room using
`LapsedNotice`, computed with `lapsed(schedule, today, DEFAULT_PARAMS)`.

Today's index: the app has no calendar concept yet — day 0 is "now" everywhere else in the
model. Use `0` and leave a comment saying that lapsing is therefore only demonstrable via a
week whose commitments were accepted at a negative offset. **Do not invent a clock**; the
engine is pure by design and §6 has no date handling.

- [ ] **Step 4: Run everything**

```bash
npm run typecheck
npm run test:coverage
npm run build
PORT=5199 npx playwright test --workers=1
grep -rl "api.groq.com\|GROQ_API_KEY" dist/ && echo "LEAK" || echo "OK"
```

Use `--workers=1` and a free port while the sibling worktree is running.

- [ ] **Step 5: Commit**

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| §2.3 request box, paste or type | 2, 5 |
| §2.3 price in what gets given up | 1 — as an equivalence; see the correction above |
| §2.3 warn before accepting ("pushes you to 105%") | 1 (`absorbable`, `capacityAfter`), 5 |
| §2.3 shown with the two-state room comparison (§1.3) | 5 |
| §2.3 drafted declines, three tones, user approves | 3, 5 |
| §2.3 the app never declines autonomously | 5 — there is no send, anywhere |
| §2.3 provisional yes with auto-expiry | 4, 6 |
| §2.3 weekly load budget | **Not built.** §11: "high value if time allows". |
| §2.3 extension drafter | **Not built.** §11: same. |
| §2.3 speak a request | **Not built.** Voice is "if time allows" throughout. |
| §10 no key in the browser; fallback for every dependency | 3 |

**Placeholder scan:** none. Tasks 3, 5 and 6 name reference implementations to follow rather
than repeating their code, which is deliberate — those files exist, are tested, and copying
them into this document would let the two drift.

**Type consistency:** `RequestCost` is defined in Task 1 and consumed in 3 and 5. `Draft` and
`Tone` are defined in Task 3 and consumed in 5. `Commitment` is defined in Task 4's change to
`src/optimizer/types.ts` and consumed in 4, 5 and 6. `ParsedItem` is the planner's, unchanged
throughout.

**Three risks recorded:**

1. **The warning is in reserve, not in load.** §2.3's "this pushes you to 105%" is committed
   load against capacity, and this app has no such metric — the dial shows reserve, and
   `overallReserve` already returns it on a 0–100 scale. The warning therefore reads "this
   takes you from 62 to 41" rather than quoting a percentage over 100. Same information,
   the app's own units, one number on screen instead of two that move opposite ways. Worth
   flagging in the pull request as a deliberate divergence from the spec's wording.
2. **There is no clock.** Provisional expiry is defined in day indices because the engine is
   pure and has no date handling. Lapsing is therefore real in the model but hard to
   demonstrate live without a week whose commitments were accepted in the past. If a real
   calendar is wanted, that is its own change and should not be smuggled in here.
3. **`lapsed` lapses everything due at once** when the floor is in deficit, rather than
   working out which single commitment tipped it. That is honest but blunt: a student with
   three provisional yeses is told all three lapsed. Ranking them by cost would be better and
   is deliberately not in this plan — say so in the pull request rather than letting it read
   as an oversight.
