# Recovery Prescriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn "you are sinking" into one thing a depleted student can actually do — §5.2's category-matched prescriptions and §5.3's get-out-of-the-house mode.

**Architecture:** `prescribe()` reads the lowest reserve and the week's own free time and returns exactly one action. `outings.ts` is a curated list of place *types* filtered by the gap you have; choosing one schedules it as protected rest the optimizer cannot move. What did not help is remembered inside the saved week, so it stops being suggested.

**Tech Stack:** React 19, TypeScript 7 (strict, `noUncheckedIndexedAccess`), Tailwind 4, Vitest 4 + Testing Library, Playwright. No model, no key, no network.

**Spec:** Approved plain-language plan at `C:\Users\den51\.claude\plans\crispy-floating-river.md`. Product spec [`burnout-app-spec-v3.md`](../../../burnout-app-spec-v3.md) §5 (all of it), §11's must-build tier, §1.3's room. Read all three.

**Base:** `main` at `0f19037`.

## Already built — do not re-implement

Two of §11's four Focus 5 must-builds exist and are tested. Read them before starting; the
new code depends on both being true.

- **Protected rest blocks.** `src/optimizer/constraints.ts:57` refuses to overlap them and
  `neighbours.ts:27` refuses to move them. §5.1 calls this the most important design decision
  in the app. Unit 3 relies on it: an outing is scheduled *as* protected rest, and that is
  what makes "protected" mean something rather than being a label.
- **The recovery quality ceiling.** `USEFUL_REST_HOURS = 3` in `src/engine/recovery.ts` caps
  what a single block can pay out. Unit 1 must not suggest a block longer than this and call
  it recovery — the model would not credit the excess, so the suggestion would be quietly
  dishonest.

## Global Constraints

- **One prescription, never a menu** (§5.2). A depleted person cannot choose from a list, and
  every extra option lowers the odds of any action. `prescribe()` returns one thing or
  nothing — never an array.
- **Matched to the depleted type** (§5.2). Social low prescribes a person; physical low
  prescribes movement; mental low prescribes actual downtime, *not* a different screen. This
  is the same conviction the engine already encodes by refusing to let sleep cure loneliness.
- **Sized to the real gap** (§5.2), and never longer than `USEFUL_REST_HOURS`.
- **No live maps call** (§5.3). The list is part of the app: instant, offline, no key, and it
  cannot fail on stage or leak a location.
- **No invented place names.** The list is place *types*. The user chose this deliberately —
  names I cannot verify would be fabricated, and a judge who knows the campus would spot it.
- **`src/engine/**` and `src/optimizer/**` logic must not change.** One additive optional
  field on `Schedule` is the only exception, and nothing in either package may read it.
- **Backwards compatibility:** weeks saved before this must still load. Tested.
- **Responsive at 320 / 390 / 768 / 1280px.**
- **Immutability**; files 200–400 lines; functions under 50 lines.
- **TDD, red before green.** Tests ship in the same commit as behaviour.
- **Coverage thresholds only go up.** Currently 97 / 91 / 97 / 98.
- **Never `git push`** without explicit confirmation. (Merging after CI is green is
  authorised for this session; a red build or a conflict stops and reports instead.)
- **Commit format:** `<type>: <description>`, ending `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

### Fixed values

| Constant | Value | Rationale |
|---|---|---|
| `PRESCRIBE_BELOW` | `40` | Below the comfortable band but above §1.5's low-energy threshold of 20, so advice arrives before the reduced view takes over. |
| `MIN_GAP_HOURS` | `0.5` | Under half an hour there is nothing worth scheduling, and suggesting one would be noise. |
| `MAX_BLOCK_HOURS` | `3` | `USEFUL_REST_HOURS`. Past this the engine stops crediting recovery, so suggesting longer would be dishonest. |
| `DEFAULT_GAP_HOURS` | `1` | Used when the day is empty and there is no gap to measure. |

---

## File Structure

```
src/
  domain/
    prescribe.ts           lowest reserve + free gap -> one action
    prescribe.test.ts
    outings.ts             the curated list, and filtering it by gap
    outings.test.ts
    recoveryLog.ts         what was tried, and whether it helped
    recoveryLog.test.ts
  optimizer/
    types.ts               MODIFY: one optional field on Schedule
  ui/
    recovery/
      Prescription.tsx     the one suggested action
      Prescription.test.tsx
      DoorPanel.tsx        the three outings
      DoorPanel.test.tsx
    room/
      ObjectDetail.tsx     MODIFY: the lit door opens the panel
    HomeScreen.tsx         MODIFY: surface the prescription
    HomeScreen.recovery.test.tsx
tests/e2e/
  recovery.spec.ts
```

---

## Task 1: One thing to do

**Files:**
- Create: `src/domain/prescribe.ts`, `src/domain/prescribe.test.ts`

**Interfaces:**
- Consumes: `Reserves`, `LoadType` (`src/engine`), `Schedule` (`src/optimizer`).
- Produces:
  - `interface Prescription { readonly id: string; readonly type: LoadType; readonly kind: ActivityKind; readonly title: string; readonly hours: number; readonly dayIndex: number; readonly startHour: number }`
  - `function freeGapOn(schedule: Schedule, dayIndex: number): number`
  - `function prescribe(schedule: Schedule, log?: readonly RecoveryAttempt[]): Prescription | null`

- [ ] **Step 1: Write the failing test**

`src/domain/prescribe.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { freeGapOn, prescribe } from './prescribe'

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'a',
  title: 'Study',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 0,
  startHour: 10,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const low = (type: 'mental' | 'physical' | 'social') => ({
  mental: type === 'mental' ? 15 : 70,
  physical: type === 'physical' ? 15 : 70,
  social: type === 'social' ? 15 : 70,
  errands: 70,
})

describe('freeGapOn', () => {
  it('reports a default when the day is empty', () => {
    expect(freeGapOn(week(), 0)).toBeGreaterThan(0)
  })

  it('shrinks as the day fills up', () => {
    const busy = week({ items: [item({ hours: 6 }), item({ id: 'b', hours: 6, startHour: 16 })] })

    expect(freeGapOn(busy, 0)).toBeLessThan(freeGapOn(week(), 0))
  })

  it('never reports a negative gap on an overfull day', () => {
    const overfull = week({ items: [item({ hours: 30 })] })

    expect(freeGapOn(overfull, 0)).toBeGreaterThanOrEqual(0)
  })
})

describe('prescribe', () => {
  it('says nothing when nothing is low', () => {
    expect(prescribe(week())).toBeNull()
  })

  /**
   * §5.2's matching, which is the whole point. The engine already refuses to let sleep cure
   * loneliness; this is that same conviction pointed at the advice instead of the maths.
   */
  it('prescribes a person when social is low', () => {
    const out = prescribe(week({ start: low('social') }))

    expect(out?.type).toBe('social')
    expect(out?.kind).toBe('socialRestorative')
    expect(out?.title).toMatch(/someone|person|friend/i)
  })

  it('prescribes movement when physical is low', () => {
    const out = prescribe(week({ start: low('physical') }))

    expect(out?.type).toBe('physical')
    expect(out?.title).toMatch(/walk|move|outside/i)
  })

  // "Actual downtime, not a different screen" -- §5.2, near verbatim.
  it('prescribes real downtime when mental is low, not another screen', () => {
    const out = prescribe(week({ start: low('mental') }))

    expect(out?.type).toBe('mental')
    expect(out?.kind).toBe('rest')
    expect(out?.title).not.toMatch(/app|screen|phone|scroll/i)
  })

  it('answers the lowest reserve when more than one is low', () => {
    const out = prescribe(
      week({ start: { mental: 12, physical: 18, social: 19, errands: 70 } }),
    )

    expect(out?.type).toBe('mental')
  })

  // §5.2: one option only. A depleted person cannot choose from a menu.
  it('returns exactly one thing, never a list', () => {
    const out = prescribe(week({ start: low('social') }))

    expect(Array.isArray(out)).toBe(false)
    expect(out).not.toBeNull()
  })

  it('sizes the suggestion to the gap that actually exists', () => {
    const roomy = prescribe(week({ start: low('physical') }))
    const packed = prescribe(
      week({ start: low('physical'), items: [item({ hours: 10 })] }),
    )

    expect(packed?.hours).toBeLessThanOrEqual(roomy?.hours ?? 0)
  })

  /**
   * Past three hours the engine stops crediting a rest block at all, so suggesting a longer
   * one would promise recovery the model would refuse to pay out.
   */
  it('never suggests a block longer than the engine will credit', () => {
    const out = prescribe(week({ start: low('mental') }))

    expect(out?.hours).toBeLessThanOrEqual(3)
  })

  it('says nothing when there is no real gap to put it in', () => {
    const packed = week({ start: low('mental'), items: [item({ hours: 24 })] })

    expect(prescribe(packed)).toBeNull()
  })

  it('places it on a real day within the horizon', () => {
    const out = prescribe(week({ start: low('social') }))

    expect(out?.dayIndex).toBeGreaterThanOrEqual(0)
    expect(out?.dayIndex).toBeLessThan(HORIZON_DAYS)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/domain/prescribe.test.ts`
Expected: FAIL — cannot resolve `./prescribe`.

- [ ] **Step 3: Implement**

`src/domain/prescribe.ts`:

```ts
import { LOAD_TYPES, type ActivityKind, type LoadType, type Reserves } from '../engine'
import type { Schedule } from '../optimizer'
import type { RecoveryAttempt } from './recoveryLog'

/** Below the comfortable band, but above §1.5's low-energy threshold of 20 -- so advice
 *  arrives before the reduced view takes over, rather than after. */
const PRESCRIBE_BELOW = 40

/** Under half an hour there is nothing worth scheduling, and suggesting one is noise. */
const MIN_GAP_HOURS = 0.5

/** USEFUL_REST_HOURS. Past this the engine credits nothing, so a longer suggestion would
 *  promise recovery the model refuses to pay out. */
const MAX_BLOCK_HOURS = 3

/** Used when a day is empty and there is no gap to measure. */
const DEFAULT_GAP_HOURS = 1

/** Waking hours available in a day, once sleep is set aside. */
const WAKING_HOURS = 16

export interface Prescription {
  readonly id: string
  readonly type: LoadType
  readonly kind: ActivityKind
  readonly title: string
  readonly hours: number
  readonly dayIndex: number
  readonly startHour: number
}

/**
 * §5.2's matching, stated once.
 *
 * Social low prescribes a person, physical low prescribes movement, mental low prescribes
 * actual downtime -- explicitly not a different screen. Errands is absent on purpose: a
 * depleted errands reserve is answered by the room's clutter boxes, which already let a
 * student clear one, and prescribing "do a chore" to someone who is flat would be advice
 * nobody follows.
 */
const ADVICE: Partial<Record<LoadType, { kind: ActivityKind; title: string }>> = {
  social: { kind: 'socialRestorative', title: 'Message someone you like and see them' },
  physical: { kind: 'lightExercise', title: 'Get outside and walk' },
  mental: { kind: 'rest', title: 'Stop and do nothing — no screen' },
}

/** Hours left on a day once everything scheduled is accounted for. */
export function freeGapOn(schedule: Schedule, dayIndex: number): number {
  const busy = schedule.items
    .filter((item) => item.dayIndex === dayIndex)
    .reduce((total, item) => total + item.hours, 0)

  return Math.max(0, WAKING_HOURS - busy)
}

const lowestOf = (reserves: Reserves): LoadType =>
  LOAD_TYPES.reduce((lowest, type) => (reserves[type] < reserves[lowest] ? type : lowest))

/**
 * One thing to do, matched to what is actually empty.
 *
 * Returns a single prescription or nothing at all -- never a list. §5.2 is blunt that a
 * depleted person cannot choose from a menu and that every extra option lowers the odds of
 * any action, so the shape of this return type is the feature.
 */
export function prescribe(
  schedule: Schedule,
  log: readonly RecoveryAttempt[] = [],
): Prescription | null {
  const type = lowestOf(schedule.start)
  if (schedule.start[type] >= PRESCRIBE_BELOW) return null

  const advice = ADVICE[type]
  if (!advice) return null

  // §5.2: what did not work stops being suggested.
  if (log.some((attempt) => attempt.kind === advice.kind && !attempt.helped)) return null

  const gap = Math.min(freeGapOn(schedule, 0) || DEFAULT_GAP_HOURS, MAX_BLOCK_HOURS)
  if (gap < MIN_GAP_HOURS) return null

  return {
    id: `prescription-${advice.kind}`,
    type,
    kind: advice.kind,
    title: advice.title,
    hours: Math.round(gap * 2) / 2,
    dayIndex: 0,
    // Late afternoon: a gap a student will plausibly still have, rather than first thing.
    startHour: 16,
  }
}
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/domain && npm run typecheck`

```bash
git add src/domain
git commit -m "$(cat <<'EOF'
feat: prescribe one thing, matched to what is actually empty

§5.2's matching, and it is the same conviction the engine already
encodes by refusing to let sleep cure loneliness -- pointed at the
advice this time rather than the maths. Social low prescribes a person,
physical low prescribes movement, mental low prescribes actual downtime
and explicitly not another screen.

The return type is the feature: one prescription or nothing, never a
list. §5.2 is blunt that a depleted person cannot choose from a menu and
that every extra option lowers the odds of any action at all, so the
shape makes a menu impossible rather than merely discouraged.

Sized to the gap the week actually has, and never longer than the three
hours the engine will credit -- past that recoveryForDay pays out
nothing, so a longer suggestion would promise recovery the model refuses
to give.

Errands is deliberately absent from the table. A depleted errands
reserve is already answered by the room's clutter boxes, and telling
someone who is flat to do a chore is advice nobody follows.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: What did not work stops being suggested

**Files:**
- Create: `src/domain/recoveryLog.ts`, `src/domain/recoveryLog.test.ts`
- Modify: `src/optimizer/types.ts`

**Interfaces:**
- Produces:
  - `interface RecoveryAttempt { readonly kind: ActivityKind; readonly helped: boolean }`
  - `function recordAttempt(schedule: Schedule, kind: ActivityKind, helped: boolean): Schedule`
  - `function attemptsIn(schedule: Schedule): readonly RecoveryAttempt[]`

- [ ] **Step 1: Write the failing test**

`src/domain/recoveryLog.test.ts` covers, each individually:

- Recording an attempt puts it in the week.
- Both outcomes are recorded — helped and did not help.
- Earlier attempts are kept.
- The week passed in is not modified.
- A week with no log reads as an empty list rather than throwing.
- **A week saved before this feature loads and reads as empty.** Same test as commitments
  had, for the same reason: it is what makes "no migration" safe rather than convenient.
- A prescription whose kind was marked unhelpful is not returned by `prescribe` — the
  behaviour this whole unit exists for, asserted through the real entry point rather than by
  inspecting the log.
- One marked as helping is still offered.

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Add the field**

In `src/optimizer/types.ts`, alongside `commitments`:

```ts
  /**
   * What recovery was tried and whether it helped (§5.2).
   *
   * Carried inside the week for the same reason `commitments` is: no migration, no adapter
   * change, and it is genuinely part of the week. Optional because weeks saved before this
   * have no such field and must keep loading. Nothing in `src/engine` or `src/optimizer`
   * reads it.
   */
  readonly recoveryLog?: readonly RecoveryAttempt[]
```

with `RecoveryAttempt` defined alongside `Commitment` and exported from
`src/optimizer/index.ts`.

- [ ] **Step 4: Implement, run and commit**

`recordAttempt` spreads a new attempt onto `schedule.recoveryLog ?? []`; `attemptsIn` returns
`schedule.recoveryLog ?? []`. Both pure, both immutable.

```bash
git commit -m "$(cat <<'EOF'
feat: stop suggesting the recovery that did not work

§5.2's last line, and the one that makes the prescriptions worth
trusting over time: if lying down does nothing but a walk works, the app
stops prescribing the failure. Suggesting the same useless thing twice
is how advice stops being read at all.

Rides inside the saved week, exactly as commitments do -- no migration,
no adapter change, nothing for anyone to run. Optional field, because
weeks saved before this must keep loading, and there is a test for that
rather than an assumption.

Asserted through prescribe() rather than by inspecting the log, because
what matters is that the suggestion changes, not that a row was written.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Three taps from feeling bad to having a plan

**Files:**
- Create: `src/domain/outings.ts`, `src/domain/outings.test.ts`

**Interfaces:**
- Produces:
  - `interface Outing { readonly id: string; readonly title: string; readonly hours: number; readonly costRinggit: number; readonly note: string }`
  - `function outingsFor(gapHours: number, budgetRinggit?: number): Outing[]`

- [ ] **Step 1: Write the failing test**

`src/domain/outings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { outingsFor } from './outings'

describe('outingsFor', () => {
  // §5.3: "three nearby options filtered by gap and budget".
  it('offers three when there is room for three', () => {
    expect(outingsFor(3, 50)).toHaveLength(3)
  })

  it('never offers more than three, however much room there is', () => {
    expect(outingsFor(12, 1000).length).toBeLessThanOrEqual(3)
  })

  it('offers nothing that will not fit the gap', () => {
    for (const outing of outingsFor(0.75, 50)) {
      expect(outing.hours).toBeLessThanOrEqual(0.75)
    }
  })

  it('offers nothing that costs more than the budget', () => {
    for (const outing of outingsFor(3, 0)) {
      expect(outing.costRinggit).toBe(0)
    }
  })

  // A student with twenty minutes should still be told something, not nothing.
  it('still finds something for a very short gap', () => {
    expect(outingsFor(0.5, 0).length).toBeGreaterThan(0)
  })

  it('offers nothing at all when there is genuinely no time', () => {
    expect(outingsFor(0, 50)).toEqual([])
  })

  it('has no budget limit when none is given', () => {
    expect(outingsFor(3).length).toBeGreaterThan(0)
  })

  /**
   * The list ships as place *types*, not place names. Names near a specific campus would be
   * fabricated -- nobody verified them -- and a judge who knows the area would spot it. This
   * test is what stops a well-meaning later edit from adding one.
   */
  it('names no specific place', () => {
    for (const outing of outingsFor(3, 100)) {
      expect(outing.title).not.toMatch(/\b(taman|jalan|mall|university of|UM)\b/i)
    }
  })

  it('says how long each takes and what it costs, so the choice is real', () => {
    for (const outing of outingsFor(3, 100)) {
      expect(outing.hours).toBeGreaterThan(0)
      expect(outing.costRinggit).toBeGreaterThanOrEqual(0)
      expect(outing.note.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement**

`src/domain/outings.ts`:

```ts
export interface Outing {
  readonly id: string
  readonly title: string
  readonly hours: number
  readonly costRinggit: number
  readonly note: string
}

/**
 * The curated list §5.3 asks for, as place *types* rather than place names.
 *
 * Curated rather than a live maps call because §5.3 says so: it is instant, it works
 * offline, it needs no key, it cannot fail during judging, and it never sends a location
 * anywhere.
 *
 * Types rather than names because names near a particular campus would be invented -- there
 * is no source for them here -- and a judge who knows the area would see through it
 * immediately. This shape also works on any campus. Swapping in genuine local spots later is
 * an edit to this array and nothing else.
 *
 * Ordered cheapest and shortest first, so the three offered to someone with a small gap are
 * the three they can actually take.
 */
const OUTINGS: readonly Outing[] = [
  {
    id: 'walk',
    title: 'A short walk, no destination',
    hours: 0.5,
    costRinggit: 0,
    note: 'Out the door and back. Nothing to plan.',
  },
  {
    id: 'green',
    title: 'A green space within ten minutes',
    hours: 1,
    costRinggit: 0,
    note: 'Somewhere with trees and no ceiling.',
  },
  {
    id: 'cafe',
    title: 'A café you can sit in',
    hours: 1.5,
    costRinggit: 15,
    note: 'Somewhere you are allowed to do nothing.',
  },
  {
    id: 'errand-walk',
    title: 'A shop worth the walk',
    hours: 2,
    costRinggit: 25,
    note: 'A small reason to be outside, if you need one.',
  },
  {
    id: 'someone',
    title: 'Meet someone for an hour',
    hours: 2,
    costRinggit: 20,
    note: 'The one that helps most when the low reserve is social.',
  },
]

/** §5.3: "three nearby options filtered by gap and budget". Three because "where should I
 *  go" needs recognition, unlike §5.2's "what should I do", where a menu is paralysing. */
const HOW_MANY = 3

export function outingsFor(gapHours: number, budgetRinggit = Number.POSITIVE_INFINITY): Outing[] {
  return OUTINGS.filter(
    (outing) => outing.hours <= gapHours && outing.costRinggit <= budgetRinggit,
  ).slice(0, HOW_MANY)
}
```

- [ ] **Step 4: Run and commit**

```bash
git commit -m "$(cat <<'EOF'
feat: give the lit door somewhere to send you

§5.3, which the brief named explicitly so it would become an interface
element rather than a message. The door already lit up; this is the list
it opens onto, filtered by the gap you actually have and by what you can
spend.

Three options here, one prescription in §5.2 -- not a contradiction.
They answer different questions. "What should I do" is paralysing as a
menu; "where should I go" needs enough choice to recognise somewhere you
would genuinely walk to, and naming one park is a worse answer than
offering three.

Curated rather than a live maps call, per §5.3: instant, offline, no
key, cannot fail during judging, and it never sends a location
anywhere.

Place types rather than place names, and there is a test asserting no
specific place is named. Names near a particular campus would be
invented -- there is no source for them here -- and a judge who knows the
area would see through it. Real local spots can be swapped in later by
editing one array.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: The panel, and the one suggested action

**Files:**
- Create: `src/ui/recovery/Prescription.tsx`, `src/ui/recovery/Prescription.test.tsx`, `src/ui/recovery/DoorPanel.tsx`, `src/ui/recovery/DoorPanel.test.tsx`

**Interfaces:**
- Produces:
  - `Prescription({ prescription, onAccept, onDismiss })`
  - `DoorPanel({ gapHours, onChoose, onClose })`

- [ ] **Step 1: Write the failing tests**

`Prescription.test.tsx` covers: shows the one action and how long it takes; accepting hands
the prescription back; **dismissing reports it as not having helped**, which is what feeds
Task 2; renders nothing when there is no prescription; **offers exactly one action** — no
second button that is also an action.

`DoorPanel.test.tsx` covers: shows three options; each names its time and cost; choosing one
hands it back; can be closed; shows a sentence rather than an empty list when the gap is too
small; **every option is reachable by keyboard**, since this is the flow a depleted student
uses.

- [ ] **Step 2: Run and watch fail**

- [ ] **Step 3: Implement**

Follow `src/ui/request/LapsedNotice.tsx` for structure and Tailwind idiom. Both components
are presentational — no data loading, no dynamic import (there is no parser here and nothing
to lazy-load).

- [ ] **Step 4: Run and commit**

---

## Task 5: Where it appears

**Files:**
- Modify: `src/ui/room/ObjectDetail.tsx`, `src/ui/HomeScreen.tsx`
- Create: `src/ui/HomeScreen.recovery.test.tsx`, `tests/e2e/recovery.spec.ts`

- [ ] **Step 1: Write the failing test**

`src/ui/HomeScreen.recovery.test.tsx`, mirroring `HomeScreen.request.test.tsx`:

- A low reserve surfaces one prescription; a comfortable week surfaces none.
- Accepting it puts protected rest in the **saved** week — checked against storage.
- **The optimizer cannot then move it**: assert the saved item has `protectedRest: true`,
  which `constraints.ts` and `neighbours.ts` already enforce and their own tests already
  prove.
- Dismissing it records the attempt and the same prescription is not offered again.
- Tapping the lit door opens three options rather than a sentence.
- Choosing one puts it in the saved week as protected rest.
- The room still renders alongside — the prescription sits next to it, not instead of it.

`tests/e2e/recovery.spec.ts`: the door flow end to end in a real browser, and the four widths.

- [ ] **Step 2: Run and watch fail**

- [ ] **Step 3: Wire it in**

In `ObjectDetail.tsx`, when `objectId === 'door'` and `state.doorLit`, render `DoorPanel`
instead of the sentence. Keep the unlit sentence exactly as it is — a quiet door still
explains itself.

In `HomeScreen.tsx`, compute `prescribe(schedule, attemptsIn(schedule))` and render
`Prescription` above the room, beside the lapsed notice. Accepting adds protected rest via a
small local helper (not `addItems`, which deliberately never creates protected rest — see its
own comment; a prescription is the app's own suggestion accepted by the student, not a
proposal parsed from text, and that distinction is exactly what `addItems` guards).

- [ ] **Step 4: Run everything**

```bash
npm run typecheck
npm run test:coverage
npm run build
PORT=5199 npx playwright test --workers=1
```

Use `--workers=1` and a free port while the sibling worktree runs.

- [ ] **Step 5: Commit**

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| §5.2 matched to the depleted type | 1 |
| §5.2 sized to the real gap | 1 |
| §5.2 one option only | 1 — enforced by the return type, not by convention |
| §5.2 failed recovery is logged | 2 |
| §5.3 door lights up when it is the highest-value move | **Already built** (`roomState.ts`) |
| §5.3 tap it, get three filtered by gap and budget | 3, 4 |
| §5.3 tap one, it is scheduled and protected | 5 |
| §5.3 curated list, not a live maps call | 3 |
| §5.1 protected rest blocks | **Already built** (`constraints.ts`, `neighbours.ts`) |
| §5.1 recovery ceiling | **Already built** (`recovery.ts`) |
| §5.4 recovery receipt | **Not built.** §11: "if time allows", and it needs §7.9's data. |
| §5.5 social recovery via a friend | **Not built.** Roadmap slide; needs other users. |
| §5.3 optional "refuse to help you work" stance | **Not built.** Not requested, and not a mode to add unasked. |

**Placeholder scan:** none. Tasks 4 and 5 name reference implementations rather than
repeating their code, deliberately — those files exist and are tested, and copying them here
would let the two drift.

**Type consistency:** `Prescription` is defined in Task 1 and consumed in 4 and 5.
`RecoveryAttempt` is defined in Task 2's change to `src/optimizer/types.ts` and consumed in 1,
2 and 5. `Outing` is defined in Task 3 and consumed in 4 and 5. `prescribe(schedule, log)`
matches between its definition and both call sites.

**Two risks recorded:**

1. **`prescribe` looks only at day 0.** "Today" is day 0 everywhere in this app because the
   engine is pure and has no calendar — the same limitation the request box records. A
   student whose day 0 is full gets no prescription even if tomorrow is empty. Honest, and
   cheap to widen later; widening it now would mean inventing a notion of "soon" that the
   model does not have.
2. **`freeGapOn` treats a day as sixteen waking hours minus scheduled time.** It ignores
   *when* those hours fall, so a day with two hours free at 3am reads the same as one free at
   3pm. §5.2 asks for "40 minutes free at 3pm gets a 40-minute suggestion, at 3pm" — the
   duration half is honoured, the placement half is not. Within-day sequencing is filed under
   "high value if time allows" in §11, and this is the same gap. Say so in the pull request.
