# Rebalance Approval and Manual Event Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebalance proposes its changes and waits for approval before touching the week; and every block in the week can be added, edited or removed by hand.

**Architecture:** Two independent slices over the same week screen. Slice A holds the solver's result in `RoomShell` state instead of writing it, and opens a new preview sheet at `/week/rebalance` whose Approve adopts it. Slice B adds three pure domain operations (`editItem`, `removeItem`, `addBlock`) plus a plain-words clash reporter, and one shared add/edit form reachable at `/week/block/<id>/edit` and `/week/new/<day>`. All state changes go through the existing `setSchedule`, which already persists.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + @testing-library/react, Tailwind 4.

**Spec:** `C:\Users\den51\.claude\plans\humble-conjuring-sky.md` (the approved plain-language plan).

## Global Constraints

- **Immutability.** Never mutate a `Schedule` or `ScheduledItem`. Every domain function returns a new object built with spreads. (Project rule: `~/.claude/rules/common/coding-style.md`.)
- **Purity of `src/engine` and `src/optimizer`.** They must not learn about storage, the clock, or the DOM. `src/domain` may depend on `src/optimizer`, never the reverse.
- **Tests ship with behaviour.** Every behaviour change in this plan updates its test file in the same commit. Never weaken an assertion to get green.
- **Vitest globals are OFF.** Every test file explicitly imports `{ describe, expect, it, vi }` from `'vitest'`.
- **Test naming.** `describe` names the thing in plain prose; `it` is a full behavioural sentence in product language, lowercase, no "should".
- **Test fixtures.** UI test files declare local `item()` / `week()` builders at the top with a `Partial<T>` override parameter spread last — copy the ones in `src/ui/week/WeekScreen.test.tsx:18-45`.
- **Queries.** `data-testid` for app-internal structure, roles (`getByRole('dialog', …)`, `getByRole('button', { name: … })`) for anything that is an accessibility promise.
- **Copy register.** Never "optimised", never reassurance to someone underwater. Specific, plain, second person.
- **Every control clears 44px** — use the `Button` and `Field` kit, never hand-rolled markup.
- **Baseline to protect:** 149 test files / 1747 tests passing. Nothing may regress.
- **Commands:** `npx vitest run <path>` for one file, `npm test` for all, `npm run typecheck` for types.

---

## File Structure

**Slice A — rebalance approval**

| File | Responsibility |
|---|---|
| `src/optimizer/report.ts` (modify) | Gains `describeProposal`; its move-counting sentence is factored into one shared clause builder used by both tenses. |
| `src/domain/rebalanceOutcome.ts` (modify) | `RebalanceOutcome` widens to carry `proposal`, `moves` and `before`. |
| `src/ui/room/view.ts` (modify) | A `rebalance` view at `/week/rebalance`. |
| `src/ui/week/RebalancePreview.tsx` (create) | The preview sheet. Dumb: takes an outcome and three handlers. |
| `src/ui/room/RoomShell.tsx` (modify) | Holds the proposal, decides whether a preview is worth opening, applies on approve. |

**Slice B — manual editing**

| File | Responsibility |
|---|---|
| `src/optimizer/constraints.ts` (modify) | Exports its `overlaps` predicate so there is one definition of overlap. |
| `src/domain/commitments.ts` (modify) | `dropCommitmentFor` — a provisional yes cannot outlive its block. |
| `src/domain/scheduleEdits.ts` (modify) | `editItem`, `removeItem`, `addBlock` and the `ItemFields` shape they share. |
| `src/domain/editWarnings.ts` (create) | Turns a proposed block into plain-words clashes. Pure, no React. |
| `src/ui/kit/labels.ts` (create) | The student-facing names for load types and block kinds, shared by the planner and the form. |
| `src/ui/week/eventDraft.ts` (create) | The form's pure model: blank draft, draft from item, validation, draft → fields, draft → candidate block. |
| `src/ui/week/EventForm.tsx` (create) | The add/edit sheet. Holds only `draft` state; everything else is computed. |
| `src/ui/week/blockActions.ts` (modify) | `edit` and `remove` join the action union. |
| `src/ui/week/BlockSheet.tsx` (modify) | Renders Edit, Remove, and Remove's confirmation. |
| `src/ui/week/WeekScreen.tsx` (modify) | An add button under an open day. |
| `src/ui/room/view.ts` (modify) | `editBlock` and `newBlock` views. |
| `src/ui/room/RoomShell.tsx` (modify) | Wires save / remove / add through `setSchedule`. |

**Deviation from the approved plain-language plan, to state in the completion report:** Remove and its confirmation live only in `BlockSheet`, not also in `EventForm`. The approved plan's behaviour section only ever describes Remove on the block sheet; a second Remove inside the edit form would be the same action in two places with two confirmations to keep in step.

---

### Task 1: The proposal sentence, in the conditional

**Files:**
- Modify: `src/optimizer/report.ts`
- Modify: `src/optimizer/index.ts`
- Test: `src/optimizer/report.test.ts`

**Interfaces:**
- Consumes: `RebalanceResult`, `MoveKind` from `./types`; `summarise`, `EngineParams` from `../engine`.
- Produces: `describeProposal(result: RebalanceResult, params: EngineParams): string`. `describeRebalance` keeps its exact current output.

**Why:** Showing "I moved 20 things" before anything has moved is a lie. The counts and the gain sentence are identical between the two tenses, so they get built once.

- [ ] **Step 1: Write the failing tests**

Append to `src/optimizer/report.test.ts` (reuse whatever `result`-building helper the file already has; if it builds results inline, follow that style):

```ts
describe('describeProposal', () => {
  it('says what it would do, not what it did', () => {
    const result = resultWith([
      move('shiftDay', 'essay'),
      move('shiftDay', 'reading'),
      move('batchErrands', 'post'),
      move('insertRest', 'rest-1'),
      move('insertSocial', 'coffee'),
      move('reorderWithinDay', 'lab'),
    ])

    const sentence = describeProposal(result, HEALTHY_PARAMS)

    expect(sentence).toContain(
      "I'd move 2 things, batch 1 errand, add 1 rest block, make time to see someone on 1 day and reorder 1 block within its day.",
    )
    expect(sentence).not.toContain('I moved')
  })

  it('falls back to the same nothing-to-move sentence the past tense uses', () => {
    const result = resultWith([])

    expect(describeProposal(result, HEALTHY_PARAMS)).toBe(
      describeRebalance(result, HEALTHY_PARAMS),
    )
  })
})

describe('describeRebalance, unchanged by the new tense', () => {
  it('still reads in the past tense', () => {
    const result = resultWith([move('shiftDay', 'essay'), move('batchErrands', 'post')])

    expect(describeRebalance(result, HEALTHY_PARAMS)).toContain(
      'I moved 1 thing and batched 1 errand.',
    )
  })
})
```

Add these local helpers at the top of the new describes if the file has no equivalent:

```ts
const move = (kind: MoveKind, itemId: string): Move => ({
  kind,
  itemId,
  description: `${kind} ${itemId}`,
  apply: (schedule) => schedule,
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/optimizer/report.test.ts`
Expected: FAIL — `describeProposal is not a function` / not exported.

- [ ] **Step 3: Refactor `report.ts` and add the new function**

Replace the body of `describeRebalance` in `src/optimizer/report.ts` with a shared clause builder. Keep `joinParts`, `plural`, `round` and `describeGain` exactly as they are.

```ts
/**
 * One phrase per move kind, in both the tense that reports and the tense that proposes.
 *
 * Two lists would be two chances for the preview and the report to disagree about what
 * the same solve did -- and the preview's whole job is to be the thing the report will
 * later confirm. The order is the order the sentence reads in, and is deliberately the
 * order the past-tense sentence has always used.
 */
const PHRASES: readonly {
  readonly kind: MoveKind
  readonly did: string
  readonly would: string
  readonly object: (count: number) => string
}[] = [
  { kind: 'shiftDay', did: 'moved', would: 'move', object: (n) => plural(n, 'thing') },
  { kind: 'batchErrands', did: 'batched', would: 'batch', object: (n) => plural(n, 'errand') },
  { kind: 'insertRest', did: 'added', would: 'add', object: (n) => plural(n, 'rest block') },
  {
    kind: 'insertSocial',
    did: 'made',
    would: 'make',
    object: (n) => `time to see someone on ${plural(n, 'day')}`,
  },
  {
    kind: 'reorderWithinDay',
    did: 'reordered',
    would: 'reorder',
    object: (n) => `${plural(n, 'block')} within its day`,
  },
]

/** The "moved 20 things, batched 3 errands and …" half, in whichever tense was asked for. */
function movesClause(result: RebalanceResult, tense: 'did' | 'would'): string {
  const counts = new Map<MoveKind, number>()
  for (const move of result.moves) {
    counts.set(move.kind, (counts.get(move.kind) ?? 0) + 1)
  }

  const parts = PHRASES.flatMap((phrase) => {
    const count = counts.get(phrase.kind) ?? 0
    return count === 0 ? [] : [`${phrase[tense]} ${phrase.object(count)}`]
  })

  return joinParts(parts)
}

/**
 * What to say when the search found nothing.
 *
 * Shared by both tenses because it is not in either: there is no move to report and none
 * to propose, so the sentence is about the week rather than about the solver.
 */
function nothingToMove(result: RebalanceResult, params: EngineParams): string {
  const deficitDays = summarise(
    result.schedule.start,
    toDayInputs(result.schedule, ALL_PRESENT),
    params,
  ).deficitDays

  return deficitDays > 0
    ? 'There is nothing left to move. This fortnight is beyond what rearranging can fix — something needs to come out of it.'
    : 'Nothing worth moving. This is already the best arrangement of these commitments.'
}

export function describeRebalance(result: RebalanceResult, params: EngineParams): string {
  if (result.moves.length === 0) return nothingToMove(result, params)

  return `I ${movesClause(result, 'did')}. ${describeGain(result, params)}`
}

/**
 * The same finding, before it has happened.
 *
 * §2.1's rule that the app never says "optimised" cuts both ways: a preview that borrowed
 * the past-tense sentence would be claiming a change the student has not agreed to yet.
 * The counts and the gain are identical -- only the verb moves.
 */
export function describeProposal(result: RebalanceResult, params: EngineParams): string {
  if (result.moves.length === 0) return nothingToMove(result, params)

  return `I'd ${movesClause(result, 'would')}. ${describeGain(result, params)}`
}
```

Add the `Move` type to the existing type import if the test needs it exported; `Move` is already exported from `./types` via `index.ts`.

Export from `src/optimizer/index.ts`:

```ts
export { describeProposal, describeRebalance, undo } from './report'
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/optimizer/report.test.ts`
Expected: PASS, including every pre-existing `describeRebalance` test.

- [ ] **Step 5: Commit**

```bash
git add src/optimizer/report.ts src/optimizer/report.test.ts src/optimizer/index.ts
git commit -m "feat: say what a rebalance would do, not what it did"
```

---

### Task 2: The outcome carries what it proposes

**Files:**
- Modify: `src/domain/rebalanceOutcome.ts`
- Test: `src/domain/rebalanceOutcome.test.ts`

**Interfaces:**
- Consumes: `describeProposal` from Task 1.
- Produces: `RebalanceOutcome` with `{ schedule, before, moves, report, proposal, fallback }`. `runRebalance(schedule, params, seed)` keeps its signature.

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/rebalanceOutcome.test.ts`:

```ts
describe('what an outcome carries for the preview', () => {
  it('hands back every move so the student can read them one by one', () => {
    const outcome = runRebalance(crowdedWeek(), HEALTHY, 1)

    expect(outcome.moves.length).toBeGreaterThan(0)
    for (const move of outcome.moves) {
      expect(move.description).not.toBe('')
    }
  })

  it('carries the week the search started from, untouched', () => {
    const before = crowdedWeek()
    const outcome = runRebalance(before, HEALTHY, 1)

    expect(outcome.before).toEqual(before)
  })

  it('describes the same solve in both tenses', () => {
    const outcome = runRebalance(crowdedWeek(), HEALTHY, 1)

    expect(outcome.report).toContain('I ')
    expect(outcome.proposal).toContain("I'd ")
  })

  it('proposes nothing when there is nothing to move', () => {
    const outcome = runRebalance(emptyWeek(), HEALTHY, 1)

    expect(outcome.moves).toEqual([])
    expect(outcome.proposal).toBe(outcome.report)
  })
})
```

Use whatever schedule builders the file already has; if it has none, import `makeSchedule`, `studyItem` and `HEALTHY` from `../optimizer/testSupport` and define `crowdedWeek()` / `emptyWeek()` locally.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/domain/rebalanceOutcome.test.ts`
Expected: FAIL — `moves`, `before` and `proposal` do not exist on the outcome.

- [ ] **Step 3: Widen the outcome**

In `src/domain/rebalanceOutcome.ts`, add `describeProposal` and `Move` to the import from `'../optimizer'`, then:

```ts
export interface RebalanceOutcome {
  /** The week to adopt IF the student approves. Unchanged from the input when the solver
   *  found nothing. Nothing writes this until they say so -- see `RoomShell`. */
  readonly schedule: Schedule
  /** The week the search started from, so the preview can be discarded exactly rather
   *  than reconstructed. */
  readonly before: Schedule
  /** Every individual move, in its own words. §2.1 is explicit that a reshuffle a student
   *  cannot see is one they will not act on -- and a change they are being asked to
   *  approve has to be legible one move at a time, not only as a count. */
  readonly moves: readonly Move[]
  /** Past tense, for after it has been applied. */
  readonly report: string
  /** The same finding in the conditional, for the preview shown before it is. */
  readonly proposal: string
  /** The single best remaining move, when the solver could not improve the fortnight but
   *  the fortnight still needs help. Null otherwise. */
  readonly fallback: Fix | null
}

export function runRebalance(
  schedule: Schedule,
  params: EngineParams,
  seed: number,
): RebalanceOutcome {
  const result = rebalance(schedule, params, makeRng(seed))

  const fallback =
    result.moves.length === 0 ? (smallestFixes(schedule, params, 1)[0] ?? null) : null

  return {
    schedule: result.schedule,
    before: result.before,
    moves: result.moves,
    report: describeRebalance(result, params),
    proposal: describeProposal(result, params),
    fallback,
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/domain/rebalanceOutcome.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/rebalanceOutcome.ts src/domain/rebalanceOutcome.test.ts
git commit -m "feat: carry the moves and the starting week on a rebalance outcome"
```

---

### Task 3: Three new addresses

**Files:**
- Modify: `src/ui/room/view.ts`
- Test: `src/ui/room/view.test.ts`, `src/ui/room/viewPath.test.ts`

**Interfaces:**
- Produces: `toRebalance(): View`, `toEditBlock(itemId: string): View`, `toNewBlock(dayIndex: number): View`; view kinds `'rebalance'`, `'editBlock'` (carries `itemId`), `'newBlock'` (carries `dayIndex`).
- Consumes: `HORIZON_DAYS` from `../../engine`.

**Note:** `view.test.ts` currently asserts *"never carries an item id except when on a block"*. `editBlock` also carries one, so that test is rewritten — deliberately, as part of this change, not deleted.

- [ ] **Step 1: Write the failing tests**

In `src/ui/room/viewPath.test.ts`, add rows to the existing `TABLE`:

```ts
  { path: '/week/rebalance', view: toRebalance() },
  { path: '/week/block/essay/edit', view: toEditBlock('essay') },
  { path: '/week/new/3', view: toNewBlock(3) },
```

and add:

```ts
describe('addresses that name nothing real', () => {
  it('reads a day outside the fortnight as the room', () => {
    expect(fromPath('/week/new/99')).toEqual(ROOM)
  })

  it('reads a day that is not a number as the room', () => {
    expect(fromPath('/week/new/tuesday')).toEqual(ROOM)
  })

  it('reads an unknown fourth segment under a block as the room', () => {
    expect(fromPath('/week/block/essay/delete')).toEqual(ROOM)
  })
})
```

In `src/ui/room/view.test.ts`, replace the "never carries an item id except when on a block" test and add the new `back()` cases:

```ts
it('carries an item id only where an item is what it is about', () => {
  const withIds: View[] = [toBlock('essay'), toEditBlock('essay')]
  const withoutIds: View[] = [ROOM, toWeek(), toRebalance(), toNewBlock(0), toAdd(), toSettings(), toReserves()]

  for (const view of withIds) expect('itemId' in view).toBe(true)
  for (const view of withoutIds) expect('itemId' in view).toBe(false)
})

describe('one level up from the new doors', () => {
  it('takes a proposal back to the week it is about', () => {
    expect(back(toRebalance())).toEqual(toWeek())
  })

  it('takes an edit form back to the block it was opened from', () => {
    expect(back(toEditBlock('essay'))).toEqual(toBlock('essay'))
  })

  it('takes a new block back to the week it is being added to', () => {
    expect(back(toNewBlock(4))).toEqual(toWeek())
  })
})

describe('ascending out of the new doors', () => {
  it('counts closing a proposal as an ascent', () => {
    expect(isAscent(toRebalance(), toWeek())).toBe(true)
  })

  it('counts closing an edit form as an ascent', () => {
    expect(isAscent(toEditBlock('essay'), toBlock('essay'))).toBe(true)
  })

  it('counts opening an edit form as a descent', () => {
    expect(isAscent(toBlock('essay'), toEditBlock('essay'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/room/view.test.ts src/ui/room/viewPath.test.ts`
Expected: FAIL — `toRebalance` / `toEditBlock` / `toNewBlock` are not exported.

- [ ] **Step 3: Extend the view module**

In `src/ui/room/view.ts`, add the import and the three cases:

```ts
import { HORIZON_DAYS } from '../../engine'
```

```ts
  /**
   * §2.1's rebalance, held rather than applied.
   *
   * A door rather than a panel on the week: it is a decision with two answers, and a
   * student who taps Rebalance and then wanders off must not come back to a week that
   * quietly changed under them. Carries no state of its own -- the proposal itself lives
   * in `RoomShell`, because a solve is about a moment and cannot be reconstructed from an
   * address.
   */
  | { readonly kind: 'rebalance' }
  /** The one block's own fields, under the block it is about. */
  | { readonly kind: 'editBlock'; readonly itemId: string }
  /** A block being added to a named day, which is why the day is in the address. */
  | { readonly kind: 'newBlock'; readonly dayIndex: number }
```

```ts
export const toRebalance = (): View => REBALANCE

export const toEditBlock = (itemId: string): View => ({ kind: 'editBlock', itemId })

export const toNewBlock = (dayIndex: number): View => ({ kind: 'newBlock', dayIndex })
```

with `const REBALANCE: View = { kind: 'rebalance' }` next to the existing `WEEK` constant.

In `back()`, before the final `return ROOM`:

```ts
  if (view.kind === 'editBlock') return toBlock(view.itemId)
  if (view.kind === 'rebalance' || view.kind === 'newBlock') return WEEK
```

In `toPath()`'s switch:

```ts
    case 'rebalance':
      return '/week/rebalance'
    case 'editBlock':
      return `/week/block/${encodeURIComponent(view.itemId)}/edit`
    case 'newBlock':
      return `/week/new/${view.dayIndex}`
```

In `fromPath()`, replace the `week` branch:

```ts
  if (first === 'week') {
    if (parts.length === 1) return WEEK
    if (parts.length === 2 && second === 'rebalance') return REBALANCE

    if (second === 'block' && third !== undefined) {
      if (parts.length === 3) return toBlock(decodeURIComponent(third))
      if (parts.length === 4 && parts[3] === 'edit') return toEditBlock(decodeURIComponent(third))
    }

    // Bounds-checked rather than trusted: this is a number a person can type, and a day
    // outside the fortnight is a form that would open onto nothing.
    if (parts.length === 3 && second === 'new' && third !== undefined) {
      const dayIndex = Number(third)
      const real =
        third === String(dayIndex) && Number.isInteger(dayIndex) && dayIndex >= 0 && dayIndex < HORIZON_DAYS

      return real ? toNewBlock(dayIndex) : ROOM
    }

    return ROOM
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/room/view.test.ts src/ui/room/viewPath.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/room/view.ts src/ui/room/view.test.ts src/ui/room/viewPath.test.ts
git commit -m "feat: give the proposal, the edit form and a new block their own addresses"
```

---

### Task 4: The preview sheet

**Files:**
- Create: `src/ui/week/RebalancePreview.tsx`
- Test: `src/ui/week/RebalancePreview.test.tsx`

**Interfaces:**
- Consumes: `RebalanceOutcome` (Task 2), `Sheet`, `Button`.
- Produces: `RebalancePreview({ proposal, onApprove, onDiscard, onBack, onClose })`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/week/RebalancePreview.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RebalanceOutcome } from '../../domain/rebalanceOutcome'
import type { Move, MoveKind, Schedule } from '../../optimizer'
import { HORIZON_DAYS } from '../../engine'
import { RebalancePreview } from './RebalancePreview'

const week = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const move = (kind: MoveKind, description: string): Move => ({
  kind,
  itemId: description,
  description,
  apply: (schedule) => schedule,
})

const outcome = (over: Partial<RebalanceOutcome> = {}): RebalanceOutcome => ({
  schedule: week(),
  before: week(),
  moves: [move('shiftDay', 'move the essay from Friday to Wednesday')],
  report: 'I moved 1 thing.',
  proposal: "I'd move 1 thing.",
  fallback: null,
  ...over,
})

const setup = (over: Partial<RebalanceOutcome> = {}) => {
  const onApprove = vi.fn()
  const onDiscard = vi.fn()
  const onBack = vi.fn()
  const onClose = vi.fn()

  render(
    <RebalancePreview
      proposal={outcome(over)}
      onApprove={onApprove}
      onDiscard={onDiscard}
      onBack={onBack}
      onClose={onClose}
    />,
  )

  return { onApprove, onDiscard, onBack, onClose }
}

describe('the rebalance, before it happens', () => {
  it('opens as a dialog named for what it is asking', () => {
    setup()

    expect(screen.getByRole('dialog', { name: /what i'd change/i })).toBeVisible()
  })

  it('names every move it wants to make, one at a time', () => {
    setup({
      moves: [
        move('shiftDay', 'move the essay from Friday to Wednesday'),
        move('batchErrands', 'batch three errands onto Tuesday'),
      ],
    })

    const list = screen.getByTestId('proposal-moves')

    expect(within(list).getByText('move the essay from Friday to Wednesday')).toBeVisible()
    expect(within(list).getByText('batch three errands onto Tuesday')).toBeVisible()
  })

  it('says what the change buys, in the conditional', () => {
    setup({ proposal: "I'd move 20 things. That is 7 days less underwater." })

    expect(screen.getByTestId('proposal-summary')).toHaveTextContent(
      "I'd move 20 things. That is 7 days less underwater.",
    )
  })

  it('says plainly that nothing is saved yet', () => {
    setup()

    expect(screen.getByText(/nothing is saved until you approve/i)).toBeVisible()
  })

  it('adopts the week when approved', async () => {
    const { onApprove, onDiscard } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onDiscard).not.toHaveBeenCalled()
  })

  it('throws the proposal away when discarded', async () => {
    const { onApprove, onDiscard } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))

    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(onApprove).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/week/RebalancePreview.test.tsx`
Expected: FAIL — cannot resolve `./RebalancePreview`.

- [ ] **Step 3: Write the component**

Create `src/ui/week/RebalancePreview.tsx`:

```tsx
import type { JSX } from 'react'
import type { RebalanceOutcome } from '../../domain/rebalanceOutcome'
import { Button } from '../kit/Button'
import { Sheet } from '../kit/Sheet'

/**
 * §2.1's reshuffle, shown before it happens.
 *
 * The solver used to write the week and then say what it had done, which left a student
 * who disagreed with one of twenty moves nothing to do about it. The result already
 * carried everything needed to ask first -- the schedule it started from, the schedule it
 * reached, and a sentence per move -- and nothing displayed the list.
 *
 * Every move is listed individually rather than only counted. The count is the headline
 * and the list is the evidence: "I'd move 20 things" is not something a student can agree
 * or disagree with, and §2.1's rule that the app never says "optimised" is about exactly
 * this -- a change you cannot see is one you cannot consent to.
 *
 * Discard rather than Cancel, and it is what Back and the close control do too. There is
 * no third answer here: leaving without approving means the week is unchanged, and a
 * control that meant something else would be the ambiguity Ruling 60 removed.
 */
export function RebalancePreview({
  proposal,
  onApprove,
  onDiscard,
  onBack,
  onClose,
}: {
  readonly proposal: RebalanceOutcome
  readonly onApprove: () => void
  readonly onDiscard: () => void
  /** Ruling 60: one level up, to the week this was proposed for. Discards, like every
   *  other way out of this sheet. */
  readonly onBack: () => void
  readonly onClose: () => void
}): JSX.Element {
  return (
    <Sheet
      title="What I'd change"
      onClose={onClose}
      onBack={onBack}
      actions={
        <>
          <Button variant="secondary" data-testid="discard-rebalance" onClick={onDiscard}>
            Discard
          </Button>
          <Button data-testid="approve-rebalance" onClick={onApprove}>
            Approve
          </Button>
        </>
      }
    >
      <p data-testid="proposal-summary" className="text-sm text-ink">
        {proposal.proposal}
      </p>

      <ul data-testid="proposal-moves" className="mt-4 flex flex-col gap-2">
        {proposal.moves.map((move, index) => (
          // Indexed because the same kind can act on the same block twice in one solve --
          // two shifts of one errand is a legal path through the neighbourhood -- so kind
          // and id together are not unique. The list is rendered once and never reordered.
          <li
            key={`${move.kind}-${move.itemId}-${index}`}
            className="break-words rounded-lg border border-line bg-surface p-3 text-sm text-ink"
          >
            {move.description}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-sm text-ink-soft">Nothing is saved until you approve.</p>
    </Sheet>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/week/RebalancePreview.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/week/RebalancePreview.tsx src/ui/week/RebalancePreview.test.tsx
git commit -m "feat: show every move a rebalance would make, before it makes any"
```

---

### Task 5: Rebalance waits to be approved

**Files:**
- Modify: `src/ui/room/RoomShell.tsx`
- Test: `src/ui/RoomShell.weekModal.test.tsx`

**Interfaces:**
- Consumes: `RebalancePreview` (Task 4), `toRebalance` / `toWeek` (Task 3), widened `RebalanceOutcome` (Task 2).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/RoomShell.weekModal.test.tsx` (reuse its existing `renderShell` helper and `beforeEach` history reset):

```tsx
describe('rebalance, which now asks first', () => {
  it('opens the proposal instead of changing the week', async () => {
    await renderShell()
    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(screen.getByTestId('rebalance'))

    expect(await screen.findByRole('dialog', { name: /what i'd change/i })).toBeVisible()
    expect(window.location.pathname).toBe('/week/rebalance')
  })

  it('leaves the week alone when the proposal is discarded', async () => {
    await renderShell()
    await userEvent.click(screen.getByTestId('open-week'))
    const before = screen.getByTestId('day-grid-signature')?.textContent ?? null

    await userEvent.click(screen.getByTestId('rebalance'))
    await screen.findByTestId('discard-rebalance')
    await userEvent.click(screen.getByTestId('discard-rebalance'))

    expect(await screen.findByRole('dialog', { name: /the week/i })).toBeVisible()
    expect(screen.queryByTestId('rebalance-report')).toBeNull()
    expect(screen.getByTestId('day-grid-signature')?.textContent ?? null).toBe(before)
  })

  it('reports what it did only once approved', async () => {
    await renderShell()
    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(screen.getByTestId('rebalance'))
    await screen.findByTestId('approve-rebalance')
    await userEvent.click(screen.getByTestId('approve-rebalance'))

    expect(await screen.findByTestId('rebalance-report')).toHaveTextContent(/^I /)
    expect(window.location.pathname).toBe('/week')
  })

  it('lands on the week when a proposal address is opened cold', async () => {
    window.history.replaceState(null, '', '/week/rebalance')
    await renderShell()

    expect(await screen.findByRole('dialog', { name: /the week/i })).toBeVisible()
    expect(window.location.pathname).toBe('/week')
  })
})
```

If the seeded week has nothing to move, the first three tests will not open a preview. The demo week (`umCrunchWeek`) is heavily overloaded and the existing suite already asserts a multi-move report, so it does move. If a test proves otherwise, save a crowded week in `renderShell` rather than weakening the assertion.

Drop the `day-grid-signature` assertions if no such testid is convenient — instead assert on `screen.getByTestId('rebalance-report')` being absent, which is the observable difference.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/RoomShell.weekModal.test.tsx`
Expected: FAIL — no dialog named "What I'd change"; the week changes immediately.

- [ ] **Step 3: Hold the proposal instead of applying it**

In `src/ui/room/RoomShell.tsx`:

Add imports:

```ts
import { runRebalance, type RebalanceOutcome } from '../../domain/rebalanceOutcome'
import { RebalancePreview } from '../week/RebalancePreview'
import { ROOM, toAdd, toBlock, toRebalance, toReserves, toSettings, toWeek } from './view'
```

Add state next to `report` / `fallback`:

```ts
  /**
   * The solve waiting to be answered, or null.
   *
   * Session state rather than storage on purpose: a proposal is about a moment, and one
   * held across a reload would be an offer to rearrange a week that may have changed since.
   * The address knows the student is looking at a proposal; only this knows which one.
   */
  const [proposal, setProposal] = useState<RebalanceOutcome | null>(null)
```

Replace `onRebalance`'s body inside the `try`:

```ts
    try {
      const outcome = runRebalance(week, params, SEED)

      // Nothing to approve is not the same as nothing to say. When the solver found no
      // moves, `describeRebalance` already distinguishes a healthy week from an overloaded
      // one and `smallestFixes` may still have a suggestion -- so the week says both, on
      // the spot, rather than opening a door onto an empty list.
      if (outcome.moves.length === 0) {
        setProposal(null)
        setReport(outcome.report)
        setFallback(outcome.fallback)
        return
      }

      setProposal(outcome)
      setView(toRebalance())
    } finally {
      setWorking(false)
    }
```

Add the two answers and the stale-address guard, next to `closeToRoom`:

```ts
  /**
   * Adopting a proposal: the one place the solver's week is written.
   *
   * The tidy-up sequence plays here rather than at the moment of solving, because §1.3
   * calls it the payoff for a change the student agreed to -- and until this line, they
   * had not.
   */
  const approveProposal = () => {
    if (proposal === null) return

    setSchedule(proposal.schedule)
    setReport(proposal.report)
    setFallback(proposal.fallback)
    setProposal(null)
    play()
    setView(toWeek())
  }

  const discardProposal = () => {
    setProposal(null)
    setView(toWeek())
  }

  /**
   * A proposal address with no proposal behind it -- a reload, a pasted link, a Back into
   * a discarded one -- corrects itself to the week.
   *
   * The same rule `fromPath` already applies to an address the app does not recognise: land
   * somewhere real and fix the bar, rather than assert a state the app is not in. Re-solving
   * instead would be worse -- it would hand the student a fresh proposal they did not ask
   * for, on a week that may have changed since the link was made.
   */
  const proposalIsStale = view.kind === 'rebalance' && proposal === null

  useEffect(() => {
    if (proposalIsStale) setView(toWeek())
    // `setView` is rebuilt every render, so listing it would re-run this on every render.
    // `proposalIsStale` is the whole of what decides whether it should fire.
  }, [proposalIsStale]) // eslint-disable-line react-hooks/exhaustive-deps
```

Add to the `sheets` fragment, after the week block:

```tsx
      {view.kind === 'rebalance' && proposal !== null && (
        <RebalancePreview
          key="rebalance"
          proposal={proposal}
          onApprove={approveProposal}
          onDiscard={discardProposal}
          onBack={discardProposal}
          onClose={() => {
            setProposal(null)
            closeToRoom()
          }}
        />
      )}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/RoomShell.weekModal.test.tsx && npm run typecheck`
Expected: PASS, clean types.

- [ ] **Step 5: Run the whole suite and commit**

```bash
npx vitest run
git add src/ui/room/RoomShell.tsx src/ui/RoomShell.weekModal.test.tsx
git commit -m "feat: rebalance proposes, the student approves"
```

---

### Task 6: One definition of overlap

**Files:**
- Modify: `src/optimizer/constraints.ts`, `src/optimizer/index.ts`
- Test: `src/optimizer/constraints.test.ts`

**Interfaces:**
- Produces: `overlaps(a: ScheduledItem, b: ScheduledItem): boolean`, exported from `src/optimizer`.

- [ ] **Step 1: Write the failing test**

Append to `src/optimizer/constraints.test.ts`:

```ts
describe('overlapping, as one definition', () => {
  const at = (dayIndex: number, startHour: number, hours: number): ScheduledItem =>
    studyItem('x', { dayIndex, startHour, hours })

  it('is true when two blocks share a day and any of the same hours', () => {
    expect(overlaps(at(1, 9, 2), at(1, 10, 1))).toBe(true)
  })

  it('is false when they share a day but only touch end to end', () => {
    expect(overlaps(at(1, 9, 2), at(1, 11, 1))).toBe(false)
  })

  it('is false across different days whatever the hours', () => {
    expect(overlaps(at(1, 9, 4), at(2, 9, 4))).toBe(false)
  })
})
```

Adapt `studyItem`'s call shape to whatever `src/optimizer/testSupport.ts` actually exposes; if it takes positional arguments, build the items as plain object literals instead.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/optimizer/constraints.test.ts`
Expected: FAIL — `overlaps` is not exported.

- [ ] **Step 3: Export the predicate**

In `src/optimizer/constraints.ts`, change the declaration and give it the doc comment that says why it is shared:

```ts
/**
 * Whether two blocks occupy any of the same hours on the same day.
 *
 * Exported because the manual edit form asks the same question `violations` does, about a
 * block that is not in the schedule yet. Two definitions of "overlap" -- one here, one in
 * the form -- would eventually disagree about a half-hour boundary, and the one the
 * student sees would be the wrong one. Note this is the raw geometry: whether an overlap
 * is a *violation* is a separate judgement `violations` below makes, and the form makes
 * differently.
 */
export const overlaps = (a: ScheduledItem, b: ScheduledItem): boolean =>
  a.dayIndex === b.dayIndex &&
  a.startHour < b.startHour + b.hours &&
  b.startHour < a.startHour + a.hours
```

In `src/optimizer/index.ts`:

```ts
export { isValid, overlaps, violations } from './constraints'
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/optimizer/constraints.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/optimizer/constraints.ts src/optimizer/constraints.test.ts src/optimizer/index.ts
git commit -m "refactor: share one definition of two blocks overlapping"
```

---

### Task 7: A provisional yes cannot outlive its block

**Files:**
- Modify: `src/domain/commitments.ts`
- Test: `src/domain/commitments.test.ts`

**Interfaces:**
- Produces: `dropCommitmentFor(schedule: Schedule, itemId: string): Schedule`.

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/commitments.test.ts`:

```ts
describe('a commitment whose block is gone', () => {
  it('goes with it', () => {
    const accepted = accept(week(), parsed('Review a friend\'s draft'), 0)
    const itemId = accepted.items[accepted.items.length - 1]!.id

    const after = dropCommitmentFor(accepted, itemId)

    expect(after.commitments).toEqual([])
  })

  it('leaves every other commitment alone', () => {
    const one = accept(week(), parsed('One'), 0)
    const two = accept(one, parsed('Two'), 0)
    const goneId = two.items[two.items.length - 1]!.id

    const after = dropCommitmentFor(two, goneId)

    expect(after.commitments).toHaveLength(1)
    expect(after.commitments?.[0]?.title).toBe('One')
  })

  it('hands back the very same week when there was nothing to drop', () => {
    const before = week()

    expect(dropCommitmentFor(before, 'never-existed')).toBe(before)
  })
})
```

Reuse the file's existing `week()` / `parsed()` builders; if it has none, copy the ones from `src/domain/commitments.test.ts`'s current `accept` tests.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/domain/commitments.test.ts`
Expected: FAIL — `dropCommitmentFor` is not exported.

- [ ] **Step 3: Add the function**

Append to `src/domain/commitments.ts`:

```ts
/**
 * Drops the acceptance a removed block was standing for.
 *
 * A `Commitment` points at the item `accept` created for it, and §2.3's whole mechanism --
 * a review date that lapses on its own -- reads that item through the projection. A
 * commitment left pointing at a block that no longer exists would go on being weighed and
 * go on being offered for withdrawal, for something that is not in the week any more.
 *
 * Lives here rather than in `scheduleEdits` because what a commitment is and when it stops
 * being one is this module's question; `removeItem` only needs to ask it.
 *
 * Returns the identical object when nothing matched, so a caller can tell a real change
 * from a no-op without comparing contents.
 */
export function dropCommitmentFor(schedule: Schedule, itemId: string): Schedule {
  const commitments = schedule.commitments
  if (commitments === undefined) return schedule

  const kept = commitments.filter((commitment) => commitment.itemId !== itemId)

  return kept.length === commitments.length ? schedule : { ...schedule, commitments: kept }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/domain/commitments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/commitments.ts src/domain/commitments.test.ts
git commit -m "feat: retire the acceptance behind a block that is gone"
```

---

### Task 8: Editing, removing and adding a block

**Files:**
- Modify: `src/domain/scheduleEdits.ts`
- Test: `src/domain/scheduleEdits.test.ts`

**Interfaces:**
- Consumes: `dropCommitmentFor` (Task 7).
- Produces:
  - `ItemFields` — `{ title: string; type: LoadType; kind: ActivityKind; hours: number; dayIndex: number; startHour: number; fixed: boolean }`
  - `editItem(schedule: Schedule, id: string, fields: ItemFields): Schedule`
  - `removeItem(schedule: Schedule, id: string): Schedule`
  - `addBlock(schedule: Schedule, fields: ItemFields): Schedule`

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/scheduleEdits.test.ts`:

```ts
const fields = (over: Partial<ItemFields> = {}): ItemFields => ({
  title: 'Essay draft',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  dayIndex: 3,
  startHour: 14,
  fixed: false,
  ...over,
})

describe('editing a block by hand', () => {
  it('writes the new fields onto the one block named', () => {
    const before = weekWith([item('essay', { dayIndex: 5, startHour: 9 }), item('lab')])

    const after = editItem(before, 'essay', fields({ dayIndex: 3, startHour: 14, hours: 2 }))
    const edited = after.items.find((candidate) => candidate.id === 'essay')

    expect(edited).toMatchObject({ dayIndex: 3, startHour: 14, hours: 2, title: 'Essay draft' })
    expect(after.items.find((candidate) => candidate.id === 'lab')).toEqual(
      before.items.find((candidate) => candidate.id === 'lab'),
    )
  })

  it('never mutates the week it was handed', () => {
    const before = weekWith([item('essay', { dayIndex: 5 })])

    editItem(before, 'essay', fields({ dayIndex: 1 }))

    expect(before.items[0]!.dayIndex).toBe(5)
  })

  it('keeps what the form never asked about', () => {
    const before = weekWith([
      item('nap', { protectedRest: true, intensity: 0.5, deadlineDay: 4, seriesId: 'series-1' }),
    ])

    const after = editItem(before, 'nap', fields({ dayIndex: 2 }))

    expect(after.items[0]).toMatchObject({
      protectedRest: true,
      intensity: 0.5,
      deadlineDay: 4,
      seriesId: 'series-1',
      dayIndex: 2,
    })
  })

  it('leaves the week untouched when no block has that id', () => {
    const before = weekWith([item('essay')])

    expect(editItem(before, 'ghost', fields())).toEqual(before)
  })
})

describe('removing a block', () => {
  it('takes it out of the week', () => {
    const before = weekWith([item('essay'), item('lab')])

    expect(removeItem(before, 'essay').items.map((candidate) => candidate.id)).toEqual(['lab'])
  })

  it('takes the acceptance that created it out too', () => {
    const before = {
      ...weekWith([item('essay')]),
      commitments: [{ id: 'c1', title: 'Essay', reviewDay: 7, itemId: 'essay' }],
    }

    expect(removeItem(before, 'essay').commitments).toEqual([])
  })
})

describe('adding a block by hand', () => {
  it('puts it exactly where it was told, not where a solver would prefer', () => {
    const before = weekWith([item('lab', { dayIndex: 3, startHour: 14, hours: 3 })])

    const after = addBlock(before, fields({ dayIndex: 3, startHour: 14, hours: 2 }))
    const added = after.items[after.items.length - 1]!

    expect(added).toMatchObject({ dayIndex: 3, startHour: 14, hours: 2, title: 'Essay draft' })
  })

  it('gives it an id nothing else in the week is using', () => {
    const before = weekWith([item('lab')])

    const after = addBlock(before, fields())
    const ids = after.items.map((candidate) => candidate.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never creates protected rest, whatever was typed', () => {
    const after = addBlock(weekWith([]), fields({ kind: 'rest', type: 'physical' }))

    expect(after.items[0]!.protectedRest).toBe(false)
  })

  it('leaves every existing block alone', () => {
    const before = weekWith([item('lab')])

    expect(addBlock(before, fields()).items[0]).toEqual(before.items[0])
  })
})
```

Add local `item()` and `weekWith()` builders at the top of the file if it has none, in the shape used by `src/ui/week/WeekScreen.test.tsx:18-45`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/domain/scheduleEdits.test.ts`
Expected: FAIL — `editItem`, `removeItem`, `addBlock` and `ItemFields` do not exist.

- [ ] **Step 3: Add the three operations**

In `src/domain/scheduleEdits.ts`, add the imports and the new code. Re-express `completeItem` through the shared helper without changing what it does.

```ts
import { HORIZON_DAYS, type ActivityKind, type LoadType } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { dropCommitmentFor } from './commitments'

/**
 * Everything the student can set about a block by hand.
 *
 * Deliberately NOT every field of a `ScheduledItem`. `intensity` is a modelling number a
 * student has no way to judge; `deadlineDay` comes from what the work actually is;
 * `seriesId` belongs to the recurrence that created it; and `protectedRest` is §5.1's
 * invariant -- nothing a student types may mint protected recovery, which is why
 * `addBlock` below hardcodes it false exactly as `placeItems` does. Editing an existing
 * protected block keeps its protection, and the form says what moving it means.
 */
export interface ItemFields {
  readonly title: string
  readonly type: LoadType
  readonly kind: ActivityKind
  readonly hours: number
  readonly dayIndex: number
  readonly startHour: number
  readonly fixed: boolean
}

const withoutItem = (schedule: Schedule, id: string): Schedule => ({
  ...schedule,
  items: schedule.items.filter((item) => item.id !== id),
})
```

Change `completeItem`'s body to `return withoutItem(schedule, id)` and leave its doc comment as it is.

Append:

```ts
/**
 * Writes the student's own version of a block over the app's.
 *
 * Every field outside `ItemFields` survives, which is the point: a protected nap edited to
 * a different hour is still protected, a recurring class edited in one week keeps its
 * series, and a deadline the student never saw is not silently cleared by a form that
 * never asked about it.
 *
 * An unknown id is a no-op rather than a throw. It happens for real -- the same stale-id
 * case `blockSheet` already handles by closing.
 */
export function editItem(schedule: Schedule, id: string, fields: ItemFields): Schedule {
  return {
    ...schedule,
    items: schedule.items.map((item) => (item.id === id ? { ...item, ...fields } : item)),
  }
}

/**
 * Takes a block out because it is not happening.
 *
 * Mechanically what `completeItem` does to the week, and deliberately a separate name:
 * "I did it" and "this is off" are different facts about a block, and the day one of them
 * starts being logged rather than dropped, only one of these two should change. A caller
 * that picked whichever name was handy would make that change unsafe.
 *
 * Unlike `completeItem` it also retires the provisional acceptance behind the block, if
 * there was one -- a yes that has nothing left to point at (§2.3).
 */
export function removeItem(schedule: Schedule, id: string): Schedule {
  return dropCommitmentFor(withoutItem(schedule, id), id)
}

/**
 * Puts a block in the week exactly where the student said.
 *
 * Deliberately NOT `placeItems`, which is the right path for something the app read off a
 * photo or a paragraph and has to find room for. Here the student has already chosen the
 * day and the hour on a grid they were looking at, and auto-placing it somewhere else
 * would be the app overriding a decision it just asked them to make. Where that choice
 * clashes with something, the form says so before the save -- see `editWarnings`.
 *
 * The id follows `scheduleRecovery`'s pattern: the clock plus the current length, which
 * cannot collide within a week because the length moves with every add.
 */
export function addBlock(schedule: Schedule, fields: ItemFields): Schedule {
  const added: ScheduledItem = {
    ...fields,
    id: `manual-${Date.now()}-${schedule.items.length}`,
    intensity: 1,
    deadlineDay: null,
    // §5.1: nothing a student types may create structurally protected recovery. Only
    // `scheduleRecovery` and the prescription path may, and both are the app's own advice.
    protectedRest: false,
  }

  return { ...schedule, items: [...schedule.items, added] }
}
```

`HORIZON_DAYS` is already imported by `deferItem`; do not double-import it.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/domain/scheduleEdits.test.ts && npm run typecheck`
Expected: PASS, clean types.

- [ ] **Step 5: Commit**

```bash
git add src/domain/scheduleEdits.ts src/domain/scheduleEdits.test.ts
git commit -m "feat: edit, remove and add a block outside the optimizer"
```

---

### Task 9: Clashes, in plain words

**Files:**
- Create: `src/domain/editWarnings.ts`
- Test: `src/domain/editWarnings.test.ts`

**Interfaces:**
- Consumes: `overlaps` (Task 6), `EngineParams`.
- Produces: `editWarnings({ schedule, item, params }): readonly string[]`.

**Why a new module rather than `violations`:** `violations` deliberately does not treat two movable blocks overlapping as a violation (the solver needs that state to be legal). A student who has just put two things on top of each other must still be told. And `violations` returns sentences about the whole week; this is about one block.

- [ ] **Step 1: Write the failing test**

Create `src/domain/editWarnings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { HEALTHY } from '../optimizer/testSupport'
import { editWarnings } from './editWarnings'

const item = (id: string, over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id,
  title: id,
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 3,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const warn = (schedule: Schedule, candidate: ScheduledItem): readonly string[] =>
  editWarnings({ schedule, item: candidate, params: HEALTHY })

describe('what a hand-placed block clashes with', () => {
  it('says nothing about a block with the day to itself', () => {
    expect(warn(week([item('lab', { dayIndex: 1 })]), item('essay'))).toEqual([])
  })

  it('names the block it sits on top of', () => {
    const schedule = week([item('lab', { title: 'WIA3001 tutorial', startHour: 10 })])

    expect(warn(schedule, item('essay', { startHour: 9 })).join(' ')).toContain(
      'WIA3001 tutorial',
    )
  })

  it('says a fixed block is one the week is built around', () => {
    const schedule = week([item('lab', { title: 'Lab', startHour: 10, fixed: true })])

    expect(warn(schedule, item('essay', { startHour: 9 })).join(' ')).toMatch(/built around/i)
  })

  it('says protected rest is protected recovery', () => {
    const schedule = week([item('nap', { title: 'Rest', startHour: 10, protectedRest: true })])

    expect(warn(schedule, item('essay', { startHour: 9 })).join(' ')).toMatch(
      /protected recovery/i,
    )
  })

  it('never warns that a block clashes with itself', () => {
    const existing = item('essay', { startHour: 9 })

    expect(warn(week([existing]), { ...existing, startHour: 10 })).toEqual([])
  })

  it('says when it lands past its own deadline', () => {
    const candidate = item('essay', { dayIndex: 6, deadlineDay: 4 })

    expect(warn(week([]), candidate).join(' ')).toMatch(/deadline/i)
  })

  it('says when it runs past midnight', () => {
    expect(warn(week([]), item('essay', { startHour: 23, hours: 3 })).join(' ')).toMatch(
      /past midnight/i,
    )
  })

  it('says when the day would run past what the student can sustain', () => {
    const packed = Array.from({ length: 6 }, (_, index) =>
      item(`block-${index}`, { dayIndex: 3, startHour: index * 2, hours: 2 }),
    )

    expect(warn(week(packed), item('essay', { dayIndex: 3, startHour: 14 })).join(' ')).toMatch(
      /hours of work/i,
    )
  })

  it('does not count rest towards the day s working hours', () => {
    const naps = Array.from({ length: 8 }, (_, index) =>
      item(`nap-${index}`, { dayIndex: 3, startHour: index, hours: 1, kind: 'rest' }),
    )

    expect(warn(week(naps), item('essay', { dayIndex: 3, startHour: 20 })).join(' ')).not.toMatch(
      /hours of work/i,
    )
  })
})
```

If `HEALTHY` in `testSupport.ts` is not an `EngineParams`, build params locally from whatever the file does export.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/domain/editWarnings.test.ts`
Expected: FAIL — cannot resolve `./editWarnings`.

- [ ] **Step 3: Write the module**

Create `src/domain/editWarnings.ts`:

```ts
import type { EngineParams } from '../engine'
import { overlaps, type Schedule, type ScheduledItem } from '../optimizer'

/**
 * What a hand-placed block clashes with, said to the student rather than to the solver.
 *
 * This is not `violations`, and the difference is the whole reason it exists. `violations`
 * answers "may the search adopt this schedule", and it deliberately permits two movable
 * blocks sitting on top of each other, because rejecting that would cut legal paths out of
 * the neighbourhood. A student who has just put two things at the same hour has made a
 * real mistake and must be told about it -- the solver's tolerance is not the student's.
 *
 * These are warnings and never refusals. A student saying a lecture was cancelled, or that
 * two things genuinely do collide this week, is recording their life; an app that refuses
 * the entry is wrong about its own subject, and the fortnight would then be a fiction the
 * forecast is computed from. The double-booking is precisely the signal they came for.
 *
 * `overlaps` comes from `constraints.ts` rather than being redefined here, so the two can
 * never disagree about a half-hour boundary.
 */

/** Sleep enters through `Schedule.sleepByDay`, and rest is what recovers from the rest --
 *  neither is what the daily cap is capping. Matches `constraints.ts`'s own predicate. */
const isWork = (item: ScheduledItem): boolean => item.kind !== 'rest' && item.kind !== 'sleep'

const HOURS_IN_A_DAY = 24

const round = (hours: number): number => Math.round(hours * 10) / 10

export function editWarnings({
  schedule,
  item,
  params,
}: {
  readonly schedule: Schedule
  /** The block as it WOULD be. Not necessarily in `schedule` yet -- when it is, it is
   *  matched by id and excluded, so nothing ever clashes with its own former self. */
  readonly item: ScheduledItem
  readonly params: EngineParams
}): readonly string[] {
  const found: string[] = []
  const others = schedule.items.filter((candidate) => candidate.id !== item.id)

  if (item.startHour + item.hours > HOURS_IN_A_DAY) {
    found.push('This runs past midnight, so part of it falls outside the day it is on.')
  }

  if (item.deadlineDay !== null && item.dayIndex > item.deadlineDay) {
    found.push('This lands after its own deadline.')
  }

  for (const other of others) {
    if (!overlaps(item, other)) continue

    if (other.protectedRest) {
      found.push(`This sits on ${other.title}, which is protected recovery.`)
    } else if (other.fixed) {
      found.push(`This clashes with ${other.title}, which your week is built around.`)
    } else {
      found.push(`This overlaps ${other.title}.`)
    }
  }

  const dayHours = others
    .filter((candidate) => candidate.dayIndex === item.dayIndex && isWork(candidate))
    .reduce((total, candidate) => total + candidate.hours, isWork(item) ? item.hours : 0)

  if (dayHours > params.dailyHoursCap) {
    found.push(
      `That day would come to ${round(dayHours)} hours of work, past the ${round(params.dailyHoursCap)} you can hold.`,
    )
  }

  return found
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/domain/editWarnings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/editWarnings.ts src/domain/editWarnings.test.ts
git commit -m "feat: name what a hand-placed block clashes with"
```

---

### Task 10: One vocabulary for load types and block kinds

**Files:**
- Create: `src/ui/kit/labels.ts`
- Modify: `src/ui/planner/ItemChip.tsx`
- Test: `src/ui/planner/ItemChip.test.tsx` (re-run only — nothing it renders changes)

**Interfaces:**
- Produces: `LOAD_TYPE_LABELS: Record<LoadType, string>`, `BLOCK_KIND_LABELS: Record<ActivityKind, string>`.

**Why:** the new form needs the same student-facing words the planner already uses. A second copy is a second thing to keep in step, and Ruling 46 already records what happens when one list is written down in two places.

- [ ] **Step 1: Write the failing test**

Create the assertions inside `src/ui/planner/ItemChip.test.tsx` (or a new `src/ui/kit/labels.test.ts`, whichever the reviewer prefers — use `labels.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { ACTIVITY_KINDS, BLOCK_KINDS, LOAD_TYPES } from '../../engine'
import { BLOCK_KIND_LABELS, LOAD_TYPE_LABELS } from './labels'

describe('the vocabulary the pickers speak', () => {
  it('has a student s word for every load type', () => {
    for (const type of LOAD_TYPES) {
      expect(LOAD_TYPE_LABELS[type]).toBeTruthy()
    }
  })

  it('has a student s word for every activity kind, so a picker can never fall blank', () => {
    for (const kind of ACTIVITY_KINDS) {
      expect(BLOCK_KIND_LABELS[kind]).toBeTruthy()
    }
  })

  it('covers every kind a block may actually carry', () => {
    for (const kind of BLOCK_KINDS) {
      expect(BLOCK_KIND_LABELS[kind]).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/kit/labels.test.ts`
Expected: FAIL — cannot resolve `./labels`.

- [ ] **Step 3: Create the module and point `ItemChip` at it**

Create `src/ui/kit/labels.ts` with the two maps lifted verbatim from `src/ui/planner/ItemChip.tsx` (including their doc comments), renamed:

```ts
import type { ActivityKind, LoadType } from '../../engine'

/** The engine's vocabulary in a student's words. "Mental load" is a modelling term; "study
 *  and thinking" is what someone recognises as their own week.
 *
 *  Shared rather than local since the manual edit form needed the same four words: two
 *  copies of one vocabulary is how the planner and the week come to call the same thing
 *  different things, which is the fault Ruling 46 recorded for `BLOCK_KINDS`. */
export const LOAD_TYPE_LABELS: Record<LoadType, string> = {
  mental: 'Study & thinking',
  physical: 'Body & movement',
  social: 'People',
  errands: 'Life admin',
}

/** §6.6's kinds in a student's words -- what the activity leaves behind, not the modelling
 *  term for it. A gym session and a walk are both "Body & movement" above, but this is
 *  where the student says which one it actually was. */
export const BLOCK_KIND_LABELS: Record<ActivityKind, string> = {
  hardExercise: 'Hard exercise',
  lightExercise: 'Light exercise',
  studyBlock: 'Study',
  socialDraining: 'Seeing people (draining)',
  socialRestorative: 'Seeing people (restorative)',
  errands: 'Life admin',
  rest: 'Rest',
  sleep: 'Sleep',
}
```

In `src/ui/planner/ItemChip.tsx`, delete the two local maps and import instead:

```ts
import { BLOCK_KIND_LABELS, LOAD_TYPE_LABELS } from '../kit/labels'
```

Rename the two usages: `LABELS[type]` → `LOAD_TYPE_LABELS[type]`, `KIND_LABELS[kind]` → `BLOCK_KIND_LABELS[kind]`. Leave `SELECTABLE_KINDS` and everything else alone.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/kit/labels.test.ts src/ui/planner/ItemChip.test.tsx`
Expected: PASS — `ItemChip.test.tsx` unchanged and still green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/kit/labels.ts src/ui/kit/labels.test.ts src/ui/planner/ItemChip.tsx
git commit -m "refactor: share one vocabulary between the planner and the week"
```

---

### Task 11: The form's pure model

**Files:**
- Create: `src/ui/week/eventDraft.ts`
- Test: `src/ui/week/eventDraft.test.ts`

**Interfaces:**
- Consumes: `ItemFields` (Task 8), `gapsOn` / `WAKE_HOUR` from `src/optimizer`, `HORIZON_DAYS`.
- Produces:
  - `EventDraft` — `{ title: string; type: LoadType; kind: ActivityKind; dayIndex: number; startHour: number; hours: number; fixed: boolean }`
  - `NEW_ITEM_ID: string`
  - `blankDraft(schedule: Schedule, dayIndex: number): EventDraft`
  - `draftFrom(item: ScheduledItem): EventDraft`
  - `DraftErrors` — `{ title?: string; hours?: string; startHour?: string; dayIndex?: string }`
  - `validate(draft: EventDraft): DraftErrors`
  - `isComplete(errors: DraftErrors): boolean`
  - `toFields(draft: EventDraft): ItemFields`
  - `candidate(draft: EventDraft, existing: ScheduledItem | null): ScheduledItem`

- [ ] **Step 1: Write the failing test**

Create `src/ui/week/eventDraft.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import {
  blankDraft,
  candidate,
  draftFrom,
  isComplete,
  NEW_ITEM_ID,
  toFields,
  validate,
  type EventDraft,
} from './eventDraft'

const item = (id: string, over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id,
  title: id,
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 3,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: ScheduledItem[] = []): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const draft = (over: Partial<EventDraft> = {}): EventDraft => ({
  title: 'Essay draft',
  type: 'mental',
  kind: 'studyBlock',
  dayIndex: 3,
  startHour: 14,
  hours: 2,
  fixed: false,
  ...over,
})

describe('the draft a new block starts from', () => {
  it('starts on the day it was opened from', () => {
    expect(blankDraft(week(), 5).dayIndex).toBe(5)
  })

  it('starts at the first hour the day has free', () => {
    const busy = week([item('lab', { dayIndex: 5, startHour: 8, hours: 3 })])

    expect(blankDraft(busy, 5).startHour).toBe(11)
  })

  it('starts unnamed, so nothing is saved by accident', () => {
    expect(blankDraft(week(), 5).title).toBe('')
    expect(isComplete(validate(blankDraft(week(), 5)))).toBe(false)
  })
})

describe('the draft an existing block starts from', () => {
  it('reads back exactly what the block is', () => {
    const existing = item('essay', { title: 'Essay', dayIndex: 4, startHour: 13, hours: 3, fixed: true })

    expect(draftFrom(existing)).toEqual({
      title: 'Essay',
      type: 'mental',
      kind: 'studyBlock',
      dayIndex: 4,
      startHour: 13,
      hours: 3,
      fixed: true,
    })
  })
})

describe('what the form refuses to save', () => {
  it('refuses a block with no name', () => {
    expect(validate(draft({ title: '   ' })).title).toBeTruthy()
  })

  it('refuses a block with no length', () => {
    expect(validate(draft({ hours: 0 })).hours).toBeTruthy()
  })

  it('refuses a block longer than a day', () => {
    expect(validate(draft({ hours: 25 })).hours).toBeTruthy()
  })

  it('refuses a start time that is not an hour of the day', () => {
    expect(validate(draft({ startHour: 24 })).startHour).toBeTruthy()
    expect(validate(draft({ startHour: -1 })).startHour).toBeTruthy()
  })

  it('refuses a day outside the fortnight', () => {
    expect(validate(draft({ dayIndex: HORIZON_DAYS })).dayIndex).toBeTruthy()
  })

  it('accepts an ordinary block', () => {
    expect(isComplete(validate(draft()))).toBe(true)
  })
})

describe('turning a draft into something the week can hold', () => {
  it('trims the name so a stray space is not part of the title', () => {
    expect(toFields(draft({ title: '  Essay  ' })).title).toBe('Essay')
  })

  it('builds a candidate that keeps the block s id when there is one', () => {
    const existing = item('essay', { intensity: 0.5, deadlineDay: 4, protectedRest: true })

    expect(candidate(draft({ dayIndex: 1 }), existing)).toMatchObject({
      id: 'essay',
      intensity: 0.5,
      deadlineDay: 4,
      protectedRest: true,
      dayIndex: 1,
    })
  })

  it('builds a candidate that clashes with nothing by id when the block is new', () => {
    expect(candidate(draft(), null).id).toBe(NEW_ITEM_ID)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/week/eventDraft.test.ts`
Expected: FAIL — cannot resolve `./eventDraft`.

- [ ] **Step 3: Write the module**

Create `src/ui/week/eventDraft.ts`:

```ts
import type { ItemFields } from '../../domain/scheduleEdits'
import { HORIZON_DAYS, type ActivityKind, type LoadType } from '../../engine'
import { gapsOn, WAKE_HOUR, type Schedule, type ScheduledItem } from '../../optimizer'

/**
 * The edit form's model, with no React in it.
 *
 * Everything the form decides -- what a blank one starts as, what counts as unfinished,
 * what the week would look like if it were saved -- is here, so the component is left with
 * one piece of state and a list of inputs. The same split `blockActions` uses for the
 * block sheet, and for the same reason: a form that decided these things inline could only
 * be tested by clicking it.
 */

export interface EventDraft {
  readonly title: string
  readonly type: LoadType
  readonly kind: ActivityKind
  readonly dayIndex: number
  readonly startHour: number
  readonly hours: number
  readonly fixed: boolean
}

/**
 * The id a not-yet-saved block wears while the warnings are computed against it.
 *
 * `editWarnings` excludes the schedule's own copy of the block being edited by id. A new
 * block has no copy to exclude, so it needs an id that matches nothing -- and one that
 * could never be a real id, since `addBlock` mints `manual-<time>-<n>`.
 */
export const NEW_ITEM_ID = '__new__'

const HOURS_IN_A_DAY = 24

export function blankDraft(schedule: Schedule, dayIndex: number): EventDraft {
  // The first opening on the day, so the common case -- "put something in this afternoon"
  // -- opens already pointing somewhere sensible rather than at 00:00. `gapsOn` clamps to
  // the waking window and merges overlaps, so this is a real hour on a real day.
  const first = gapsOn(schedule, dayIndex)[0]

  return {
    title: '',
    type: 'mental',
    kind: 'studyBlock',
    dayIndex,
    startHour: first?.startHour ?? WAKE_HOUR,
    hours: 1,
    fixed: false,
  }
}

export function draftFrom(item: ScheduledItem): EventDraft {
  return {
    title: item.title,
    type: item.type,
    kind: item.kind,
    dayIndex: item.dayIndex,
    startHour: item.startHour,
    hours: item.hours,
    fixed: item.fixed,
  }
}

export interface DraftErrors {
  readonly title?: string
  readonly hours?: string
  readonly startHour?: string
  readonly dayIndex?: string
}

/**
 * What is missing or impossible, per field.
 *
 * Only the impossible: this is the narrow set a block cannot be saved without, and it is
 * deliberately much smaller than the set of things that might be a bad idea. Everything
 * that is merely a clash -- an overlap, a blown deadline, a day that will not hold -- goes
 * through `editWarnings` and never blocks a save.
 */
export function validate(draft: EventDraft): DraftErrors {
  const errors: {
    title?: string
    hours?: string
    startHour?: string
    dayIndex?: string
  } = {}

  if (draft.title.trim() === '') {
    errors.title = 'Give it a name you will recognise later.'
  }

  if (!Number.isFinite(draft.hours) || draft.hours <= 0) {
    errors.hours = 'How long is it? Half an hour is the smallest step.'
  } else if (draft.hours > HOURS_IN_A_DAY) {
    errors.hours = 'Nothing runs longer than a day.'
  }

  if (!Number.isInteger(draft.startHour) || draft.startHour < 0 || draft.startHour >= HOURS_IN_A_DAY) {
    errors.startHour = 'Pick a start between 00:00 and 23:00.'
  }

  if (!Number.isInteger(draft.dayIndex) || draft.dayIndex < 0 || draft.dayIndex >= HORIZON_DAYS) {
    errors.dayIndex = 'That day is outside the fortnight.'
  }

  return errors
}

export const isComplete = (errors: DraftErrors): boolean => Object.keys(errors).length === 0

export function toFields(draft: EventDraft): ItemFields {
  return {
    title: draft.title.trim(),
    type: draft.type,
    kind: draft.kind,
    hours: draft.hours,
    dayIndex: draft.dayIndex,
    startHour: draft.startHour,
    fixed: draft.fixed,
  }
}

/**
 * The block as it WOULD be, for asking what it clashes with.
 *
 * Everything outside `ItemFields` is carried from the block being edited, which is what
 * makes the warning about protected rest possible: the draft has no `protectedRest` field
 * of its own, so without this the form would ask about a block that had quietly stopped
 * being protected.
 */
export function candidate(draft: EventDraft, existing: ScheduledItem | null): ScheduledItem {
  return {
    id: existing?.id ?? NEW_ITEM_ID,
    intensity: existing?.intensity ?? 1,
    deadlineDay: existing?.deadlineDay ?? null,
    protectedRest: existing?.protectedRest ?? false,
    ...(existing?.seriesId === undefined ? {} : { seriesId: existing.seriesId }),
    ...toFields(draft),
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/week/eventDraft.test.ts && npm run typecheck`
Expected: PASS, clean types.

- [ ] **Step 5: Commit**

```bash
git add src/ui/week/eventDraft.ts src/ui/week/eventDraft.test.ts
git commit -m "feat: the edit form's model, with no React in it"
```

---

### Task 12: The add/edit form

**Files:**
- Create: `src/ui/week/EventForm.tsx`
- Test: `src/ui/week/EventForm.test.tsx`

**Interfaces:**
- Consumes: `eventDraft` (Task 11), `editWarnings` (Task 9), `labels` (Task 10), `ItemFields` (Task 8), `Sheet`, `Button`, `Field`, `dateFor` from `src/domain/calendar`.
- Produces: `EventForm({ schedule, params, item, dayIndex, onSave, onClose, onBack })`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/week/EventForm.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { HEALTHY } from '../../optimizer/testSupport'
import { EventForm } from './EventForm'

const item = (id: string, over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id,
  title: id,
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 3,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: ScheduledItem[] = []): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const setup = (over: Partial<Parameters<typeof EventForm>[0]> = {}) => {
  const onSave = vi.fn()
  const onClose = vi.fn()
  const onBack = vi.fn()

  render(
    <EventForm
      schedule={week()}
      params={HEALTHY}
      item={null}
      dayIndex={3}
      onSave={onSave}
      onClose={onClose}
      onBack={onBack}
      {...over}
    />,
  )

  return { onSave, onClose, onBack }
}

describe('adding a block by hand', () => {
  it('opens as a dialog that says it is adding', () => {
    setup()

    expect(screen.getByRole('dialog', { name: /add a block/i })).toBeVisible()
  })

  it('will not save a block with no name', () => {
    setup()

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('saves exactly what was typed, where it was put', async () => {
    const { onSave } = setup()

    await userEvent.type(screen.getByLabelText('What'), 'Gym')
    await userEvent.selectOptions(screen.getByLabelText('Starts at'), '17')
    await userEvent.clear(screen.getByLabelText('Hours'))
    await userEvent.type(screen.getByLabelText('Hours'), '1.5')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Gym', startHour: 17, hours: 1.5, dayIndex: 3 }),
    )
  })
})

describe('changing a block by hand', () => {
  it('opens with what the block already is', () => {
    setup({ item: item('essay', { title: 'Essay draft', startHour: 9, hours: 2 }) })

    expect(screen.getByLabelText('What')).toHaveValue('Essay draft')
    expect(screen.getByLabelText('Hours')).toHaveValue(2)
  })

  it('hands back the changed fields, and only those', async () => {
    const { onSave } = setup({ item: item('essay', { title: 'Essay draft' }) })

    await userEvent.selectOptions(screen.getByLabelText('Starts at'), '15')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Essay draft', startHour: 15 }),
    )
  })
})

describe('what the form says about a block the optimizer has pinned', () => {
  it('says a fixed block is one the week is built around', () => {
    setup({ item: item('lab', { fixed: true }) })

    expect(screen.getByTestId('pinned-note')).toHaveTextContent(/built around/i)
  })

  it('says protected rest was pinned on purpose', () => {
    setup({ item: item('nap', { protectedRest: true, kind: 'rest' }) })

    expect(screen.getByTestId('pinned-note')).toHaveTextContent(/on purpose/i)
  })

  it('lets it be saved anyway', async () => {
    const { onSave } = setup({ item: item('lab', { title: 'Lab', fixed: true }) })

    await userEvent.selectOptions(screen.getByLabelText('Starts at'), '15')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
  })
})

describe('what the form says about a clash', () => {
  it('names the block it would collide with', async () => {
    setup({
      schedule: week([item('lab', { title: 'WIA3001 tutorial', dayIndex: 3, startHour: 9, hours: 2 })]),
      item: item('essay', { title: 'Essay', dayIndex: 3, startHour: 14 }),
    })

    await userEvent.selectOptions(screen.getByLabelText('Starts at'), '9')

    expect(screen.getByTestId('edit-warnings')).toHaveTextContent('WIA3001 tutorial')
  })

  it('still lets it be saved, because the week really is double-booked', async () => {
    const { onSave } = setup({
      schedule: week([item('lab', { title: 'Lab', dayIndex: 3, startHour: 9, hours: 2 })]),
      item: item('essay', { title: 'Essay', dayIndex: 3, startHour: 14 }),
    })

    await userEvent.selectOptions(screen.getByLabelText('Starts at'), '9')

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('says nothing when there is nothing to say', () => {
    setup({ item: item('essay') })

    expect(screen.queryByTestId('edit-warnings')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/week/EventForm.test.tsx`
Expected: FAIL — cannot resolve `./EventForm`.

- [ ] **Step 3: Write the component**

Create `src/ui/week/EventForm.tsx`:

```tsx
import { useState, type JSX } from 'react'
import { dateFor } from '../../domain/calendar'
import { editWarnings } from '../../domain/editWarnings'
import type { ItemFields } from '../../domain/scheduleEdits'
import {
  BLOCK_KINDS,
  LOAD_TYPES,
  type ActivityKind,
  type EngineParams,
  type LoadType,
} from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { Button } from '../kit/Button'
import { Field } from '../kit/Field'
import { BLOCK_KIND_LABELS, LOAD_TYPE_LABELS } from '../kit/labels'
import { Sheet } from '../kit/Sheet'
import { blankDraft, candidate, draftFrom, isComplete, toFields, validate } from './eventDraft'

/**
 * The day/time picker `blockActions` was waiting for.
 *
 * `Move` was specified once, wired, and then dropped, because with no picker behind it the
 * button did exactly what Later did and a student could not tell it had failed. This is
 * that picker -- and because it exists, a block can now be edited rather than only
 * answered about.
 *
 * One component for adding and for changing, because they differ in one thing: whether
 * there is a block to start from. Two components would be two copies of six fields, two
 * validation paths and two sets of warnings, and the pair would drift the first time one
 * gained a field.
 *
 * The form never refuses a save over a clash. §1.4 flags rather than silently guesses, and
 * the equivalent here is that a fortnight the student says is double-booked is recorded as
 * double-booked -- the deficit forecast then says so, which is the signal they came for.
 * `validate` covers only the impossible (no name, no length, an hour that is not an hour);
 * everything merely unwise is a warning.
 */

const INPUT = 'min-h-11 w-full rounded border border-line bg-surface px-2 py-1 text-sm text-ink'

const formatHour = (hour: number): string => `${String(hour).padStart(2, '0')}:00`

const HOURS_OF_DAY = Array.from({ length: 24 }, (_, hour) => hour)

/** What being pinned means, said once, in the terms the student would use for it. */
const pinnedNote = (item: ScheduledItem | null): string | null => {
  if (item === null) return null

  if (item.protectedRest) {
    return 'This is protected recovery — the app pinned it on purpose, and moving it is you overruling that.'
  }

  if (item.fixed) {
    return 'Your week is built around this one, so nothing else will be moved to make room for it.'
  }

  return null
}

export function EventForm({
  schedule,
  params,
  item,
  dayIndex,
  onSave,
  onClose,
  onBack,
}: {
  readonly schedule: Schedule
  readonly params: EngineParams
  /** The block being changed, or null when adding a new one. */
  readonly item: ScheduledItem | null
  /** Which day a NEW block starts on. Ignored when `item` is given, which carries its own. */
  readonly dayIndex: number
  readonly onSave: (fields: ItemFields) => void
  readonly onClose: () => void
  /** Ruling 60: one level up — to the block, when there is one; to the week otherwise. */
  readonly onBack: () => void
}): JSX.Element {
  const [draft, setDraft] = useState(() =>
    item === null ? blankDraft(schedule, dayIndex) : draftFrom(item),
  )

  const errors = validate(draft)
  const warnings = editWarnings({ schedule, item: candidate(draft, item), params })
  const note = pinnedNote(item)

  const days = Array.from({ length: schedule.horizonDays }, (_, index) => index)

  return (
    <Sheet
      title={item === null ? 'Add a block' : 'Edit this block'}
      onClose={onClose}
      onBack={onBack}
      actions={
        <Button
          data-testid="save-block"
          disabled={!isComplete(errors)}
          onClick={() => onSave(toFields(draft))}
        >
          Save
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="What" error={errors.title}>
          <input
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            className={INPUT}
          />
        </Field>

        <div className="flex flex-wrap gap-3">
          <Field label="Kind">
            <select
              value={draft.type}
              onChange={(event) => setDraft({ ...draft, type: event.target.value as LoadType })}
              className={INPUT}
            >
              {LOAD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {LOAD_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Detail">
            <select
              value={draft.kind}
              onChange={(event) => setDraft({ ...draft, kind: event.target.value as ActivityKind })}
              className={INPUT}
            >
              {BLOCK_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {BLOCK_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex flex-wrap gap-3">
          <Field label="Day" error={errors.dayIndex}>
            <select
              value={draft.dayIndex}
              onChange={(event) => setDraft({ ...draft, dayIndex: Number(event.target.value) })}
              className={INPUT}
            >
              {days.map((day) => (
                <option key={day} value={day}>
                  {dateFor(schedule, day) ?? `Day ${day}`}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Starts at" error={errors.startHour}>
            <select
              value={draft.startHour}
              onChange={(event) => setDraft({ ...draft, startHour: Number(event.target.value) })}
              className={INPUT}
            >
              {HOURS_OF_DAY.map((hour) => (
                <option key={hour} value={hour}>
                  {formatHour(hour)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Hours" error={errors.hours}>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={draft.hours}
              onChange={(event) => setDraft({ ...draft, hours: Number(event.target.value) })}
              className={INPUT}
            />
          </Field>
        </div>

        {/* §5.1's boundary, drawn where the student can see it -- the same checkbox
            `ItemChip` offers when something is first read in, offered again here because a
            block can become a fixed commitment after it was written down as a loose one. */}
        <label className="flex items-center gap-2 text-xs text-ink-soft">
          <input
            type="checkbox"
            data-testid="fixed-block"
            checked={draft.fixed}
            onChange={(event) => setDraft({ ...draft, fixed: event.target.checked })}
            className="size-4 rounded border-line"
          />
          Fixed time — a class, lab or shift the week has to work around
        </label>

        {note !== null && (
          <p data-testid="pinned-note" className="text-xs text-ink-soft">
            {note}
          </p>
        )}

        {warnings.length > 0 && (
          // `role="status"` rather than `alert`: these are things to know, not errors to
          // fix, and the Save button beside them is deliberately still live. An assertive
          // announcement would tell a screen-reader user the opposite of what is true.
          <ul data-testid="edit-warnings" role="status" className="flex flex-col gap-1">
            {warnings.map((warning) => (
              <li key={warning} className="text-xs text-attention">
                {warning}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  )
}
```

Check `dateFor`'s real signature in `src/domain/calendar.ts` before writing this line; if it takes `(schedule, dayIndex)` and returns `string | null`, the code above is correct as written.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/week/EventForm.test.tsx && npm run typecheck`
Expected: PASS, clean types.

- [ ] **Step 5: Commit**

```bash
git add src/ui/week/EventForm.tsx src/ui/week/EventForm.test.tsx
git commit -m "feat: one form for adding and changing a block by hand"
```

---

### Task 13: Edit and Remove on the block sheet

**Files:**
- Modify: `src/ui/week/blockActions.ts`, `src/ui/week/BlockSheet.tsx`
- Test: `src/ui/week/blockActions.test.ts`, `src/ui/week/BlockSheet.test.tsx`

**Interfaces:**
- Produces: `BlockAction` gains `'edit'` and `'remove'`; `BlockSheet` gains `onEdit: (itemId: string) => void` and `onRemove: (itemId: string) => void`.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/week/blockActions.test.ts`:

```ts
describe('editing and removing, which every block allows', () => {
  const cases: readonly { readonly name: string; readonly over: Partial<ScheduledItem>; readonly today: number }[] = [
    { name: 'a loose block ahead of today', over: {}, today: 0 },
    { name: 'a fixed class', over: { fixed: true }, today: 0 },
    { name: 'protected rest', over: { protectedRest: true }, today: 0 },
    { name: 'a block already in the past', over: {}, today: 5 },
  ]

  for (const { name, over, today } of cases) {
    it(`offers both on ${name}`, () => {
      const model = blockSheet({
        schedule: weekWith([item('essay', { dayIndex: 3, ...over })]),
        itemId: 'essay',
        today,
      })

      expect(model?.actions).toContain('edit')
      expect(model?.actions).toContain('remove')
    })
  }

  it('leaves the answers a block already offered exactly as they were', () => {
    const model = blockSheet({
      schedule: weekWith([item('essay', { dayIndex: 3 })]),
      itemId: 'essay',
      today: 0,
    })

    expect(model?.actions.filter((action) => action !== 'edit' && action !== 'remove')).toEqual([
      'done',
      'later',
      'cantStart',
    ])
  })
})
```

Append to `src/ui/week/BlockSheet.test.tsx`:

```tsx
describe('changing the block rather than answering about it', () => {
  it('opens the form when Edit is pressed', async () => {
    const { onEdit } = setup({ actions: ['done', 'edit', 'remove'] })

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

    expect(onEdit).toHaveBeenCalledWith('essay')
  })

  it('asks before it removes anything', async () => {
    const { onRemove } = setup({ actions: ['done', 'edit', 'remove'] })

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.getByTestId('confirm-remove')).toHaveTextContent(/takes it out of your week/i)
  })

  it('removes it once, when the question is answered yes', async () => {
    const { onRemove } = setup({ actions: ['done', 'edit', 'remove'] })

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await userEvent.click(screen.getByTestId('confirm-remove-yes'))

    expect(onRemove).toHaveBeenCalledWith('essay')
  })

  it('leaves it alone when the question is answered no', async () => {
    const { onRemove } = setup({ actions: ['done', 'edit', 'remove'] })

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }))

    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.queryByTestId('confirm-remove')).toBeNull()
  })
})
```

Add `onEdit` and `onRemove` to the file's existing `setup` helper's `vi.fn()` bag and to the rendered props.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/week/blockActions.test.ts src/ui/week/BlockSheet.test.tsx`
Expected: FAIL — `'edit'` is not assignable to `BlockAction`; no Edit button.

- [ ] **Step 3: Add the two actions**

In `src/ui/week/blockActions.ts`, replace the union and rewrite `actionsFor`'s returns. Update the module doc comment's paragraph about `move`:

```ts
/**
 * ...
 * `move` is not in this union, and now genuinely does not need to be. It was specified and
 * wired once with no day/time picker behind it, so it behaved identically to Later with no
 * way to choose where a block went -- a silent stub, dropped rather than left
 * indistinguishable from a real action. `edit` is the picker arriving: a block's day, hour
 * and length are all editable now, which is what `move` was reaching for and more.
 */
export type BlockAction =
  | 'done'
  | 'later'
  | 'cantStart'
  | 'confirm'
  | 'undo'
  | 'didRest'
  | 'edit'
  | 'remove'

/**
 * Offered on every block, whatever state it is in.
 *
 * Deliberately unconditional, where every other action here is conditional. The rest of
 * this model answers "what can be said ABOUT this block", and the answer genuinely depends
 * on whether it has happened yet. These two change what the block IS, and a student
 * correcting their own week -- a cancelled class, a tutorial that turned out to be two
 * hours -- is right to be able to do that on a fixed block, on protected rest, and on last
 * Tuesday. The form says what each of those costs; it does not refuse.
 */
const MANUAL: readonly BlockAction[] = ['edit', 'remove']
```

and in `actionsFor`, append `...MANUAL` to each of the five returns:

```ts
    if (item.protectedRest && !alreadyAsked) return ['didRest', ...MANUAL]

    return alreadyAsked ? ['undo', ...MANUAL] : ['confirm', ...MANUAL]
  }

  if (item.protectedRest) return ['didRest', ...MANUAL]

  if (item.fixed) return ['done', ...MANUAL]

  return ['done', 'later', 'cantStart', ...MANUAL]
```

In `src/ui/week/BlockSheet.tsx`, add the two props, the confirmation state, and the buttons:

```tsx
  readonly onEdit: (itemId: string) => void
  readonly onRemove: (itemId: string) => void
```

```tsx
  const [confirmingRemove, setConfirmingRemove] = useState(false)
```

Replace the returned `Sheet` so the confirmation takes over both the body and the bar:

```tsx
  /**
   * Removing is the one thing here that cannot be taken back.
   *
   * Done and Later change a block; an answer can be given again. This takes it out of the
   * week and there is no operation to put it back, so the question IS the safeguard --
   * which is why it names the block rather than asking "are you sure?" about nothing in
   * particular.
   */
  const confirmBar = (
    <>
      <Button variant="secondary" onClick={() => setConfirmingRemove(false)}>
        Keep it
      </Button>
      <Button data-testid="confirm-remove-yes" onClick={() => onRemove(item.id)}>
        Remove
      </Button>
    </>
  )

  if (confirmingRemove) {
    return (
      <Sheet title={item.title} onClose={onClose} onBack={() => setConfirmingRemove(false)} actions={confirmBar}>
        <p data-testid="confirm-remove">
          Remove {item.title}? This takes it out of your week, and I cannot put it back.
        </p>
      </Sheet>
    )
  }
```

and add to `actionBar`, after the `cantStart` block:

```tsx
      {actions.includes('edit') && (
        <Button variant="secondary" data-testid="edit-block" onClick={() => onEdit(item.id)}>
          Edit
        </Button>
      )}

      {actions.includes('remove') && (
        <Button variant="quiet" data-testid="remove-block" onClick={() => setConfirmingRemove(true)}>
          Remove
        </Button>
      )}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/week/blockActions.test.ts src/ui/week/BlockSheet.test.tsx && npm run typecheck`
Expected: PASS, clean types.

- [ ] **Step 5: Commit**

```bash
git add src/ui/week/blockActions.ts src/ui/week/blockActions.test.ts src/ui/week/BlockSheet.tsx src/ui/week/BlockSheet.test.tsx
git commit -m "feat: edit and remove a block from its own sheet"
```

---

### Task 14: Adding to the day you are looking at

**Files:**
- Modify: `src/ui/week/WeekScreen.tsx`
- Test: `src/ui/week/WeekScreen.test.tsx`

**Interfaces:**
- Produces: `WeekScreen` gains a required `onAddBlock: (dayIndex: number) => void`.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/week/WeekScreen.test.tsx`:

```tsx
describe('putting something into a day by hand', () => {
  it('offers nothing until a day is open', () => {
    setup(week([item('essay', 3)]))

    expect(screen.queryByTestId('add-block')).toBeNull()
  })

  it('offers to add to whichever day is open', async () => {
    const { onAddBlock } = setup(week([item('essay', 3)]))

    await userEvent.click(screen.getByTestId('day-3'))
    await userEvent.click(screen.getByTestId('add-block'))

    expect(onAddBlock).toHaveBeenCalledWith(3)
  })

  it('follows the open day when it changes', async () => {
    const { onAddBlock } = setup(week([item('essay', 3), item('lab', 5)]))

    await userEvent.click(screen.getByTestId('day-3'))
    await userEvent.click(screen.getByTestId('day-5'))
    await userEvent.click(screen.getByTestId('add-block'))

    expect(onAddBlock).toHaveBeenCalledWith(5)
  })
})
```

Add `onAddBlock: vi.fn()` to the file's existing `setup` helper and return it.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/week/WeekScreen.test.tsx`
Expected: FAIL — no `add-block` testid; `onAddBlock` is not a prop.

- [ ] **Step 3: Add the prop and the button**

In `src/ui/week/WeekScreen.tsx`, add to the props type and destructure:

```ts
  /** §3/§6: the fourth way in, and the only direct one. The `+` sheet's three ways all
   *  read something and work out where it goes; this one starts from a day the student is
   *  already looking at, so the day is what it hands back. */
  readonly onAddBlock: (dayIndex: number) => void
```

Wrap the existing day grid so the button sits with it. Replace `{grid !== null && (` ... `)}` with:

```tsx
      {grid !== null && openDay !== null && (
        <div className="flex flex-col gap-3">
          <div
            data-testid="day-grid"
            className="relative mx-auto w-full max-w-2xl rounded-xl border border-line bg-surface"
            style={{ minHeight: `${(grid.hours.length - 1) * 48}px` }}
          >
            {/* ...every existing child of the grid, unchanged... */}
          </div>

          {/* Under the grid rather than above it: the day is what this adds to, so it has
              to follow the day it is about -- unlike Rebalance, which acts on the whole
              fortnight and therefore sits above the grid, not with it. */}
          <Button
            variant="secondary"
            data-testid="add-block"
            onClick={() => onAddBlock(openDay)}
            className="mx-auto w-full max-w-2xl"
          >
            + Add a block to this day
          </Button>
        </div>
      )}
```

Keep every existing child of the grid `div` exactly as it is — only the wrapper and the button are new.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/week/WeekScreen.test.tsx && npm run typecheck`
Expected: PASS, clean types (`RoomShell` will fail typecheck until Task 15 — if so, run only vitest here and typecheck at the end of Task 15).

- [ ] **Step 5: Commit**

```bash
git add src/ui/week/WeekScreen.tsx src/ui/week/WeekScreen.test.tsx
git commit -m "feat: add a block to the day you have open"
```

---

### Task 15: Wiring the form into the app

**Files:**
- Modify: `src/ui/room/RoomShell.tsx`
- Test: `src/ui/RoomShell.weekModal.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 3, 8, 12, 13, 14.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/RoomShell.weekModal.test.tsx`:

```tsx
describe('editing the week by hand', () => {
  const openFirstBlock = async () => {
    await userEvent.click(screen.getByTestId('open-week'))
    const today = screen.getAllByTestId(/^day-\d+$/)[0]!
    await userEvent.click(today)
    const block = screen.getAllByTestId(/^block-/)[0]!
    await userEvent.click(block)
  }

  it('opens the edit form at its own address', async () => {
    await renderShell()
    await openFirstBlock()
    await userEvent.click(screen.getByTestId('edit-block'))

    expect(await screen.findByRole('dialog', { name: /edit this block/i })).toBeVisible()
    expect(window.location.pathname).toMatch(/^\/week\/block\/.+\/edit$/)
  })

  it('writes the change back into the week', async () => {
    await renderShell()
    await openFirstBlock()
    await userEvent.click(screen.getByTestId('edit-block'))

    const name = await screen.findByLabelText('What')
    await userEvent.clear(name)
    await userEvent.type(name, 'Renamed by hand')
    await userEvent.click(screen.getByTestId('save-block'))

    expect(await screen.findByRole('dialog', { name: /the week/i })).toBeVisible()
    expect(screen.getByText('Renamed by hand')).toBeVisible()
  })

  it('takes a removed block out of the week', async () => {
    await renderShell()
    await userEvent.click(screen.getByTestId('open-week'))
    const today = screen.getAllByTestId(/^day-\d+$/)[0]!
    await userEvent.click(today)
    const block = screen.getAllByTestId(/^block-/)[0]!
    const removedId = block.getAttribute('data-testid')
    await userEvent.click(block)

    await userEvent.click(screen.getByTestId('remove-block'))
    await userEvent.click(screen.getByTestId('confirm-remove-yes'))

    expect(await screen.findByRole('dialog', { name: /the week/i })).toBeVisible()
    expect(screen.queryByTestId(removedId!)).toBeNull()
  })

  it('adds a block where the student put it', async () => {
    await renderShell()
    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(screen.getAllByTestId(/^day-\d+$/)[0]!)
    await userEvent.click(screen.getByTestId('add-block'))

    expect(await screen.findByRole('dialog', { name: /add a block/i })).toBeVisible()
    expect(window.location.pathname).toMatch(/^\/week\/new\/\d+$/)

    await userEvent.type(screen.getByLabelText('What'), 'Coffee with Sam')
    await userEvent.click(screen.getByTestId('save-block'))

    expect(await screen.findByRole('dialog', { name: /the week/i })).toBeVisible()
    expect(screen.getByText('Coffee with Sam')).toBeVisible()
  })

  it('lands on the week when an edit address names a block that is gone', async () => {
    window.history.replaceState(null, '', '/week/block/no-such-block/edit')
    await renderShell()

    expect(await screen.findByRole('dialog', { name: /the week/i })).toBeVisible()
    expect(window.location.pathname).toBe('/week')
  })
})
```

If the seeded week's first day has no blocks, open a later day instead — do not weaken the assertion.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/RoomShell.weekModal.test.tsx`
Expected: FAIL — no Edit button reaches a form; TypeScript errors on the missing `onAddBlock`, `onEdit`, `onRemove`.

- [ ] **Step 3: Wire it up**

In `src/ui/room/RoomShell.tsx`:

Imports:

```ts
import { addBlock, completeItem, deferItem, editItem, removeItem } from '../../domain/scheduleEdits'
import { EventForm } from '../week/EventForm'
import {
  ROOM,
  toAdd,
  toBlock,
  toEditBlock,
  toNewBlock,
  toRebalance,
  toReserves,
  toSettings,
  toWeek,
} from './view'
```

Next to `blockModel`, resolve the block being edited and extend the stale guard:

```ts
  /**
   * The block an edit address names, or null.
   *
   * Resolved here rather than inside the form so a stale id -- a block completed in another
   * tab, a pasted link to something removed -- is handled the same way `blockSheet` already
   * handles it, by landing somewhere real, rather than by the form rendering an empty
   * shape.
   */
  const editing =
    view.kind === 'editBlock'
      ? (week.items.find((candidate) => candidate.id === view.itemId) ?? null)
      : null

  const proposalIsStale = view.kind === 'rebalance' && proposal === null
  const editTargetIsGone = view.kind === 'editBlock' && editing === null

  useEffect(() => {
    if (proposalIsStale || editTargetIsGone) setView(toWeek())
    // `setView` is rebuilt every render; listing it would re-run this on every render.
  }, [proposalIsStale, editTargetIsGone]) // eslint-disable-line react-hooks/exhaustive-deps
```

Merge this with the effect added in Task 5 rather than adding a second one.

On the existing `BlockSheet`, add:

```tsx
          onEdit={(itemId) => setView(toEditBlock(itemId))}
          onRemove={(itemId) => {
            setSchedule(removeItem(week, itemId))
            setView(toWeek())
          }}
```

On the existing `WeekScreen`, add:

```tsx
            onAddBlock={(day) => setView(toNewBlock(day))}
```

And add the two form branches to `sheets`:

```tsx
      {view.kind === 'editBlock' && editing !== null && (
        <EventForm
          key={`edit-${view.itemId}`}
          schedule={week}
          params={params}
          item={editing}
          dayIndex={editing.dayIndex}
          onSave={(fields) => {
            setSchedule(editItem(week, view.itemId, fields))
            setView(toWeek())
          }}
          onBack={goBack}
          onClose={closeToRoom}
        />
      )}

      {view.kind === 'newBlock' && (
        <EventForm
          key={`new-${view.dayIndex}`}
          schedule={week}
          params={params}
          item={null}
          dayIndex={view.dayIndex}
          onSave={(fields) => {
            setSchedule(addBlock(week, fields))
            setView(toWeek())
          }}
          onBack={goBack}
          onClose={closeToRoom}
        />
      )}
```

Both return to the week rather than the room: the student is managing their fortnight, and landing back on the room after every save would make editing three blocks a six-step journey.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/RoomShell.weekModal.test.tsx && npm run typecheck`
Expected: PASS, clean types.

- [ ] **Step 5: Run the whole suite and commit**

```bash
npx vitest run
git add src/ui/room/RoomShell.tsx src/ui/RoomShell.weekModal.test.tsx
git commit -m "feat: reach the edit form from the block and from the day"
```

---

### Task 16: Full verification

**Files:** none — this task produces evidence, not code.

- [ ] **Step 1: Run the whole unit suite**

Run: `npx vitest run`
Expected: every test file passes; total count ≥ 1747 + the new tests; 0 failures.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Drive it by hand**

Run: `npm run dev`, then in the browser:

1. Open the week, tap Rebalance. Confirm a sheet titled "What I'd change" opens at `/week/rebalance` and lists individual moves.
2. Press Discard. Confirm the week is visually unchanged and no report line appeared.
3. Tap Rebalance again, press Approve. Confirm the week changes and the past-tense report appears.
4. Reload while on `/week/rebalance`. Confirm the address becomes `/week`.
5. Open a day, tap a block, tap Edit. Change the day and the start hour, Save. Confirm the block appears on the new day at the new hour.
6. Edit a block onto the same hour as a class. Confirm the warning names the class and Save still works.
7. Tap a block, tap Remove. Confirm the question names the block; press Keep it, confirm nothing changed; press Remove, confirm it is gone.
8. Open a day, press "+ Add a block to this day". Add one, Save, reload the page. Confirm it is still there.
9. Narrow the window to 320px and repeat 5 and 8. Confirm no horizontal scrolling and every control is reachable.

- [ ] **Step 5: Commit any fixes and report**

Run the `code-review`, `security-check` (static layer), `verification-before-completion` and `completion-report` skills, in that order, per the project's Feature Development Workflow.

---

## Self-Review

**Spec coverage.** Every section of the approved plain-language plan maps to a task: the preview sheet (4), holding rather than applying (5), the conditional tense (1), the widened outcome (2), the three addresses (3), field-level editing (8, 11, 12), locked blocks editable with a note (12), clashes warned not forbidden (9, 12), Remove with a confirmation and commitment pruning (7, 8, 13), adding from an open day (11, 14), and the shared vocabulary (10). Wiring is 15; verification is 16.

**Placeholder scan.** No TBDs. Every code step carries real code. Three places name a check to make against the existing file rather than assuming (`dateFor`'s signature in Task 12, `testSupport`'s export shape in Tasks 6 and 9, the seeded week's first populated day in Task 15) — these are reads, not deferred decisions.

**Type consistency.** `ItemFields` is defined in Task 8 and consumed by Tasks 11, 12 and 15 under that name. `editWarnings`'s argument object (`{ schedule, item, params }`) is identical in Tasks 9 and 12. `candidate(draft, existing)` is defined in Task 11 and called with the same argument order in Task 12. `RebalanceOutcome`'s `proposal` field is written in Task 2 and read in Tasks 4 and 5. `NEW_ITEM_ID` is defined in Task 11 and its purpose is described against `editWarnings`'s id-exclusion from Task 9.

**Known interaction to watch:** Task 14 makes `onAddBlock` a required prop, which breaks `RoomShell`'s typecheck until Task 15. The tasks are ordered so that gap is one task wide and the plan says so in Task 14's step 4.
