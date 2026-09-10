# Micro-Start Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace §4.1's single canned first action with a generated chain of small steps for the specific event, shown one rung at a time on a page of its own, reachable from every block.

**Architecture:** A pure domain module (`ladder.ts`) owns the chain and its rule-based generator, which is also the offline answer. A new edge endpoint asks Groq for a chain and a schema refuses anything malformed, so the client falls back to rules silently. Ladders persist inside `StoredSettings` — the same no-migration trick `calibration` used. A new `View` kind puts the page at `/week/block/:id/start`, under the block it is about.

**Tech Stack:** React 19, TypeScript 7 (strict, `noUncheckedIndexedAccess`), Tailwind 4, Zod 4, Vitest 4 + Testing Library, Playwright, Vercel edge functions, Groq.

**Spec:** [`docs/superpowers/specs/2026-09-11-micro-start-ladder-design.md`](../specs/2026-09-11-micro-start-ladder-design.md), which amends [`burnout-app-spec-v3.md`](../../../burnout-app-spec-v3.md) §4.1.

**Base:** `feature/micro-start` at `3b00963`.

## Global Constraints

- **One rung visible at a time.** The page renders exactly one action. The other rungs exist in state and must never be rendered — this is asserted, not assumed. (§4.1 as amended.)
- **Every rung under ten minutes.** §4.1's time box. `MAX_RUNG_MINUTES = 10`, enforced in the schema and in the rule generator, not only in the prompt.
- **Three to six rungs.** `MIN_RUNGS = 3`, `MAX_RUNGS = 6`. A reply outside that range is refused.
- **Zero friction on the way in.** No explanation asked for, ever. §4.1.
- **Rest and sleep ladders lower the bar to resting**, never frame rest as a task to complete. §5.1 calls structurally protected recovery the most important design decision in the app.
- **No API key in the browser.** `GROQ_API_KEY` is read only in `api/`, never with a `VITE_` prefix. §10 constraint 1.
- **Model unavailable is an ordinary state, not an error.** 503, timeout, offline and malformed reply all land silently on `ruleLadder`. No error dialog.
- **Untrusted input is validated at the boundary.** The endpoint validates body fields before anything reaches a prompt; the client validates the reply before anything reaches the app.
- **No migration.** `StoredSettings.ladders` is optional. Settings written before this feature keep loading, asserted by a test.
- **`src/engine/**` and `src/optimizer/**` must not change.** (`src/optimizer/types.ts` is read, never edited.)
- **Immutability.** Every domain function returns a new object; nothing is mutated in place.
- **No `console.log` in production code.**
- **TDD, red before green.** Watch each test fail before writing the implementation.
- **Coverage thresholds only go up.** Currently `statements: 97, branches: 91, functions: 97, lines: 98` in `vitest.config.ts`. Never lower one.
- **Responsive at 320 / 390 / 768 / 1280px.**
- **Commit format:** `<type>: <description>`, body explaining why, ending with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **Never `git push`.** Project rule, `.claude/CLAUDE.md`.

### Fixed values

| Constant | Value | Where | Rationale |
|---|---|---|---|
| `MAX_RUNG_MINUTES` | `10` | `src/domain/ladder.ts` | §4.1: "a time box under ten minutes" |
| `MIN_RUNGS` | `3` | `src/domain/ladder.ts` | Fewer than three is not a chain to finishing |
| `MAX_RUNGS` | `6` | `src/domain/ladder.ts` | A stuck person is not carried by a nineteen-step plan |
| `MAX_ACTION_LENGTH` | `160` | `src/domain/ladder.ts` | One instruction, not a paragraph |
| `MAX_TITLE_LENGTH` | `200` | `api/micro-start.ts` | A block title, not a document |
| `LADDER_TIMEOUT_MS` | `8000` | `src/ai/ladderWriter.ts` | Matches the planner and drafter budgets. §10 constraint 3 |

---

## File Structure

| File | Responsibility |
|---|---|
| `src/domain/ladder.ts` (create) | `Rung`, `Ladder`, the pure algebra, and `ruleLadder` — the offline generator |
| `src/domain/ladder.test.ts` (create) | Unit tests for the above |
| `src/domain/microStart.ts` (modify) | `firstAction` reimplemented as `ruleLadder`'s first rung; `FIRST_MOVE` and `MICRO_START_MINUTES` deleted; `isStuck` unchanged |
| `src/ai/ladderSchema.ts` (create) | Zod validation of a model reply, all-or-nothing |
| `src/ai/ladderSchema.test.ts` (create) | Rejection cases |
| `src/ai/ladderWriter.ts` (create) | The Groq call. Takes the key. Imported only by `api/` |
| `src/ai/ladder.ts` (create) | Client: POSTs to `/api/micro-start`, falls back to `ruleLadder` |
| `src/ai/ladder.test.ts` (create) | Fallback behaviour under every failure |
| `src/ai/index.ts` (modify) | Exports `buildLadder`, `replaceRung`, `LadderOutcome` |
| `api/micro-start.ts` (create) | Edge endpoint. The fourth and last place `GROQ_API_KEY` is read |
| `src/data/types.ts` (modify) | `StoredSettings.ladders?: readonly Ladder[]` |
| `src/ui/useLadders.ts` (create) | Loads ladders from settings, writes them back |
| `src/ui/useLadders.test.tsx` (create) | Load, save, legacy settings, storage failure |
| `src/ui/week/blockActions.ts` (modify) | `microStart` joins the unconditional `MANUAL` list |
| `src/ui/week/BlockSheet.tsx` (modify) | Gains the button; loses the inline reveal and its local `MicroStartCard` |
| `src/ui/room/view.ts` (modify) | `View` kind `microStart`, `toMicroStart`, path, `back` |
| `src/ui/microStart/MicroStartPage.tsx` (create) | The page. Replaces the orphaned `MicroStartCard.tsx` |
| `src/ui/microStart/MicroStartPage.test.tsx` (create) | Component tests |
| `src/ui/microStart/MicroStartCard.tsx` (keep) | §3's "stuck" card in the room. NOT an orphan — `LiveCards` renders it |
| `src/ui/room/LiveCards.tsx` (unchanged) | Still renders the card; only the shell's handler for it moves |
| `src/ui/kit/Sheet.test.tsx` (modify) | Holds a `BlockSheetModel` fixture with `cantStart` and `microStart` in it |
| `src/telegram/handle.ts` (unchanged) | Keeps calling `firstAction`, which keeps its signature |
| `src/ui/room/RoomShell.tsx` (modify) | Routes to the page, holds the ladders, drops a ladder on complete/remove |
| `src/ui/RoomShell.microStart.test.tsx` (modify) | Rewritten against the page |
| `burnout-app-spec-v3.md` (modify) | §4.1 amendment |

---

## Task 1: The ladder, and the offline answer

**Files:**
- Create: `src/domain/ladder.ts`
- Test: `src/domain/ladder.test.ts`

**Interfaces:**
- Consumes: `ActivityKind` from `../engine`, `ScheduledItem` from `../optimizer`.
- Produces:
  - `interface Rung { readonly action: string; readonly minutes: number }`
  - `interface Ladder { readonly blockId: string; readonly rungs: readonly Rung[]; readonly done: number }`
  - `const MAX_RUNG_MINUTES: 10`, `MIN_RUNGS: 3`, `MAX_RUNGS: 6`, `MAX_ACTION_LENGTH: 160`
  - `currentRung(ladder: Ladder): Rung | null`
  - `advance(ladder: Ladder): Ladder`
  - `isComplete(ladder: Ladder): boolean`
  - `replaceCurrent(ladder: Ladder, rung: Rung): Ladder`
  - `ruleLadder(item: ScheduledItem): Ladder`

- [ ] **Step 1: Write the failing test**

Create `src/domain/ladder.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ACTIVITY_KINDS, type ActivityKind } from '../engine/types'
import type { ScheduledItem } from '../optimizer'
import {
  advance,
  currentRung,
  isComplete,
  MAX_ACTION_LENGTH,
  MAX_RUNG_MINUTES,
  MAX_RUNGS,
  MIN_RUNGS,
  replaceCurrent,
  ruleLadder,
  type Ladder,
} from './ladder'

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'b1',
  title: 'Ethics essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 3,
  intensity: 1,
  dayIndex: 0,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const ladder = (rungs: number, done: number): Ladder => ({
  blockId: 'b1',
  rungs: Array.from({ length: rungs }, (_, index) => ({ action: `step ${index}`, minutes: 5 })),
  done,
})

describe('the ladder algebra', () => {
  it('shows the rung at the done count', () => {
    expect(currentRung(ladder(3, 1))?.action).toBe('step 1')
  })

  it('has no current rung once every rung is done', () => {
    expect(currentRung(ladder(3, 3))).toBeNull()
  })

  it('advances without mutating the ladder it was given', () => {
    const before = ladder(3, 1)
    const after = advance(before)

    expect(after.done).toBe(2)
    expect(before.done).toBe(1)
    expect(after).not.toBe(before)
  })

  it('cannot advance past the last rung', () => {
    expect(advance(ladder(3, 3)).done).toBe(3)
  })

  it('is complete only when the done count reaches the end', () => {
    expect(isComplete(ladder(3, 2))).toBe(false)
    expect(isComplete(ladder(3, 3))).toBe(true)
  })

  // Rejecting a step is not progress through it. If `replaceCurrent` moved the count, a
  // student who disliked two suggestions in a row would be told they were two steps in.
  it('replaces the current rung without moving the count', () => {
    const next = replaceCurrent(ladder(3, 1), { action: 'something else', minutes: 4 })

    expect(next.rungs[1]?.action).toBe('something else')
    expect(next.rungs[0]?.action).toBe('step 0')
    expect(next.done).toBe(1)
  })

  it('ignores a replacement on a ladder with nothing left to replace', () => {
    const done = ladder(3, 3)
    expect(replaceCurrent(done, { action: 'x', minutes: 1 })).toEqual(done)
  })
})

describe('ruleLadder', () => {
  it.each(ACTIVITY_KINDS)('gives %s a usable chain with no network', (kind: ActivityKind) => {
    const built = ruleLadder(item({ kind }))

    expect(built.blockId).toBe('b1')
    expect(built.done).toBe(0)
    expect(built.rungs.length).toBeGreaterThanOrEqual(MIN_RUNGS)
    expect(built.rungs.length).toBeLessThanOrEqual(MAX_RUNGS)
  })

  it.each(ACTIVITY_KINDS)('keeps every %s rung inside the time box', (kind: ActivityKind) => {
    for (const rung of ruleLadder(item({ kind })).rungs) {
      expect(rung.minutes).toBeGreaterThan(0)
      expect(rung.minutes).toBeLessThanOrEqual(MAX_RUNG_MINUTES)
    }
  })

  it.each(ACTIVITY_KINDS)('keeps every %s rung to one instruction', (kind: ActivityKind) => {
    for (const rung of ruleLadder(item({ kind })).rungs) {
      expect(rung.action.trim().length).toBeGreaterThan(0)
      expect(rung.action.length).toBeLessThanOrEqual(MAX_ACTION_LENGTH)
    }
  })

  // §4.1: "you don't have to write the essay, you have to open the document". A rung that
  // is the task's own title reworded is the failure this whole feature exists to avoid.
  it('never answers a task with the task', () => {
    for (const rung of ruleLadder(item({ title: 'Write the ethics essay' })).rungs) {
      expect(rung.action.toLowerCase()).not.toContain('write the ethics essay')
    }
  })

  // §5.1: recovery is structurally protected. A ladder that says "finish resting" turns
  // the one protected thing in the week into another item to be behind on.
  it.each(['rest', 'sleep'] as const)('lowers the bar to %s rather than setting a task', (kind) => {
    const text = ruleLadder(item({ kind })).rungs.map((rung) => rung.action.toLowerCase()).join(' ')

    expect(text).not.toContain('finish')
    expect(text).not.toContain('complete')
    expect(text).not.toContain('get it done')
  })

  it('reads protected rest as rest whatever kind it carries', () => {
    const social = ruleLadder(item({ kind: 'socialRestorative', protectedRest: true }))
    const rest = ruleLadder(item({ kind: 'rest' }))

    expect(social.rungs).toEqual(rest.rungs)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/domain/ladder.test.ts`
Expected: FAIL — `Failed to resolve import "./ladder"`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/ladder.ts`:

```ts
import type { ActivityKind } from '../engine'
import type { ScheduledItem } from '../optimizer'

/** §4.1's time box: "one concrete first action with a time box under ten minutes". */
export const MAX_RUNG_MINUTES = 10

/** Fewer than three rungs is not a chain through to finishing; more than six is a plan,
 *  and a plan is the thing a stuck person cannot face. */
export const MIN_RUNGS = 3
export const MAX_RUNGS = 6

/** One instruction, not a paragraph. A rung a student has to read twice is a rung they
 *  have to decide about, which is what §5.2 says they cannot do. */
export const MAX_ACTION_LENGTH = 160

export interface Rung {
  readonly action: string
  readonly minutes: number
}

/**
 * §4.1 as amended: the whole chain is generated, exactly one rung is ever shown.
 *
 * `done` is a count rather than a set of ticked ids. The chain is ordered and rung 4
 * cannot precede rung 3, so a count is the honest representation of the state -- and it
 * makes "step 3 of 6" a subtraction rather than a search.
 */
export interface Ladder {
  readonly blockId: string
  readonly rungs: readonly Rung[]
  readonly done: number
}

export const currentRung = (ladder: Ladder): Rung | null => ladder.rungs[ladder.done] ?? null

export const isComplete = (ladder: Ladder): boolean => ladder.done >= ladder.rungs.length

export const advance = (ladder: Ladder): Ladder =>
  isComplete(ladder) ? ladder : { ...ladder, done: ladder.done + 1 }

/**
 * Swaps the rung the student is looking at, and does NOT move the count.
 *
 * Rejecting a suggestion is not progress through it. Advancing here would tell somebody who
 * disliked two suggestions in a row that they were two steps in, which is the opposite of
 * what they just said.
 */
export const replaceCurrent = (ladder: Ladder, rung: Rung): Ladder =>
  isComplete(ladder)
    ? ladder
    : { ...ladder, rungs: ladder.rungs.map((existing, index) => (index === ladder.done ? rung : existing)) }

/**
 * The chain for each kind of work, with no network involved.
 *
 * This is the offline answer and it lives in the domain rather than in `src/ai/` for the
 * reason the old `firstAction` already gave: a stuck student at 2am is exactly who should
 * not be waiting on a model. It replaces that function's one canned move per kind with a
 * chain of the same shape.
 *
 * The rungs are first *moves*, never smaller versions of the task -- §4.1's "outline the
 * essay is still the essay". None of them names the task, which is why this generator does
 * not read `item.title` at all: a rule that interpolated the title could only ever produce
 * the task reworded, which is the failure the feature exists to fix. Naming the specific
 * task is the model's job, and the model has the title.
 */
const CHAINS: Record<ActivityKind, readonly Rung[]> = {
  studyBlock: [
    { action: 'Open the document. Do not read anything yet.', minutes: 2 },
    { action: 'Write the title at the top. Nothing else.', minutes: 3 },
    { action: 'Write one bad sentence underneath it. Bad is the point.', minutes: 5 },
    { action: 'Keep going for five more minutes, then stop whether or not it is good.', minutes: 5 },
  ],
  errands: [
    { action: 'Find the one detail you need — a number, an address, a name.', minutes: 5 },
    { action: 'Put it somewhere you will see it: a note, a reminder, the back of your hand.', minutes: 2 },
    { action: 'Do the first half of it. Stop there if you want to.', minutes: 10 },
  ],
  lightExercise: [
    { action: 'Put your shoes on and stand by the door.', minutes: 3 },
    { action: 'Go outside. You are allowed to turn round immediately.', minutes: 2 },
    { action: 'Walk for ten minutes. Turning back is finishing, not quitting.', minutes: 10 },
  ],
  hardExercise: [
    { action: 'Put your kit on. That is the whole step.', minutes: 5 },
    { action: 'Get to where you do it. You have not committed to anything yet.', minutes: 10 },
    { action: 'Do the easiest set. If you stop after it, you still went.', minutes: 10 },
  ],
  socialDraining: [
    { action: 'Open the message. Do not reply yet.', minutes: 2 },
    { action: 'Write the first line. It does not have to be sent.', minutes: 5 },
    { action: 'Send it, or close it and let it wait. Either one ends this.', minutes: 2 },
  ],
  socialRestorative: [
    { action: 'Open the message and read the last thing they said.', minutes: 2 },
    { action: 'Write one line back. Short is warm, not rude.', minutes: 5 },
    { action: 'Send it. You do not owe anyone the longer version.', minutes: 2 },
  ],
  // §5.1: recovery is structurally protected. These lower the bar to resting; none of them
  // asks the student to finish, complete or get through anything.
  rest: [
    { action: 'Put the phone somewhere you cannot reach from where you are sitting.', minutes: 2 },
    { action: 'Set a timer so you do not have to keep checking the clock.', minutes: 1 },
    { action: 'Sit down. Doing nothing for the whole timer is the right amount.', minutes: 10 },
  ],
  sleep: [
    { action: 'Put the phone in another room. Not face down — another room.', minutes: 2 },
    { action: 'Turn the main light off. The small one is fine.', minutes: 1 },
    { action: 'Lie down. Not sleeping yet still counts as this.', minutes: 10 },
  ],
}

export function ruleLadder(item: ScheduledItem): Ladder {
  // Protected rest is rest whatever kind it carries: a restorative coffee the optimizer has
  // protected must not be handed the social chain, which would ask the student to get
  // through it.
  const kind: ActivityKind = item.protectedRest ? 'rest' : item.kind

  return { blockId: item.id, rungs: CHAINS[kind], done: 0 }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/domain/ladder.test.ts`
Expected: PASS, all tests.

- [ ] **Step 4b: Put `firstAction` on top of the same table**

`firstAction` is **not** deleted. `src/telegram/handle.ts:432` answers `/start <task>` with
it, and a Telegram reply is one message with no page to route to. But it must not keep its
own copy of the moves, or the bot and the app can disagree about the same block.

Add to `src/domain/ladder.test.ts`:

```ts
describe('firstAction', () => {
  it('is the first rung of the same chain the page walks', () => {
    const move = firstAction(item({ kind: 'errands' }))
    const first = ruleLadder(item({ kind: 'errands' })).rungs[0]

    expect(move.action).toBe(first?.action)
    expect(move.minutes).toBe(first?.minutes)
    expect(move.itemId).toBe('b1')
  })
})
```

Import `firstAction` from `./microStart` in that test file. Then in
`src/domain/microStart.ts`, delete `FIRST_MOVE` and `MICRO_START_MINUTES` and replace
`firstAction` with:

```ts
/**
 * §4.1's single first move, for a surface that has no room for a chain.
 *
 * The Telegram bot answers `/start <task>` with one message and cannot walk a ladder, so it
 * gets rung one. Derived from `ruleLadder` rather than keeping its own table: two tables is
 * two answers to "what is the first move on this block", and the bot and the app would
 * eventually give different ones.
 */
export function firstAction(item: ScheduledItem): MicroStart {
  const first = ruleLadder(item).rungs[0]

  // `ruleLadder` returns a chain of at least MIN_RUNGS for every kind, so this cannot
  // happen -- but `noUncheckedIndexedAccess` is right to insist, and a silent empty string
  // reaching a student is worse than a dull honest one.
  if (first === undefined) return { itemId: item.id, action: 'Start with the smallest part of it.', minutes: 5 }

  return { itemId: item.id, action: first.action, minutes: first.minutes }
}
```

Keep the `MicroStart` interface where it is; `render.ts` and `LiveCards.tsx` both take it.

Run: `npx vitest run src/domain src/telegram`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/domain/ladder.ts src/domain/ladder.test.ts
git commit -F - <<'MSG'
feat: the ladder, and the answer it gives with no network

§4.1's one canned move per kind becomes a chain of them. The rule generator
lives in the domain rather than the AI layer for the reason `firstAction`
already gave: a stuck student at 2am should not be waiting on a model.

`done` is a count, not a set of ticked ids -- the chain is ordered, so rung 4
cannot precede rung 3 and a count is the honest state. `replaceCurrent`
deliberately does not move it: rejecting a suggestion is not progress.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 2: Refusing a bad reply

**Files:**
- Create: `src/ai/ladderSchema.ts`
- Test: `src/ai/ladderSchema.test.ts`

**Interfaces:**
- Consumes: `Rung`, `MIN_RUNGS`, `MAX_RUNGS`, `MAX_RUNG_MINUTES`, `MAX_ACTION_LENGTH` from `../domain/ladder`.
- Produces: `parseLadderReply(raw: unknown): Rung[] | null`

- [ ] **Step 1: Write the failing test**

Create `src/ai/ladderSchema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseLadderReply } from './ladderSchema'

const rungs = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ action: `do thing ${index}`, minutes: 5 }))

describe('parseLadderReply', () => {
  it('accepts a well-formed chain', () => {
    expect(parseLadderReply({ steps: rungs(4) })).toHaveLength(4)
  })

  // The wrapper is our request, and dropping it is the most common way a model deviates.
  // The same allowance the planner's and drafter's schemas already make.
  it('accepts a bare array as the chain', () => {
    expect(parseLadderReply(rungs(3))).toHaveLength(3)
  })

  it('refuses a chain shorter than three', () => {
    expect(parseLadderReply({ steps: rungs(2) })).toBeNull()
  })

  it('refuses a chain longer than six', () => {
    expect(parseLadderReply({ steps: rungs(7) })).toBeNull()
  })

  // §4.1's time box is a promise made to the student on screen. A schema that let an
  // eleven-minute rung through would print that promise next to a number breaking it.
  it('refuses a rung over the time box', () => {
    expect(parseLadderReply({ steps: [...rungs(2), { action: 'a long one', minutes: 11 }] })).toBeNull()
  })

  it('refuses a rung with no time at all', () => {
    expect(parseLadderReply({ steps: [...rungs(2), { action: 'no time', minutes: 0 }] })).toBeNull()
  })

  it('refuses a fractional number of minutes', () => {
    expect(parseLadderReply({ steps: [...rungs(2), { action: 'half', minutes: 2.5 }] })).toBeNull()
  })

  it('refuses an empty action', () => {
    expect(parseLadderReply({ steps: [...rungs(2), { action: '   ', minutes: 4 }] })).toBeNull()
  })

  it('refuses an action longer than one instruction', () => {
    expect(parseLadderReply({ steps: [...rungs(2), { action: 'x'.repeat(161), minutes: 4 }] })).toBeNull()
  })

  it('refuses a reply that is not an object at all', () => {
    expect(parseLadderReply('steps: open the document')).toBeNull()
    expect(parseLadderReply(null)).toBeNull()
  })

  // All-or-nothing, like `parseModelReply` and `parseDraftReply`. A partially valid chain
  // is a chain with a hole in it, and the hole is invisible on a page showing one rung.
  it('refuses the whole chain when one rung is malformed', () => {
    expect(parseLadderReply({ steps: [...rungs(3), { action: 'fine', minutes: 'soon' }] })).toBeNull()
  })

  it('trims the whitespace a model leaves around an action', () => {
    expect(parseLadderReply({ steps: [{ action: '  open it  ', minutes: 2 }, ...rungs(2)] })?.[0]?.action).toBe(
      'open it',
    )
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/ai/ladderSchema.test.ts`
Expected: FAIL — `Failed to resolve import "./ladderSchema"`.

- [ ] **Step 3: Write the implementation**

Create `src/ai/ladderSchema.ts`:

```ts
import { z } from 'zod'
import { MAX_ACTION_LENGTH, MAX_RUNG_MINUTES, MAX_RUNGS, MIN_RUNGS, type Rung } from '../domain/ladder'

/**
 * The same boundary the planner's and the drafter's schemas guard, applied to a chain.
 *
 * The bounds are not decoration. §4.1's time box is printed on screen beside the rung, so a
 * schema that admitted an eleven-minute step would have the app make a promise and break it
 * in the same sentence. The project rule is that untrusted input never becomes trusted by
 * passing through a layer -- and a reply is not trusted for having come back through our own
 * server.
 */
const replySchema = z.object({
  steps: z
    .array(
      z.object({
        action: z.string().trim().min(1).max(MAX_ACTION_LENGTH),
        minutes: z.number().int().positive().max(MAX_RUNG_MINUTES),
      }),
    )
    .min(MIN_RUNGS)
    .max(MAX_RUNGS),
})

/** The wrapper is our request, and dropping it is the most common way a model deviates.
 *  Nothing inside is relaxed by allowing it. */
const withWrapper = (raw: unknown): unknown => (Array.isArray(raw) ? { steps: raw } : raw)

/**
 * All-or-nothing, deliberately.
 *
 * A partially valid chain is a chain with a hole in it, and on a page that shows one rung at
 * a time the hole is invisible until the student reaches it -- at which point they are
 * stuck again, by the thing built to unstick them.
 */
export function parseLadderReply(raw: unknown): Rung[] | null {
  const result = replySchema.safeParse(withWrapper(raw))
  if (!result.success) return null

  return result.data.steps.map((step) => ({ action: step.action, minutes: step.minutes }))
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/ai/ladderSchema.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/ai/ladderSchema.ts src/ai/ladderSchema.test.ts
git commit -F - <<'MSG'
feat: refuse a chain the student could not act on

All-or-nothing, like the planner's and drafter's schemas. A partially valid
chain is a chain with a hole in it, and on a page showing one rung at a time
the hole stays invisible until the student walks into it.

The bounds are not decoration: §4.1's time box is printed beside the rung, so
admitting an eleven-minute step would make the app break its promise in the
same sentence it makes it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 3: Asking the model, server side only

**Files:**
- Create: `src/ai/ladderWriter.ts`
- Create: `api/micro-start.ts`

**Interfaces:**
- Consumes: `parseLadderReply` (Task 2), `MIN_RUNGS`/`MAX_RUNGS`/`MAX_RUNG_MINUTES` from `../domain/ladder`, `GROQ_TEXT_MODEL` from `./models`, `BLOCK_KINDS` from `../engine`.
- Produces:
  - `interface LadderBrief { readonly what: string; readonly kind: string; readonly hours: number; readonly rejected?: string; readonly soFar?: readonly string[] }`
  - `askLadder(brief: LadderBrief, apiKey: string): Promise<Rung[] | null>`
  - `api/micro-start.ts` default handler, `config = { runtime: 'edge' }`

There are no unit tests in this task: `src/ai/ladderWriter.ts` and `api/**` are the credential-holding modules, and the repo's existing pattern (`writer.ts`, `groq.ts`, `vision.ts`) is that they are exercised through the client's fallback tests in Task 4 rather than by mocking `fetch` against a live-shaped API. `api/**` is outside `vitest.config.ts`'s `include`, so it is not part of the coverage denominator.

- [ ] **Step 1: Write `src/ai/ladderWriter.ts`**

```ts
import { MAX_RUNG_MINUTES, MAX_RUNGS, MIN_RUNGS, type Rung } from '../domain/ladder'
import { parseLadderReply } from './ladderSchema'
import { GROQ_TEXT_MODEL } from './models'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

/** Matches the planner's and the drafter's budget: this is text, not an image. §10's third
 *  constraint. A stuck student waiting on a spinner is more stuck, not less. */
const LADDER_TIMEOUT_MS = 8000

/**
 * Everything the model is told about the block, and nothing else.
 *
 * Not the week, not the reserves, not the student. Breaking one task into first moves has
 * no use for any of it -- and a prompt that carried the week would be sending a great deal
 * about somebody's life to answer "how do I start this".
 */
export interface LadderBrief {
  readonly what: string
  readonly kind: string
  readonly hours: number
  /** Set only when the student pressed "that one doesn't fit": the rung being rejected. */
  readonly rejected?: string
  /** The rungs already done, so a replacement does not repeat one. */
  readonly soFar?: readonly string[]
}

const SYSTEM_PROMPT = [
  'A student is unable to start one task. You break it into the smallest physical first moves.',
  'Reply with JSON only, shaped {"steps":[{"action","minutes"}]}.',
  `Give between ${MIN_RUNGS} and ${MAX_RUNGS} steps, in the order they are done.`,
  `minutes is a whole number from 1 to ${MAX_RUNG_MINUTES}. Never more.`,
  'Each step is a physical move a person could do without deciding anything:',
  'open the document, put your shoes on, find the phone number.',
  'A step is never a smaller version of the task. "Outline the essay" is still the essay.',
  'Never ask the student to plan, decide, choose, prioritise or think about anything.',
  'Write to them directly, in the second person, plainly and without encouragement or praise.',
  'The last step ends the task or ends the session honestly. Never promise it will be easy.',
  'If the task is rest or sleep, every step lowers the bar to resting.',
  'Never tell somebody to finish, complete or get through their rest.',
].join(' ')

const briefLines = (brief: LadderBrief): string => {
  const lines = [`Task: ${brief.what}`, `Kind: ${brief.kind}`, `Estimated effort: ${brief.hours} hours`]

  if (brief.soFar !== undefined && brief.soFar.length > 0) {
    lines.push(`Already done: ${brief.soFar.join('; ')}`)
  }
  if (brief.rejected !== undefined) {
    lines.push(`This step did not fit, give a different one in its place: ${brief.rejected}`)
  }

  return lines.join('\n')
}

/**
 * The fourth and last place a Groq key is used, and only ever reached from `api/`.
 *
 * The reply goes through the same schema the client would use, so a malformed chain is
 * caught here rather than travelling one hop further into the app.
 */
export async function askLadder(brief: LadderBrief, apiKey: string): Promise<Rung[] | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LADDER_TIMEOUT_MS)

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_TEXT_MODEL,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: briefLines(brief) },
        ],
      }),
    })

    if (!response.ok) return null

    const body = (await response.json()) as { choices?: readonly { message?: { content?: string } }[] }
    const content = body.choices?.[0]?.message?.content
    if (typeof content !== 'string') return null

    return parseLadderReply(JSON.parse(content) as unknown)
  } catch {
    // A timeout, a network failure, or JSON the model did not close. All the same answer:
    // no chain, and the client falls back to the rules.
    return null
  } finally {
    clearTimeout(timeout)
  }
}
```

- [ ] **Step 2: Write `api/micro-start.ts`**

```ts
import { BLOCK_KINDS } from '../src/engine'
import { askLadder, type LadderBrief } from '../src/ai/ladderWriter'
import { MAX_ACTION_LENGTH, MAX_RUNGS } from '../src/domain/ladder'

/** Declared rather than inferred, matching api/plan.ts and api/draft.ts: the two runtimes
 *  take different handler signatures and the wrong one fails only once deployed. */
export const config = { runtime: 'edge' }

/** A block title, not a document. */
const MAX_TITLE_LENGTH = 200

/** `sleep` never reaches the grid as a block (see `BLOCK_KINDS`'s docstring), so the
 *  endpoint accepts exactly what a block can carry and nothing else. */
const KINDS: readonly string[] = BLOCK_KINDS

/**
 * The fourth and last place `GROQ_API_KEY` is read. Nothing outside `api/` reads it.
 *
 * With no key it answers 503 and the client falls back to `ruleLadder`, which is a genuine
 * equal rather than an apology -- the chain for each kind of work is written out and needs
 * no model. That is the normal path in CI, in tests, and under `vite dev` where /api is not
 * served at all.
 *
 * Every field is bounded before it reaches a prompt. A block title is text the student
 * typed or a model produced, so it arrives here untrusted whichever door it came through,
 * and it does not become trusted for having passed through the app first.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return new Response('Micro-start unavailable', { status: 503 })

  let body: Partial<LadderBrief>
  try {
    body = (await request.json()) as Partial<LadderBrief>
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const { what, kind, hours, rejected, soFar } = body

  if (typeof what !== 'string' || what.trim() === '' || what.length > MAX_TITLE_LENGTH) {
    return new Response('Bad request', { status: 400 })
  }
  if (typeof kind !== 'string' || !KINDS.includes(kind)) {
    return new Response('Bad request', { status: 400 })
  }
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return new Response('Bad request', { status: 400 })
  }

  // Optional, and bounded on the same terms as everything else here: these are strings the
  // app sent, but the endpoint is public and cannot tell one caller from another.
  const cleanRejected =
    typeof rejected === 'string' && rejected.length > 0 && rejected.length <= MAX_ACTION_LENGTH
      ? rejected
      : undefined

  const cleanSoFar =
    Array.isArray(soFar) && soFar.length <= MAX_RUNGS
      ? soFar.filter(
          (line): line is string => typeof line === 'string' && line.length > 0 && line.length <= MAX_ACTION_LENGTH,
        )
      : undefined

  const steps = await askLadder(
    {
      what,
      kind,
      hours,
      ...(cleanRejected === undefined ? {} : { rejected: cleanRejected }),
      ...(cleanSoFar === undefined ? {} : { soFar: cleanSoFar }),
    },
    apiKey,
  )

  if (steps === null) return new Response('Micro-start unavailable', { status: 503 })

  return new Response(JSON.stringify({ steps }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
```

- [ ] **Step 3: Verify the key cannot reach the browser**

Run: `npx vite build`
Then: `grep -rl "GROQ_API_KEY" dist/ ; echo "exit=$?"`
Expected: no file listed (grep exits 1). If any bundle names it, stop — a credential is in the client and nothing else in this plan matters until it is not.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/ai/ladderWriter.ts api/micro-start.ts
git commit -F - <<'MSG'
feat: ask the model for a chain, from the server and nowhere else

The fourth and last place GROQ_API_KEY is read, and it keeps the rule §10
already set: no VITE_ prefix, so the credential cannot reach the bundle, and
503 rather than an error when no key is configured -- which is the normal path
in CI and under `vite dev`.

The brief carries the one block and nothing else. Breaking a task into first
moves has no use for the week, and a prompt that carried it would be sending a
great deal about somebody's life to answer "how do I start this".

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 4: The client, and its silence when the model is gone

**Files:**
- Create: `src/ai/ladder.ts`
- Test: `src/ai/ladder.test.ts`
- Modify: `src/ai/index.ts`

**Interfaces:**
- Consumes: `parseLadderReply` (Task 2), `ruleLadder`/`replaceCurrent`/`currentRung`/`Ladder`/`Rung` (Task 1), `ScheduledItem`.
- Produces:
  - `interface LadderOutcome { readonly ladder: Ladder; readonly source: 'model' | 'fallback' }`
  - `buildLadder(item: ScheduledItem): Promise<LadderOutcome>`
  - `replaceRung(item: ScheduledItem, ladder: Ladder): Promise<Ladder>`

- [ ] **Step 1: Write the failing test**

Create `src/ai/ladder.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ruleLadder, type Ladder } from '../domain/ladder'
import type { ScheduledItem } from '../optimizer'
import { buildLadder, replaceRung } from './ladder'

const item: ScheduledItem = {
  id: 'b1',
  title: 'Ethics essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 3,
  intensity: 1,
  dayIndex: 0,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
}

const ok = (payload: unknown) =>
  ({ ok: true, json: async () => payload }) as unknown as Response

const status = (code: number) => ({ ok: false, status: code }) as unknown as Response

const modelSteps = [
  { action: 'Open the ethics essay document.', minutes: 2 },
  { action: 'Write the title.', minutes: 3 },
  { action: 'Write one bad sentence.', minutes: 5 },
]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildLadder', () => {
  it('uses the model chain when the endpoint answers', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ steps: modelSteps }))

    const outcome = await buildLadder(item)

    expect(outcome.source).toBe('model')
    expect(outcome.ladder.rungs).toEqual(modelSteps)
    expect(outcome.ladder.blockId).toBe('b1')
    expect(outcome.ladder.done).toBe(0)
  })

  it('sends the block and nothing about the rest of the week', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ steps: modelSteps }))

    await buildLadder(item)

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string) as Record<string, unknown>
    expect(body).toEqual({ what: 'Ethics essay', kind: 'studyBlock', hours: 3 })
  })

  // Every failure is the same answer, and none of them is an error the student sees. The
  // rule chain is a real answer, not a degraded one.
  it('falls back to the rules when the endpoint is unavailable', async () => {
    vi.mocked(fetch).mockResolvedValue(status(503))

    const outcome = await buildLadder(item)

    expect(outcome.source).toBe('fallback')
    expect(outcome.ladder.rungs).toEqual(ruleLadder(item).rungs)
  })

  it('falls back to the rules when there is no network at all', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))

    expect((await buildLadder(item)).source).toBe('fallback')
  })

  it('falls back to the rules when the reply does not pass the schema', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ steps: [{ action: 'only one', minutes: 2 }] }))

    expect((await buildLadder(item)).source).toBe('fallback')
  })

  it('never throws, whatever the endpoint does', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('not json')
      },
    } as unknown as Response)

    await expect(buildLadder(item)).resolves.toBeDefined()
  })
})

describe('replaceRung', () => {
  const open: Ladder = {
    blockId: 'b1',
    rungs: [
      { action: 'first', minutes: 2 },
      { action: 'second', minutes: 3 },
      { action: 'third', minutes: 4 },
    ],
    done: 1,
  }

  it('swaps only the current rung and leaves the count alone', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ steps: modelSteps }))

    const next = await replaceRung(item, open)

    expect(next.rungs[1]).toEqual(modelSteps[0])
    expect(next.rungs[0]?.action).toBe('first')
    expect(next.rungs[2]?.action).toBe('third')
    expect(next.done).toBe(1)
  })

  it('tells the endpoint what was rejected and what is already done', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ steps: modelSteps }))

    await replaceRung(item, open)

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string) as Record<string, unknown>
    expect(body.rejected).toBe('second')
    expect(body.soFar).toEqual(['first'])
  })

  // Without a model there is nothing new to say, and re-rolling into the identical rule
  // rung would be a button that visibly does nothing.
  it('leaves the ladder untouched when the model is unavailable', async () => {
    vi.mocked(fetch).mockResolvedValue(status(503))

    expect(await replaceRung(item, open)).toEqual(open)
  })

  it('leaves a finished ladder untouched without calling anything', async () => {
    const finished: Ladder = { ...open, done: 3 }

    expect(await replaceRung(item, finished)).toEqual(finished)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/ai/ladder.test.ts`
Expected: FAIL — `Failed to resolve import "./ladder"`.

- [ ] **Step 3: Write the implementation**

Create `src/ai/ladder.ts`:

```ts
import { currentRung, isComplete, replaceCurrent, ruleLadder, type Ladder, type Rung } from '../domain/ladder'
import type { ScheduledItem } from '../optimizer'
import { parseLadderReply } from './ladderSchema'

export interface LadderOutcome {
  readonly ladder: Ladder
  readonly source: 'model' | 'fallback'
}

/**
 * Everything the endpoint is sent about a block, and nothing else.
 *
 * Not the week, not the reserves, not the student. Deliberately mirrors `briefFor` in
 * `drafts.ts`: a call that breaks one task into first moves has no use for the rest and no
 * business seeing it.
 */
const briefFor = (item: ScheduledItem) => ({
  what: item.title,
  kind: item.protectedRest ? 'rest' : item.kind,
  hours: item.hours,
})

const askEndpoint = async (payload: object): Promise<Rung[] | null> => {
  try {
    const response = await fetch('/api/micro-start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) return null

    return parseLadderReply((await response.json()) as unknown)
  } catch {
    // No endpoint, no network, or a body that is not JSON. Every one of them is the same
    // answer to the caller, and none of them is an error a stuck student needs to read.
    return null
  }
}

/**
 * The chain for this block: the model's if it can be had, the rules' otherwise.
 *
 * Like the drafter and unlike photo import, the fallback here is a genuine equal rather
 * than an apology -- the chain for each kind of work is written out in the domain and needs
 * no model at all. So this works with no key configured, and what the student loses is that
 * the steps name their actual task rather than their kind of task.
 */
export async function buildLadder(item: ScheduledItem): Promise<LadderOutcome> {
  const rungs = await askEndpoint(briefFor(item))

  if (rungs === null) return { ladder: ruleLadder(item), source: 'fallback' }

  return { ladder: { blockId: item.id, rungs, done: 0 }, source: 'model' }
}

/**
 * "That one doesn't fit": one replacement rung, in place.
 *
 * Returns the ladder unchanged when there is no model, rather than swapping in the rule
 * rung that is already on screen. A button that visibly does nothing is worse than one that
 * quietly declines -- and the caller shows the offer only when a model chain was received,
 * so this path is the race, not the normal case.
 */
export async function replaceRung(item: ScheduledItem, ladder: Ladder): Promise<Ladder> {
  const rejected = currentRung(ladder)
  if (rejected === null || isComplete(ladder)) return ladder

  const rungs = await askEndpoint({
    ...briefFor(item),
    rejected: rejected.action,
    soFar: ladder.rungs.slice(0, ladder.done).map((rung) => rung.action),
  })

  const replacement = rungs?.[0]
  if (replacement === undefined) return ladder

  return replaceCurrent(ladder, replacement)
}
```

- [ ] **Step 4: Add the exports**

In `src/ai/index.ts`, after the `draftReplies` export line, add:

```ts
export { buildLadder, replaceRung, type LadderOutcome } from './ladder'
```

Do **not** export `ladderWriter`. It takes a credential, and the whole reason `groq.ts`, `vision.ts` and `writer.ts` are absent from this file is that nothing in the browser bundle should be able to reach one even by accident.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run src/ai/ladder.test.ts`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add src/ai/ladder.ts src/ai/ladder.test.ts src/ai/index.ts
git commit -F - <<'MSG'
feat: ask for a chain, and say nothing when the answer does not come

A 503, a timeout, no network and a reply the schema refuses are one answer to
the caller: the rule chain, silently. A stuck person does not need an error
dialog, and the rules are a genuine equal rather than an apology -- what is
lost without a model is that the steps name the kind of task rather than the
task.

`replaceRung` returns the ladder untouched when there is no model, rather than
swapping in the rung already on screen. A button that visibly does nothing is
worse than one that quietly declines.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 5: Somewhere for a ladder to live

**Files:**
- Modify: `src/data/types.ts`
- Create: `src/ui/useLadders.ts`
- Test: `src/ui/useLadders.test.tsx`

**Interfaces:**
- Consumes: `Ladder` (Task 1), `Repository`, `StoredSettings`, `DEFAULT_SETTINGS` from `../data`.
- Produces: `useLadders(repo: Repository): { ladders: readonly Ladder[]; saveLadder: (ladder: Ladder) => void; dropLadder: (blockId: string) => void }`

- [ ] **Step 1: Write the failing test**

Create `src/ui/useLadders.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Repository, StoredSettings } from '../data'
import { DEFAULT_SETTINGS } from '../data'
import type { Ladder } from '../domain/ladder'
import { useLadders } from './useLadders'

const ladder = (blockId: string, done = 0): Ladder => ({
  blockId,
  rungs: [
    { action: 'first', minutes: 2 },
    { action: 'second', minutes: 3 },
    { action: 'third', minutes: 4 },
  ],
  done,
})

const repoWith = (settings: StoredSettings) => {
  const saveSettings = vi.fn<(next: StoredSettings) => Promise<void>>().mockResolvedValue(undefined)

  const repo = {
    loadWeek: vi.fn().mockResolvedValue(null),
    saveWeek: vi.fn().mockResolvedValue(undefined),
    loadSettings: vi.fn().mockResolvedValue(settings),
    saveSettings,
    loadBlockLog: vi.fn().mockResolvedValue([]),
    recordBlockAnswer: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  } as unknown as Repository

  return { repo, saveSettings }
}

describe('useLadders', () => {
  it('loads the ladders already stored', async () => {
    const { repo } = repoWith({ ...DEFAULT_SETTINGS, ladders: [ladder('b1', 2)] })
    const { result } = renderHook(() => useLadders(repo))

    await waitFor(() => expect(result.current.ladders).toHaveLength(1))
    expect(result.current.ladders[0]?.done).toBe(2)
  })

  // No migration: settings written before this feature have no `ladders` field at all and
  // must keep loading rather than taking the screen down.
  it('loads settings written before ladders existed', async () => {
    const { repo } = repoWith({ lowEnergyOverride: 'auto' })
    const { result } = renderHook(() => useLadders(repo))

    await waitFor(() => expect(result.current.ladders).toEqual([]))
  })

  it('keeps working when storage cannot be read', async () => {
    const { repo } = repoWith(DEFAULT_SETTINGS)
    vi.mocked(repo.loadSettings).mockRejectedValue(new Error('no storage'))

    const { result } = renderHook(() => useLadders(repo))

    await waitFor(() => expect(result.current.ladders).toEqual([]))
  })

  it('writes a new ladder back to settings', async () => {
    const { repo, saveSettings } = repoWith(DEFAULT_SETTINGS)
    const { result } = renderHook(() => useLadders(repo))

    await waitFor(() => expect(repo.loadSettings).toHaveBeenCalled())
    act(() => result.current.saveLadder(ladder('b1')))

    await waitFor(() => expect(saveSettings).toHaveBeenCalled())
    expect(saveSettings.mock.calls.at(-1)?.[0].ladders).toEqual([ladder('b1')])
  })

  // Upsert, not append. Advancing a rung saves the same ladder again, and a second copy
  // would leave two disagreeing records of where the student got to.
  it('replaces a ladder for a block it already has', async () => {
    const { repo, saveSettings } = repoWith({ ...DEFAULT_SETTINGS, ladders: [ladder('b1', 0)] })
    const { result } = renderHook(() => useLadders(repo))

    await waitFor(() => expect(result.current.ladders).toHaveLength(1))
    act(() => result.current.saveLadder(ladder('b1', 1)))

    await waitFor(() => expect(result.current.ladders).toHaveLength(1))
    expect(result.current.ladders[0]?.done).toBe(1)
  })

  it('drops the ladder for a block that is gone', async () => {
    const { repo } = repoWith({ ...DEFAULT_SETTINGS, ladders: [ladder('b1'), ladder('b2')] })
    const { result } = renderHook(() => useLadders(repo))

    await waitFor(() => expect(result.current.ladders).toHaveLength(2))
    act(() => result.current.dropLadder('b1'))

    await waitFor(() => expect(result.current.ladders).toHaveLength(1))
    expect(result.current.ladders[0]?.blockId).toBe('b2')
  })

  // Applied on screen whether or not it persists, exactly as `useLowEnergy` does: a student
  // who ticks a step must see the next one even if the write fails.
  it('advances on screen even when the write fails', async () => {
    const { repo, saveSettings } = repoWith(DEFAULT_SETTINGS)
    saveSettings.mockRejectedValue(new Error('no storage'))

    const { result } = renderHook(() => useLadders(repo))
    await waitFor(() => expect(repo.loadSettings).toHaveBeenCalled())

    act(() => result.current.saveLadder(ladder('b1', 1)))

    await waitFor(() => expect(result.current.ladders).toHaveLength(1))
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/ui/useLadders.test.tsx`
Expected: FAIL — `Failed to resolve import "./useLadders"`.

- [ ] **Step 3: Add the field to `StoredSettings`**

In `src/data/types.ts`, add the import and the field:

```ts
import type { Ladder } from '../domain/ladder'
```

and inside `interface StoredSettings`, after `calibration`:

```ts
  /**
   * §4.1's chains, one per block that has been opened on the micro-start page.
   *
   * Here rather than behind new `Repository` methods for the same reason `calibration` is:
   * both adapters already persist settings as one blob, so this needs no migration and no
   * adapter change. Optional, because settings saved before the ladder existed have no such
   * field and must keep loading.
   *
   * A ladder is dropped when its block is completed or removed, so a record cannot outlive
   * the thing it describes.
   */
  readonly ladders?: readonly Ladder[]
```

Leave `DEFAULT_SETTINGS` alone: an absent field and an empty array mean the same thing here, and adding `ladders: []` would put an empty array into every settings blob the app writes for no gain.

- [ ] **Step 4: Write the hook**

Create `src/ui/useLadders.ts`:

```ts
import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type Repository } from '../data'
import type { Ladder } from '../domain/ladder'

/**
 * Reads the stored ladders and writes them back as the student moves through one.
 *
 * Shaped exactly like `useLowEnergy`, including the failure behaviour: unreachable storage
 * keeps the empty default rather than rejecting, and a change is applied on screen whether
 * or not it persists. A student who ticks a step must see the next one even if the write
 * fails -- the alternative is a page that appears frozen at the moment they finally moved.
 */
export function useLadders(repo: Repository): {
  ladders: readonly Ladder[]
  saveLadder: (ladder: Ladder) => void
  dropLadder: (blockId: string) => void
} {
  const [ladders, setLadders] = useState<readonly Ladder[]>([])

  useEffect(() => {
    let cancelled = false

    repo
      .loadSettings()
      .catch(() => DEFAULT_SETTINGS)
      .then((saved) => {
        // Settings written before this feature have no `ladders` at all, and land on the
        // empty array rather than taking the screen down.
        if (!cancelled) setLadders(saved.ladders ?? [])
      })

    return () => {
      cancelled = true
    }
  }, [repo])

  const write = (next: readonly Ladder[]) => {
    setLadders(next)

    // Read-modify-write against storage rather than against the settings this hook happens
    // to hold: `useProfile` and `useLowEnergy` write the same blob, and starting from a
    // stale copy here would silently drop whichever of them wrote last.
    repo
      .loadSettings()
      .catch(() => DEFAULT_SETTINGS)
      .then((saved) => repo.saveSettings({ ...saved, ladders: next }))
      .catch(() => undefined)
  }

  return {
    ladders,
    // Upsert on `blockId`. Advancing a rung saves the same ladder again, and appending a
    // second copy would leave two records disagreeing about where the student got to.
    saveLadder: (ladder: Ladder) =>
      write([...ladders.filter((existing) => existing.blockId !== ladder.blockId), ladder]),
    dropLadder: (blockId: string) => write(ladders.filter((existing) => existing.blockId !== blockId)),
  }
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run src/ui/useLadders.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 6: Check nothing else broke**

Run: `npx vitest run src/data`
Expected: PASS. The optional field must not disturb either adapter or the contract tests.

- [ ] **Step 7: Commit**

```bash
git add src/data/types.ts src/ui/useLadders.ts src/ui/useLadders.test.tsx
git commit -F - <<'MSG'
feat: keep a ladder between visits, with no migration

Inside StoredSettings, the trick calibration already used: both adapters
persist settings as one blob, so an optional field costs no adapter change and
no migration, and a blob written before today keeps loading.

Written back through a fresh read rather than the copy this hook holds --
useProfile and useLowEnergy write the same blob, and starting from a stale copy
would silently drop whichever of them wrote last.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 6: An address for the page

**Files:**
- Modify: `src/ui/room/view.ts`
- Test: `src/ui/room/view.test.ts` (exists — add cases)

**Interfaces:**
- Produces: `View` gains `{ readonly kind: 'microStart'; readonly itemId: string }`; `toMicroStart(itemId: string): View`.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/room/view.test.ts` (inside the existing top-level `describe`, or as a new one at the end of the file):

```ts
describe('the micro-start page', () => {
  it('sits under the block it is about', () => {
    expect(toPath(toMicroStart('b1'))).toBe('/week/block/b1/start')
  })

  it('round-trips through the address', () => {
    expect(fromPath('/week/block/b1/start')).toEqual({ kind: 'microStart', itemId: 'b1' })
  })

  // Ids are free-form -- the planner derives one from whatever the student typed -- so an
  // unencoded slash would write a path with an extra segment in it.
  it('encodes an id with a slash in it', () => {
    const view = toMicroStart('a/b')

    expect(toPath(view)).toBe('/week/block/a%2Fb/start')
    expect(fromPath(toPath(view))).toEqual(view)
  })

  // Ruling 60: one level up is the block, not the week. Skipping it would make Back and
  // the close control mean the same thing again.
  it('goes back to the block it was opened from', () => {
    expect(back(toMicroStart('b1'))).toEqual({ kind: 'block', itemId: 'b1' })
  })

  it('is a descent from the block, so Back does not walk forward into it', () => {
    expect(isAscent(toBlock('b1'), toMicroStart('b1'))).toBe(false)
    expect(isAscent(toMicroStart('b1'), toBlock('b1'))).toBe(true)
  })

  it('does not confuse the edit form with the page', () => {
    expect(fromPath('/week/block/b1/edit')).toEqual({ kind: 'editBlock', itemId: 'b1' })
    expect(fromPath('/week/block/b1/elsewhere')).toEqual({ kind: 'room' })
  })
})
```

Add `toMicroStart` to the file's existing import from `./view`.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/ui/room/view.test.ts`
Expected: FAIL — `toMicroStart` is not exported.

- [ ] **Step 3: Write the implementation**

Three edits in `src/ui/room/view.ts`.

Add to the `View` union, after the `editBlock` member:

```ts
  /**
   * §4.1's ladder, under the block it is about.
   *
   * A page rather than a panel on the sheet, and for the same reason `rebalance` is a door:
   * the point of it is that nothing else is in view. Somebody who cannot start a task is not
   * helped by the task sitting behind a card telling them how to start it.
   */
  | { readonly kind: 'microStart'; readonly itemId: string }
```

Add the constructor beside `toEditBlock`:

```ts
export const toMicroStart = (itemId: string): View => ({ kind: 'microStart', itemId })
```

In `back`, beside the `editBlock` line:

```ts
  // Same rule as the edit form: opened from the block, so one level up is the block.
  if (view.kind === 'microStart') return toBlock(view.itemId)
```

In `toPath`'s switch:

```ts
    case 'microStart':
      return `/week/block/${encodeURIComponent(view.itemId)}/start`
```

In `fromPath`, inside the `second === 'block'` branch, beside the `edit` line:

```ts
      if (parts.length === 4 && parts[3] === 'start') return toMicroStart(decodeURIComponent(third))
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/ui/room/view.test.ts src/ui/room/useUrlView.test.tsx src/ui/RoomShell.routing.test.tsx`
Expected: PASS. `toPath`'s switch is exhaustive over `View`, so TypeScript would already have caught a missing case.

- [ ] **Step 5: Commit**

```bash
git add src/ui/room/view.ts src/ui/room/view.test.ts
git commit -F - <<'MSG'
feat: /week/block/:id/start, under the block it is about

The same shape editBlock already has, for the same reason: the page is opened
from the block, so Back is the block and not the week -- skipping that level
would make Back and the close control mean the same thing again.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 7: The button, on every block

**Files:**
- Modify: `src/ui/week/blockActions.ts`
- Modify: `src/ui/week/blockActions.test.ts`
- Modify: `src/ui/week/BlockSheet.tsx`
- Modify: `src/ui/week/BlockSheet.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `BlockAction` gains `'microStart'`; `BlockSheet` gains a required prop `onMicroStart: (itemId: string) => void`.
- `BlockSheetModel.microStart` and `BlockSheet`'s `cantStart` handling are **removed**.

- [ ] **Step 1: Write the failing tests**

Add to `src/ui/week/blockActions.test.ts`:

```ts
describe('the micro-start button', () => {
  // Unconditional, beside edit and remove. "Every block, no exceptions": what used to make
  // this safe was hiding it, and what makes it safe now is what the rest and sleep chains
  // say (see `ruleLadder`).
  it.each([
    ['an ordinary block', {}],
    ['a fixed class', { fixed: true }],
    ['protected rest', { protectedRest: true }],
  ])('is offered on %s', (_label, over) => {
    const week = weekWith(item({ id: 'b1', dayIndex: 1, ...over }))
    const model = blockSheet({ schedule: week, itemId: 'b1', today: 1 })

    expect(model?.actions).toContain('microStart')
  })

  it('is offered on a block already in the past', () => {
    const week = weekWith(item({ id: 'b1', dayIndex: 0 }))
    const model = blockSheet({ schedule: week, itemId: 'b1', today: 3 })

    expect(model?.actions).toContain('microStart')
  })

  // One micro-start path, not two that can disagree about a block's first move.
  it('no longer carries a micro-start in the model', () => {
    const week = weekWith(item({ id: 'b1', dayIndex: 0 }))
    const model = blockSheet({ schedule: week, itemId: 'b1', today: 9 })

    expect(model).not.toHaveProperty('microStart')
    expect(model?.actions).not.toContain('cantStart')
  })
})
```

Use whatever `item` / `weekWith` helpers the file already defines; do not add new ones. Then **delete** every existing case in that file asserting `cantStart` or `microStart: <a MicroStart>`.

Add to `src/ui/week/BlockSheet.test.tsx`:

```ts
it('opens the micro-start page for this block', async () => {
  const onMicroStart = vi.fn()
  renderSheet({ onMicroStart })

  await userEvent.click(screen.getByRole('button', { name: /micro.?start/i }))

  expect(onMicroStart).toHaveBeenCalledWith('b1')
})

// The inline reveal is gone. Two ways to a first move is two answers that can disagree.
it('no longer reveals a micro-start inside the sheet', () => {
  renderSheet({})

  expect(screen.queryByTestId('micro-start')).toBeNull()
  expect(screen.queryByRole('button', { name: /can't start this/i })).toBeNull()
})
```

Adapt `renderSheet` to the file's existing helper, adding `onMicroStart` to its defaults.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/ui/week/blockActions.test.ts src/ui/week/BlockSheet.test.tsx`
Expected: FAIL — `microStart` is not in `actions`, and no such button exists.

- [ ] **Step 3: Edit `blockActions.ts`**

In the `BlockAction` union, replace `'cantStart'` with `'microStart'`.

Change the `MANUAL` list and extend its comment:

```ts
const MANUAL: readonly BlockAction[] = ['microStart', 'edit', 'remove']
```

Append to `MANUAL`'s existing docstring:

```
 * `microStart` joins them for the same reason and one more. §4.1's manual trigger used to
 * be hidden on fixed blocks, on protected rest and on anything past -- which is to say it
 * was hidden on a good share of what a student is actually stuck on: the lab report for
 * Tuesday's fixed lab, the errand that was due last week. What used to make hiding it feel
 * safe was §5.1's protected recovery, and that protection now lives where it belongs, in
 * what the rest and sleep chains SAY (see `ruleLadder`), rather than in a missing button.
```

Remove `microStart` from `BlockSheetModel` (the field and its docstring), remove `'cantStart'` from `actionsFor`'s returns, and delete the now-unused `firstAction`/`isStuck`/`MicroStart` imports and the `daysWaiting` calculation.

- [ ] **Step 4: Edit `BlockSheet.tsx`**

Delete: the local `MicroStartCard` function, the `firstAction`/`MicroStart`/`Card` imports, the `revealed` state, the `microStart` const, the `cantStart` button block, and the trailing `{microStart !== null && ...}` render.

Add `onMicroStart` to the props type:

```ts
  /** Opens §4.1's ladder for this block, on a page of its own. */
  readonly onMicroStart: (itemId: string) => void
```

Add the button to `actionBar`, immediately before the `edit` block:

```tsx
      {actions.includes('microStart') && (
        <Button variant="secondary" data-testid="micro-start" onClick={() => onMicroStart(item.id)}>
          Micro start
        </Button>
      )}
```

- [ ] **Step 4b: Fix the fixture in `Sheet.test.tsx`**

`src/ui/kit/Sheet.test.tsx:251` builds a `BlockSheetModel` literal with
`actions: ['done', 'later', 'cantStart']` and `microStart: null`. Both fields just changed,
so the file will not compile. Change the actions to
`['done', 'later', 'microStart']` and delete the `microStart: null` line.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run src/ui/week src/ui/kit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/week/blockActions.ts src/ui/week/blockActions.test.ts src/ui/week/BlockSheet.tsx src/ui/week/BlockSheet.test.tsx
git commit -F - <<'MSG'
feat: a way in from every block, and only one of them

§4.1's manual trigger was hidden on fixed blocks, on protected rest and on
anything past -- which is most of what a student is actually stuck on: the lab
report for Tuesday's fixed lab, the errand that was due last week. It joins
edit and remove in the unconditional list.

What made hiding it feel safe was §5.1's protected recovery. That protection
moves to where it belongs -- what the rest and sleep chains say -- rather than
living in a missing button.

The inline reveal goes with it. Two ways to a first move is two answers that
can disagree about the same block.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 8: The page

**Files:**
- Create: `src/ui/microStart/MicroStartPage.tsx`
- Test: `src/ui/microStart/MicroStartPage.test.tsx`
- Delete: `src/ui/microStart/MicroStartCard.tsx`, `src/ui/microStart/MicroStartCard.test.tsx`

**Interfaces:**
- Consumes: `currentRung`, `isComplete`, `advance`, `Ladder` (Task 1); `buildLadder`, `replaceRung`, `LadderOutcome` (Task 4); `Sheet`, `Button`; `ScheduledItem`.
- Produces:

```ts
export function MicroStartPage(props: {
  readonly item: ScheduledItem
  /** The stored ladder for this block, or null if it has never been opened. */
  readonly ladder: Ladder | null
  readonly onLadder: (ladder: Ladder) => void
  readonly onDone: (itemId: string) => void
  readonly onBack: () => void
  readonly onClose: () => void
}): JSX.Element
```

- [ ] **Step 1: Write the failing test**

Create `src/ui/microStart/MicroStartPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ladder } from '../../domain/ladder'
import type { ScheduledItem } from '../../optimizer'
import { MicroStartPage } from './MicroStartPage'

const item: ScheduledItem = {
  id: 'b1',
  title: 'Ethics essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 3,
  intensity: 1,
  dayIndex: 0,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
}

const ladder: Ladder = {
  blockId: 'b1',
  rungs: [
    { action: 'Open the document.', minutes: 2 },
    { action: 'Write the title.', minutes: 3 },
    { action: 'Write one bad sentence.', minutes: 5 },
  ],
  done: 1,
}

const renderPage = (over: Partial<Parameters<typeof MicroStartPage>[0]> = {}) => {
  const props = {
    item,
    ladder,
    onLadder: vi.fn(),
    onDone: vi.fn(),
    onBack: vi.fn(),
    onClose: vi.fn(),
    ...over,
  }

  render(<MicroStartPage {...props} />)
  return props
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MicroStartPage', () => {
  // §4.1 as amended: the chain exists, exactly one rung is ever on screen. This is the
  // assertion the whole amendment rests on, so it asserts the absence as well as the
  // presence.
  it('shows one rung and never the others', async () => {
    renderPage()

    expect(await screen.findByText('Write the title.')).toBeInTheDocument()
    expect(screen.queryByText('Open the document.')).toBeNull()
    expect(screen.queryByText('Write one bad sentence.')).toBeNull()
  })

  it('says where in the chain the student is', async () => {
    renderPage()

    expect(await screen.findByTestId('ladder-progress')).toHaveTextContent('Step 2 of 3')
  })

  it('prints the rung’s own time box', async () => {
    renderPage()

    expect(await screen.findByTestId('rung-minutes')).toHaveTextContent('3 minutes')
  })

  it('advances to the next rung and reports it up', async () => {
    const props = renderPage()
    await screen.findByText('Write the title.')

    await userEvent.click(screen.getByRole('button', { name: /next step/i }))

    expect(props.onLadder).toHaveBeenCalledWith(expect.objectContaining({ blockId: 'b1', done: 2 }))
  })

  it('generates a chain when the block has never been opened', async () => {
    const props = renderPage({ ladder: null })

    await waitFor(() => expect(props.onLadder).toHaveBeenCalled())
    // Offline, so this is the rule chain -- which is a real answer, not a degraded one.
    expect(props.onLadder.mock.calls[0]?.[0].rungs.length).toBeGreaterThanOrEqual(3)
  })

  // A stuck person does not need an error dialog, and the rule chain is a genuine answer.
  it('never shows an error when the model cannot be reached', async () => {
    renderPage({ ladder: null })

    expect(await screen.findByTestId('rung-action')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('offers to finish the block once the chain runs out', async () => {
    const props = renderPage({ ladder: { ...ladder, done: 3 } })

    await userEvent.click(await screen.findByRole('button', { name: /mark it done/i }))

    expect(props.onDone).toHaveBeenCalledWith('b1')
  })

  // Leaving is not failing, and the copy must not suggest it is.
  it('leaves without losing where the student got to', async () => {
    const props = renderPage()
    await screen.findByText('Write the title.')

    await userEvent.click(screen.getByRole('button', { name: /stop here/i }))

    expect(props.onBack).toHaveBeenCalled()
    expect(props.onLadder).not.toHaveBeenCalled()
  })

  // Offline the re-roll has nothing new to offer, so it is not shown at all rather than
  // being shown and doing nothing.
  it('does not offer a re-roll it cannot honour', async () => {
    renderPage()
    await screen.findByText('Write the title.')

    expect(screen.queryByRole('button', { name: /doesn.t fit/i })).toBeNull()
  })

  it('offers a re-roll when the chain came from the model', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        steps: [
          { action: 'Open the ethics essay.', minutes: 2 },
          { action: 'Write its title.', minutes: 3 },
          { action: 'Write one bad sentence.', minutes: 5 },
        ],
      }),
    } as unknown as Response)

    renderPage({ ladder: null })

    expect(await screen.findByRole('button', { name: /doesn.t fit/i })).toBeInTheDocument()
  })

  it('names the block it is about', async () => {
    renderPage()

    expect(await screen.findByText('Ethics essay')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/ui/microStart/MicroStartPage.test.tsx`
Expected: FAIL — `Failed to resolve import "./MicroStartPage"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/microStart/MicroStartPage.tsx`:

```tsx
import { useEffect, useState, type JSX } from 'react'
import { buildLadder, replaceRung } from '../../ai'
import { advance, currentRung, isComplete, type Ladder } from '../../domain/ladder'
import type { ScheduledItem } from '../../optimizer'
import { Button } from '../kit/Button'
import { Sheet } from '../kit/Sheet'

/**
 * §4.1's micro-start, as a page.
 *
 * The chain exists in full and exactly one rung is ever on screen. That is the whole of the
 * amendment to §4.1 recorded in this feature's design: the prohibition on a list was
 * against *choosing*, and a chain that reveals its next rung only when the current one is
 * ticked never asks anybody to choose. A wall of unticked boxes would also read as proof of
 * how much is left, which is the last thing somebody stuck needs to be shown.
 *
 * A page rather than a card in the block sheet, for the same reason `rebalance` is a door:
 * nothing else is in view. Somebody who cannot start a task is not helped by the task
 * sitting behind a panel explaining how to start it.
 */
export function MicroStartPage({
  item,
  ladder,
  onLadder,
  onDone,
  onBack,
  onClose,
}: {
  readonly item: ScheduledItem
  /** The stored chain for this block, or null when it has never been opened. */
  readonly ladder: Ladder | null
  readonly onLadder: (ladder: Ladder) => void
  readonly onDone: (itemId: string) => void
  readonly onBack: () => void
  readonly onClose: () => void
}): JSX.Element {
  const [built, setBuilt] = useState<Ladder | null>(ladder)
  /**
   * Whether the chain on screen came from the model.
   *
   * Only used to decide whether the re-roll is offered. Without a model there is nothing
   * new to say -- `replaceRung` would hand back the same rung -- and a button that visibly
   * does nothing is worse than one that is not there.
   */
  const [fromModel, setFromModel] = useState(false)
  const [rerolling, setRerolling] = useState(false)

  useEffect(() => {
    // A stored chain is resumed rather than regenerated. Coming back to different words for
    // the step you had already decided to do is a small betrayal of somebody who came back.
    if (ladder !== null) return

    let cancelled = false

    void buildLadder(item).then((outcome) => {
      if (cancelled) return

      setBuilt(outcome.ladder)
      setFromModel(outcome.source === 'model')
      onLadder(outcome.ladder)
    })

    return () => {
      cancelled = true
    }
    // `onLadder` is deliberately absent: it is recreated on every render of the shell, and
    // depending on it would regenerate the chain in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, ladder])

  const commit = (next: Ladder) => {
    setBuilt(next)
    onLadder(next)
  }

  const rung = built === null ? null : currentRung(built)
  const finished = built !== null && isComplete(built)

  const actions = (
    <>
      {rung !== null && <Button onClick={() => commit(advance(built!))}>Done — next step</Button>}

      {finished && (
        <Button data-testid="finish-block" onClick={() => onDone(item.id)}>
          Mark it done
        </Button>
      )}

      {rung !== null && fromModel && (
        <Button
          variant="secondary"
          disabled={rerolling}
          onClick={() => {
            setRerolling(true)
            void replaceRung(item, built!)
              .then(commit)
              .finally(() => setRerolling(false))
          }}
        >
          That one doesn&apos;t fit
        </Button>
      )}

      {/* Leaving is not failing, and nothing here says otherwise. Progress is already
          stored, so this is a way out rather than a way to lose what was done. */}
      <Button variant="quiet" onClick={onBack}>
        Stop here. That&apos;s enough.
      </Button>
    </>
  )

  return (
    <Sheet title={item.title} onClose={onClose} onBack={onBack} actions={actions}>
      {built === null && <p data-testid="ladder-working">Working out where to start.</p>}

      {rung !== null && built !== null && (
        <>
          <p data-testid="ladder-progress" className="text-sm text-ink-soft">
            Step {built.done + 1} of {built.rungs.length}
          </p>
          <p data-testid="rung-action" className="mt-2 text-lg">
            {rung.action}
          </p>
          <p data-testid="rung-minutes" className="mt-2 text-sm text-ink-soft">
            {rung.minutes} minutes. That is the whole ask.
          </p>
        </>
      )}

      {finished && (
        <p data-testid="ladder-finished">
          That is all of it. Whether or not the block is finished, you started — which was the
          part that was not happening.
        </p>
      )}
    </Sheet>
  )
}
```

If `built!` non-null assertions trip the project's lint or `strict` settings, hoist a local `const open = built` above `actions` and guard on it instead; do not weaken any compiler flag.

- [ ] **Step 4: Leave `MicroStartCard` alone**

Do **not** delete `src/ui/microStart/MicroStartCard.tsx`. It is not an orphan: `LiveCards`
renders it as §3's "stuck" card, which is the automatic trigger's own surface in the room.
The only copy removed was `BlockSheet`'s local one, in Task 7. The shell retargets this
card's call to action at the new page in Task 9.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run src/ui/microStart`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add src/ui/microStart/MicroStartPage.tsx src/ui/microStart/MicroStartPage.test.tsx
git commit -F - <<'MSG'
feat: the micro-start page, one rung at a time

The chain exists in full and exactly one rung is ever on screen -- asserted by
the absence of the others, not only the presence of one. That is the whole of
the §4.1 amendment: the prohibition was against choosing, and a chain that
reveals its next rung only when the current one is ticked never asks anyone to.

A stored chain is resumed rather than regenerated. Coming back to different
words for the step you had already decided to do is a small betrayal of the
person who came back.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 9: Wiring, and the §4.1 amendment

**Files:**
- Modify: `src/ui/room/RoomShell.tsx`
- Modify: `src/ui/RoomShell.microStart.test.tsx`
- Modify: `burnout-app-spec-v3.md`

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Rewrite `src/ui/RoomShell.microStart.test.tsx` against the page. Keep the file's existing render harness and repository stub; replace its body with:

```tsx
describe('the micro-start page', () => {
  // These drive the real route rather than rendering the component with props: the
  // question is whether a student can reach it, which a component test cannot answer.
  it('is reachable from a block', async () => {
    await renderShell()
    await openFirstBlock()

    await userEvent.click(screen.getByTestId('micro-start'))

    expect(await screen.findByTestId('rung-action')).toBeInTheDocument()
    expect(window.location.pathname).toMatch(/\/start$/)
  })

  it('is reachable from a protected rest block', async () => {
    await renderShell()
    await openBlock((item) => item.protectedRest)

    expect(screen.getByTestId('micro-start')).toBeInTheDocument()
  })

  it('opens straight onto the page from a typed address', async () => {
    window.history.replaceState(null, '', `/week/block/${encodeURIComponent(firstItemId)}/start`)
    await renderShell()

    expect(await screen.findByTestId('rung-action')).toBeInTheDocument()
  })

  // A block that has been removed since the address was written. `fromPath` is total and
  // the shell must be too: the room, not a blank screen.
  it('falls back to the room for a block that is gone', async () => {
    window.history.replaceState(null, '', '/week/block/no-such-block/start')
    await renderShell()

    await waitFor(() => expect(screen.queryByTestId('rung-action')).toBeNull())
  })

  it('goes back to the block it was opened from', async () => {
    await renderShell()
    await openFirstBlock()
    await userEvent.click(screen.getByTestId('micro-start'))
    await screen.findByTestId('rung-action')

    await userEvent.click(screen.getByRole('button', { name: /back/i }))

    expect(await screen.findByTestId('block-when')).toBeInTheDocument()
  })

  it('resumes where the student left off after a remount', async () => {
    const repo = freshRepo()

    const first = await renderShell({ repo })
    await openFirstBlock()
    await userEvent.click(screen.getByTestId('micro-start'))
    await screen.findByTestId('rung-action')
    await userEvent.click(screen.getByRole('button', { name: /next step/i }))
    await waitFor(() => expect(screen.getByTestId('ladder-progress')).toHaveTextContent('Step 2'))
    first.unmount()

    window.history.replaceState(null, '', `/week/block/${encodeURIComponent(firstItemId)}/start`)
    await renderShell({ repo })

    expect(await screen.findByTestId('ladder-progress')).toHaveTextContent('Step 2')
  })

  it('drops the ladder when the block is finished from the page', async () => {
    const repo = freshRepo()
    await renderShell({ repo })
    await openFirstBlock()
    await userEvent.click(screen.getByTestId('micro-start'))
    await screen.findByTestId('rung-action')

    await userEvent.click(screen.getByRole('button', { name: /stop here/i }))
    await waitFor(async () => expect((await repo.loadSettings()).ladders).toHaveLength(1))

    await userEvent.click(screen.getByTestId('remove-block'))
    await userEvent.click(screen.getByTestId('confirm-remove-yes'))

    await waitFor(async () => expect((await repo.loadSettings()).ladders).toHaveLength(0))
  })
})
```

Write `openBlock`, `openFirstBlock`, `firstItemId` and `freshRepo` against whatever the file's existing harness already provides; reuse rather than duplicating. `fetch` is unstubbed in this suite, so every generation lands on the rule chain — which is exactly the configuration CI runs in.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/ui/RoomShell.microStart.test.tsx`
Expected: FAIL — no `micro-start` button routes anywhere, and the address renders the room.

- [ ] **Step 3: Wire the shell**

In `src/ui/room/RoomShell.tsx`:

Add the imports:

```ts
import { MicroStartPage } from '../microStart/MicroStartPage'
import { useLadders } from '../useLadders'
```

and add `toMicroStart` to the existing `./view` import.

Beside the other hooks, after `useProfile`:

```ts
const { ladders, saveLadder, dropLadder } = useLadders(repository)
```

Beside `blockModel`:

```ts
  /**
   * The block the micro-start page is about, or null.
   *
   * Null for an id that no longer exists -- a block completed or removed since the address
   * was written -- which resolves to the room below, the same total behaviour `fromPath`
   * already has. A blank screen is the alternative.
   */
  const startTarget =
    view.kind === 'microStart' ? (week.items.find((item) => item.id === view.itemId) ?? null) : null
```

In `sheets`, after the `editBlock` block:

```tsx
      {view.kind === 'microStart' && startTarget !== null && (
        <MicroStartPage
          key={`start-${view.itemId}`}
          item={startTarget}
          ladder={ladders.find((entry) => entry.blockId === view.itemId) ?? null}
          onLadder={saveLadder}
          onDone={(itemId) => {
            setSchedule(completeItem(week, itemId))
            dropLadder(itemId)
            closeToRoom()
          }}
          onBack={goBack}
          onClose={closeToRoom}
        />
      )}
```

Add `onMicroStart` to the existing `BlockSheet` render:

```tsx
          onMicroStart={(itemId) => setView(toMicroStart(itemId))}
```

Retarget §3's stuck card at the page. `LiveCards` renders `MicroStartCard` for the automatic
trigger, and its `onStuckStart` currently opens the block sheet — which is now one hop short
of the thing it is offering. Change line 496's handler:

```tsx
          onStuckStart={() => stuckItem !== undefined && setView(toMicroStart(stuckItem.id))}
```

`LiveCards.tsx` and `MicroStartCard.tsx` themselves are unchanged: the room still offers the
first rung unasked, and pressing "I'll do that" now lands on the chain that continues it.

Drop the ladder wherever a block stops existing — in `BlockSheet`'s `onDone` and `onRemove` handlers, add `dropLadder(itemId)` beside the existing `setSchedule` call. A stored chain must not outlive the block it describes.

Correct a stale address, beside the existing `proposalIsStale` and `editTargetIsGone` effects:

```ts
  const startTargetIsGone = schedule !== null && view.kind === 'microStart' && startTarget === null
```

and include it wherever those two already drive the correcting `setView(ROOM)` — follow the existing pattern in the file exactly rather than adding a new effect.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/ui/RoomShell.microStart.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Amend §4.1 in the spec**

In `burnout-app-spec-v3.md` §4.1, replace the **Behaviour** paragraph with:

```markdown
**Behaviour.** Task title plus context to the model, returning an ordered **chain** of concrete first actions, each time-boxed under ten minutes. **Exactly one is shown at a time**: ticking the current step reveals the next, and the rest are never on screen. Never a visible list, for the same reason as §5.2 — a stuck person cannot choose from a menu, and a wall of unticked boxes reads as proof of how much is left. Revealing one step at a time asks for no choice at all, which is what that reasoning actually protects. Amended 2026-09-11; see `docs/superpowers/specs/2026-09-11-micro-start-ladder-design.md`.
```

Also update §4.1's **Triggers** to say the manual trigger is on **every** block, with no exception for fixed blocks, protected rest or blocks in the past.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS, no fewer test files than the 167 the baseline had (two deleted, four added).

- [ ] **Step 7: Typecheck and coverage**

Run: `npm run typecheck`
Expected: no output, exit 0.

Run: `npm run test:coverage`
Expected: PASS, every threshold met. If a threshold now *exceeds* its configured value, raise the configured value to just under what the suite reaches — never lower one.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -F - <<'MSG'
feat: route the block sheet to the page, and amend §4.1 to match

The shell holds the ladders and drops one whenever its block stops existing --
completed, removed, finished from the page -- so a stored chain cannot outlive
the thing it describes. A stale address resolves to the room, the same total
behaviour fromPath already has.

§4.1 is amended in the specification itself rather than only in the design
document. A spec the code has quietly outgrown is worse than no spec.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 10: Seeing it work

**Files:**
- Modify: `tests/` — whichever Playwright spec covers the block sheet (check `playwright.config.ts` for the directory).

- [ ] **Step 1: Write the failing E2E test**

Add to the existing block-sheet spec, matching its style:

```ts
test('a stuck student is carried one step at a time', async ({ page }) => {
  await page.goto('/week')
  await page.getByTestId('block-chip').first().click()
  await page.getByTestId('micro-start').click()

  const action = page.getByTestId('rung-action')
  await expect(action).toBeVisible()
  await expect(page.getByTestId('ladder-progress')).toHaveText(/Step 1 of \d/)

  const first = await action.textContent()
  await page.getByRole('button', { name: /next step/i }).click()

  await expect(page.getByTestId('ladder-progress')).toHaveText(/Step 2 of \d/)
  await expect(action).not.toHaveText(first ?? '')

  // The whole claim of the amendment: the rest of the chain is not on the page.
  await expect(page.getByText(first ?? '')).toHaveCount(0)
})

test('the page resumes where it was left', async ({ page }) => {
  await page.goto('/week')
  await page.getByTestId('block-chip').first().click()
  await page.getByTestId('micro-start').click()
  await page.getByRole('button', { name: /next step/i }).click()
  await expect(page.getByTestId('ladder-progress')).toHaveText(/Step 2 of \d/)

  await page.reload()

  await expect(page.getByTestId('ladder-progress')).toHaveText(/Step 2 of \d/)
})
```

Replace `block-chip` with whatever testid the existing week spec actually uses.

- [ ] **Step 2: Run it**

Run: `npm run test:e2e`
Expected: PASS. If Playwright browsers are not installed, run `npx playwright install` first.

- [ ] **Step 3: Check every width**

Run `npm run dev`, open `/week`, open a block, press **Micro start**, and check 320, 390, 768 and 1280px. The rung must be readable and the action bar reachable at every width, with no horizontal scroll.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -F - <<'MSG'
test: walk the ladder in a real browser

Asserts the absence of the previous rung as well as the presence of the next.
The amendment's whole claim is that only one is on screen, and a test that
checked only what is shown would pass on a page that also showed the other
five.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Task 11: Finishing

- [ ] **Step 1: Security**

Invoke the `security-check` skill. Run its static layer and its deep audit — this change adds a surface that reads a credential. The specific things to confirm: `GROQ_API_KEY` appears nowhere under `dist/`, no `VITE_`-prefixed variant exists, `src/ai/ladderWriter.ts` is imported only by `api/micro-start.ts`, and every field the endpoint reads is bounded before it reaches a prompt.

- [ ] **Step 2: Dynamic scan**

Invoke the `hawkscan:hawkscan` skill and fix anything it reports, then rescan.

- [ ] **Step 3: Review the diff**

Invoke the `code-review` skill against `git diff main...HEAD`. Confirm the diff updates tests for every behaviour it changes.

- [ ] **Step 4: Verify before claiming anything**

Invoke `verification-before-completion`. Run `npm test`, `npm run typecheck`, `npm run test:coverage` and `npm run build`, and paste the real output. No success claim without it.

- [ ] **Step 5: Completion report**

Invoke the `completion-report` skill. The report must name what was **not** built: §4.1's Learning half, and the absence of a timer.

- [ ] **Step 6: Notion**

Check the `notion-system-map` skill. Its own `NOTION_ENABLE=true` gate decides whether it does anything.

**Do not push.** `.claude/CLAUDE.md` forbids it without explicit confirmation.

---

## Self-Review

**Spec coverage:**

| Design requirement | Task |
|---|---|
| `Rung`, `Ladder`, `currentRung`, `advance`, `isComplete`, `replaceCurrent` | 1 |
| `ruleLadder`, rest/sleep lower the bar rather than setting a task | 1 |
| `firstAction` subsumed and removed | 7 (its last caller), 1 (its replacement) |
| `api/micro-start.ts`, edge, 503 with no key, boundary validation | 3 |
| `ladderSchema` all-or-nothing | 2 |
| `src/ai/ladder.ts` client + fallback, exported from `index.ts`, `groq` still absent | 4 |
| `StoredSettings.ladders`, no migration, legacy blob keeps loading | 5 |
| `/week/block/:id/start`, `back()` to the block | 6 |
| `microStart` in the unconditional `MANUAL` list — every block | 7 |
| Inline reveal and local `MicroStartCard` deleted | 7 |
| Orphaned `MicroStartCard.tsx` removed | 8 |
| Page: one rung, progress, re-roll, stop here, finish | 8 |
| Silent fallback, no error dialog | 4, 8 |
| Ladder dropped when its block is completed or removed | 9 |
| Stale `itemId` resolves to the room | 9 |
| §4.1 amended in `burnout-app-spec-v3.md` | 9 |
| Reload resumes at the right rung | 9, 10 |
| Responsive at 320/390/768/1280 | 10 |
| `security-check` static + deep audit | 11 |
| §4.1 Learning half not built, said out loud | 11 |

**Placeholder scan:** none. Every code step carries the actual code; every test step carries the actual assertions.

**Type consistency:** `Rung`/`Ladder` defined once in Task 1 and imported everywhere after. `parseLadderReply` returns `Rung[] | null` in Task 2 and is consumed as such in Tasks 3 and 4. `buildLadder` returns `LadderOutcome` in Task 4 and is destructured as `{ ladder, source }` in Task 8. `BlockAction` gains `'microStart'` in Task 7 and is the string the page's testid and the shell's handler both use. `useLadders` returns `{ ladders, saveLadder, dropLadder }` in Task 5, destructured identically in Task 9.

**Consumers checked, not assumed.** A grep taken while planning found three callers the
first draft of this plan had wrong, and each is now handled by name rather than left to a
typecheck to discover:

| Caller | What it uses | Handled in |
|---|---|---|
| `src/telegram/handle.ts:432` | `firstAction`, for `/start <task>` | Task 1, Step 4b — kept, rebuilt on `ruleLadder` |
| `src/ui/room/LiveCards.tsx:78` | `MicroStartCard`, as §3's stuck card | Task 8 Step 4 — kept; Task 9 Step 3 retargets its handler |
| `src/ui/kit/Sheet.test.tsx:251` | a `BlockSheetModel` fixture | Task 7, Step 4b |

**One risk recorded:** the room's stuck card and the page can now be entered from two
directions for the same block, and the card shows `firstAction` — rung one — while the page
may have generated a *model* chain whose first rung reads differently. A student who sees
"open the document" in the room and lands on "open your notes from Tuesday" has been handed
a small inconsistency. Accepted rather than solved: the alternative is generating a model
chain for every stuck block in the room on load, which is a network call per card on the
one screen that must open instantly. Recorded here so it is a decision rather than a bug.
