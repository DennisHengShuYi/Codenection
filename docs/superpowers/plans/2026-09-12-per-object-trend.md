# Per-Object Trend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each Today panel row a short phrase saying whether that object's load is growing or easing over today and the next two days, and repoint the five reserve bars' trend arrows at the days around today instead of the end of the fortnight.

**Architecture:** `trendOf` gains an optional sensitivity so one window-and-flat-band implementation serves both a 0–100 reserve scale and an hours/counts scale. A new `src/ui/room/objectTrend.ts` owns "which way is this object's load heading" and the wording for each answer; `panelRowsFor` calls it per row and `PanelRow` carries the phrase. Separately `domainBars` takes `today` and slices the projection before trending.

**Tech Stack:** TypeScript, React 19, Vitest + Testing Library, Playwright.

**Spec:** `C:\Users\den51\.claude\plans\twinkly-giggling-cupcake.md` (the approved plain-language plan). Product source: the Loadline SEE bullet, *"tap an object to see its load, contributing factors, and trends."*

## Global Constraints

- **Words, not arrows, on the panel.** On a reserve bar `▲` means the reserve rose, which is good; on an object's load, rising hours is bad. One glyph must not mean opposite things two taps apart.
- **Nothing rendered when flat.** A phrase on a row with nothing behind it is a claim. The reserve bars already follow this rule (`bar.trend !== null &&`).
- **Never as an obligation.** Rest's row says rest "is not a duty you owe anyone"; its phrase describes room available, never a shortfall. Product philosophy: suggestions must never feel like punishment.
- **Window is today and the next two days**, forward-looking, read from the schedule.
- **`TREND_WINDOW_DAYS = 3` and the existing `1.5` default are unchanged**, so the reserve bars keep the sensitivity they have.
- Every behaviour change ships with its tests in the same commit (`.claude/CLAUDE.md`). No assertion weakened, nothing skipped.

---

### Task 1: `trendOf` takes a sensitivity

**Files:**
- Modify: `src/ui/dial/trend.ts:9`, `src/ui/dial/trend.ts:18-28`
- Test: `src/ui/dial/trend.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `trendOf(series: readonly number[], epsilon?: number): Trend`, default `epsilon = TREND_EPSILON` (1.5). `export type Trend = 'rising' | 'flat' | 'falling'` unchanged.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe` in `src/ui/dial/trend.test.ts`:

```typescript
  /**
   * The default is calibrated for reserve points, where 1.5 on a 0-100 scale is noise. In
   * hours it is a large change -- three days moving 2h to 3.4h would read flat -- so the
   * caller that measures hours passes its own. Pinned in both directions so neither the
   * default nor the parameter can drift unnoticed.
   */
  it('keeps its reserve-point default when no sensitivity is given', () => {
    expect(trendOf([50, 50.4, 50.8])).toBe('flat')
    expect(trendOf([50, 51, 52])).toBe('rising')
  })

  it('takes a sensitivity for a caller on a different scale', () => {
    expect(trendOf([2, 2.5, 3], 0.5)).toBe('rising')
    expect(trendOf([2, 2.5, 3], 5)).toBe('flat')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/dial/trend.test.ts`
Expected: `takes a sensitivity for a caller on a different scale` FAILS — the second argument is ignored, so `trendOf([2, 2.5, 3], 5)` returns `'rising'` rather than `'flat'`. The default-keeping test passes already; that is deliberate, it is a regression guard.

- [ ] **Step 3: Write the minimal implementation**

In `src/ui/dial/trend.ts`, change the constant's comment and the signature:

```typescript
/** Reserve points, and the default because reserves were the first caller. Below this a bar
 *  reads flat rather than flickering between arrows on noise -- which would make the glyph
 *  useless in exactly the place §1.5 relies on it to carry severity without colour.
 *
 *  A caller measuring something other than reserve points passes its own: 1.5 is noise on a
 *  0-100 scale and most of a day's study on an hours one. */
const TREND_EPSILON = 1.5
```

and

```typescript
export function trendOf(series: readonly number[], epsilon: number = TREND_EPSILON): Trend {
  const window = series.slice(-TREND_WINDOW_DAYS)
  if (window.length < 2) return 'flat'

  const first = window[0]!
  const last = window[window.length - 1]!
  const change = last - first

  if (Math.abs(change) < epsilon) return 'flat'
  return change > 0 ? 'rising' : 'falling'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/dial/trend.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/ui/dial/trend.ts src/ui/dial/trend.test.ts
git commit -m "refactor: let trendOf take the sensitivity its caller's scale needs"
```

---

### Task 2: `objectTrend` — the direction and the words

**Files:**
- Create: `src/ui/room/objectTrend.ts`
- Test: `src/ui/room/objectTrend.test.ts`

**Interfaces:**
- Consumes: `trendOf(series, epsilon?)` and `type Trend` from `src/ui/dial/trend.ts`; `blocksOnDay(schedule, dayIndex)` from `src/domain/dayBlocks.ts`; `type ActivityKind` from `src/engine`; `type Schedule` from `src/optimizer`.
- Produces:
  - `export const TREND_DAYS = 3`
  - `export const HOURS_EPSILON = 0.75`
  - `export const COUNT_EPSILON = 1`
  - `export type TrendUnit = 'hours' | 'count' | 'room'`
  - `export function objectTrend(schedule: Schedule, today: number, kinds: readonly ActivityKind[], unit: TrendUnit): Trend`
  - `export function trendPhrase(trend: Trend, unit: TrendUnit): string | null`

- [ ] **Step 1: Write the failing tests**

Create `src/ui/room/objectTrend.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { objectTrend, trendPhrase } from './objectTrend'

const block = (id: string, dayIndex: number, hours: number): ScheduledItem => ({
  id,
  title: id,
  type: 'mental',
  kind: 'studyBlock',
  hours,
  intensity: 1,
  dayIndex,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
})

const week = (items: readonly ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const STUDY = ['studyBlock'] as const

/**
 * The trend the Today panel puts on each room object, which is the one part of Loadline's
 * "load, contributing factors, and trends" that nothing answered. Forward-looking on purpose:
 * the panel is about today, and a capacity app's job is to say what is coming before it bites.
 */
describe('objectTrend', () => {
  it('reads growing load across today and the next two days', () => {
    const schedule = week([block('a', 0, 1), block('b', 1, 2), block('c', 2, 4)])

    expect(objectTrend(schedule, 0, STUDY, 'hours')).toBe('rising')
  })

  it('reads easing load', () => {
    const schedule = week([block('a', 0, 4), block('b', 1, 2), block('c', 2, 1)])

    expect(objectTrend(schedule, 0, STUDY, 'hours')).toBe('falling')
  })

  /** The assertion most likely to pass by accident, so it is stated as its own case: an even
   *  three days is flat, and flat is what suppresses the phrase entirely. */
  it('reads an even three days as flat', () => {
    const schedule = week([block('a', 0, 2), block('b', 1, 2), block('c', 2, 2)])

    expect(objectTrend(schedule, 0, STUDY, 'hours')).toBe('flat')
  })

  it('reads a day with nothing on it either side as flat', () => {
    expect(objectTrend(week([]), 0, STUDY, 'hours')).toBe('flat')
  })

  /** Half an hour more is not a trend. The reserve default of 1.5 would have gone further and
   *  called two hours becoming three and a quarter flat, which is most of a study block. */
  it('ignores a change too small to mean anything in hours', () => {
    const schedule = week([block('a', 0, 2), block('b', 1, 2.2), block('c', 2, 2.4)])

    expect(objectTrend(schedule, 0, STUDY, 'hours')).toBe('flat')
  })

  /** Boxes are counted, not timed -- one errand is one box whatever it takes -- so a count
   *  needs a whole extra thing before it has moved. */
  it('counts things rather than hours when the unit is a count', () => {
    const oneMore = week([block('a', 0, 3), block('b', 1, 3), block('c', 2, 3), block('d', 2, 3)])

    expect(objectTrend(oneMore, 0, STUDY, 'count')).toBe('rising')
  })

  /** The horizon's last days have fewer than three to look at. Defined rather than assumed. */
  it('is flat at the end of the horizon, where there is nothing ahead to compare', () => {
    const schedule = week([block('a', HORIZON_DAYS - 1, 4)])

    expect(objectTrend(schedule, HORIZON_DAYS - 1, STUDY, 'hours')).toBe('flat')
  })
})

describe('trendPhrase', () => {
  it('says nothing at all when flat, so a row with no reading carries no claim', () => {
    expect(trendPhrase('flat', 'hours')).toBeNull()
    expect(trendPhrase('flat', 'count')).toBeNull()
    expect(trendPhrase('flat', 'room')).toBeNull()
  })

  it('names more and less time in the student\'s terms', () => {
    expect(trendPhrase('rising', 'hours')).toBe('more coming')
    expect(trendPhrase('falling', 'hours')).toBe('easing off')
  })

  it('speaks in things for a counted row', () => {
    expect(trendPhrase('rising', 'count')).toBe('piling up')
    expect(trendPhrase('falling', 'count')).toBe('clearing')
  })

  /**
   * Rest is the one row the room deliberately draws no object for, because it is "not a duty
   * you owe anyone". So its phrase describes room available and never a shortfall -- "less
   * rest coming" would be the app telling a student off for a week it scheduled.
   */
  it('describes rest as room available, never as a shortfall', () => {
    expect(trendPhrase('rising', 'room')).toBe('more room than usual')
    expect(trendPhrase('falling', 'room')).toBe('less room ahead')

    for (const phrase of [trendPhrase('rising', 'room'), trendPhrase('falling', 'room')]) {
      expect(phrase).not.toMatch(/should|need|must|try to/i)
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/room/objectTrend.test.ts`
Expected: FAIL at collection — `Failed to resolve import "./objectTrend"`, because the module does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `src/ui/room/objectTrend.ts`:

```typescript
import { blocksOnDay } from '../../domain/dayBlocks'
import type { ActivityKind } from '../../engine'
import type { Schedule } from '../../optimizer'
import { trendOf, type Trend } from '../dial/trend'

/**
 * Which way a room object's load is heading, and how the panel says so.
 *
 * Loadline's SEE bullet asks for "load, contributing factors, and trends" per object. The
 * Today panel already answered the first two -- the row's number, and the blocks behind it
 * when the row is opened -- and nothing answered the third.
 *
 * Forward-looking, across today and the next two days. The panel is about today, and what a
 * capacity app is for is saying what is coming before it arrives; a backward window would
 * describe a week the student has already lived and cannot change.
 */

/** Today and the next two. Matches `trendOf`'s own window so the two readings on one screen
 *  are over the same number of days. */
export const TREND_DAYS = 3

/** Hours. Half an hour more a day is scheduling noise; this is the point where three days of
 *  drift becomes something worth a sentence. Deliberately not `trendOf`'s reserve-point
 *  default of 1.5, which on an hours scale would call two hours becoming three and a quarter
 *  flat -- most of a study block. */
export const HOURS_EPSILON = 0.75

/** Things. A count has no fractions, so anything less than one whole extra errand has not
 *  moved at all. */
export const COUNT_EPSILON = 1

/**
 * What a row measures, which decides both the arithmetic and the wording.
 *
 * `room` is rest, and it is a separate unit rather than `hours` for one reason: the wording
 * has to describe room available and never a shortfall. Rest is the one object the room
 * deliberately does not draw, because it is "not a duty you owe anyone".
 */
export type TrendUnit = 'hours' | 'count' | 'room'

export function objectTrend(
  schedule: Schedule,
  today: number,
  kinds: readonly ActivityKind[],
  unit: TrendUnit,
): Trend {
  // `blocksOnDay` rather than a filter of its own, which is the same reason `panelRowsFor`
  // uses it: "which blocks are on this day" already has one answer in the codebase, and a
  // second one here would be free to drift from it.
  const series = Array.from({ length: TREND_DAYS }, (_, offset) => {
    const onDay = blocksOnDay(schedule, today + offset).filter((item) =>
      kinds.includes(item.kind),
    )

    return unit === 'count'
      ? onDay.length
      : onDay.reduce((total, item) => total + item.hours, 0)
  })

  return trendOf(series, unit === 'count' ? COUNT_EPSILON : HOURS_EPSILON)
}

/**
 * The row's phrase, or null when there is nothing to say.
 *
 * Words rather than the arrow the reserve bars use, and that is the whole decision: on a bar
 * `▲` means the reserve rose, which is good news, while on an object's load rising hours is
 * bad news. One glyph meaning opposite things two taps apart is worse than two vocabularies.
 *
 * Null when flat, because a phrase on a row with nothing behind it is a claim -- the same rule
 * `DomainBarList` already applies to its glyph.
 */
export function trendPhrase(trend: Trend, unit: TrendUnit): string | null {
  if (trend === 'flat') return null

  if (unit === 'count') return trend === 'rising' ? 'piling up' : 'clearing'
  if (unit === 'room') return trend === 'rising' ? 'more room than usual' : 'less room ahead'

  return trend === 'rising' ? 'more coming' : 'easing off'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/room/objectTrend.test.ts`
Expected: PASS, all cases. Then `npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/room/objectTrend.ts src/ui/room/objectTrend.test.ts
git commit -m "feat: work out which way a room object's load is heading"
```

---

### Task 3: carry the phrase on every panel row

**Files:**
- Modify: `src/ui/room/todayRows.ts:16-30` (add the field), `:43-91` (add `unit` to the groups), `:97-146` (compute it)
- Test: `src/ui/room/todayRows.test.ts`

**Interfaces:**
- Consumes: `objectTrend`, `trendPhrase`, `type TrendUnit` from Task 2.
- Produces: `PanelRow` gains `readonly trend: string | null`. `panelRowsFor`'s signature is unchanged — it already takes `schedule` and `today`.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/room/todayRows.test.ts`. The file already has a `week()` helper and a `rowFor(id, ...)` lookup around lines 45-53 — reuse them; the `item`/block helper it uses for study blocks takes `(id, dayIndex, hours)`.

```typescript
describe('the trend on a row', () => {
  /** Loadline's SEE bullet wants load, contributing factors AND trends per object. The first
   *  two were the number and the blocks behind it; this is the third. */
  it('says more is coming when the next days are heavier', () => {
    const schedule = week([item('a', 0, 1), item('b', 1, 2), item('c', 2, 4)])

    expect(rowFor('books', schedule, 0)?.trend).toBe('more coming')
  })

  it('says nothing at all on an even run of days', () => {
    const schedule = week([item('a', 0, 2), item('b', 1, 2), item('c', 2, 2)])

    expect(rowFor('books', schedule, 0)?.trend).toBeNull()
  })

  it('says nothing on a row with nothing on it', () => {
    expect(rowFor('dumbbell', week([]), 0)?.trend).toBeNull()
  })

  /** Boxes count things rather than hours, so its words are about a pile rather than time. */
  it('speaks in things on the counted row', () => {
    const errand = (id: string, dayIndex: number) => ({
      ...item(id, dayIndex, 1),
      type: 'errands' as const,
      kind: 'errands' as const,
    })
    const schedule = week([errand('a', 2), errand('b', 2)])

    expect(rowFor('boxes', schedule, 0)?.trend).toBe('piling up')
  })

  /** Bed is the week's own sleep figure and nothing records whether anybody answered it, so
   *  it must not carry a trend it cannot stand behind. */
  it('leaves the bed without a trend, because nothing measured it', () => {
    expect(rowFor('bed', week([]), 0)?.trend).toBeNull()
  })
})
```

If the existing `rowFor` helper does not take a schedule and a day, widen it in this step rather than adding a second lookup.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/room/todayRows.test.ts`
Expected: FAIL — `Property 'trend' does not exist on type 'PanelRow'` at typecheck, and at runtime `expect(undefined).toBe('more coming')`.

- [ ] **Step 3: Write the minimal implementation**

In `src/ui/room/todayRows.ts`:

Add to the `PanelRow` interface, after `drawn`:

```typescript
  /**
   * Where this object's load is heading over today and the next two days, in words, or null
   * when it is flat or nothing measured it.
   *
   * Words rather than the arrow the reserve bars use: on a bar `▲` means the reserve rose and
   * that is good news, while here rising hours is bad news, and one glyph meaning opposite
   * things two taps apart is the kind of disagreement this panel exists to avoid.
   */
  readonly trend: string | null
```

Add `unit` to the group shape and to each entry — `'hours'` for books, dumbbell and people, `'count'` for boxes, `'room'` for `REST_GROUP`:

```typescript
const GROUPS: readonly {
  readonly id: string
  readonly label: string
  readonly meaning: string
  readonly kinds: readonly ActivityKind[]
  readonly unit: TrendUnit
  readonly counted?: boolean
  readonly drawn?: boolean
}[] = [
```

In `rowFor`, add to the returned object:

```typescript
      trend: trendPhrase(objectTrend(schedule, today, group.kinds, group.unit), group.unit),
```

On the `bed` literal, add:

```typescript
    // No trend. `sleepByDay` defaults to 7 for a night nobody answered and nothing records
    // whether it was answered, so this row already cannot tell "slept seven hours" from
    // "nobody has asked yet" -- and a direction drawn from that would be a claim about a
    // series that does not exist.
    trend: null,
```

Add the import:

```typescript
import { objectTrend, trendPhrase, type TrendUnit } from './objectTrend'
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/room/todayRows.test.ts` then `npx tsc --noEmit`
Expected: PASS and clean. `src/ui/room/TodayPanel.test.tsx` may need `trend: null` added to any hand-built `PanelRow` fixtures — fix those in this step.

- [ ] **Step 5: Commit**

```bash
git add src/ui/room/todayRows.ts src/ui/room/todayRows.test.ts src/ui/room/TodayPanel.test.tsx
git commit -m "feat: carry each room object's trend on its panel row"
```

---

### Task 4: show the phrase in the panel

**Files:**
- Modify: `src/ui/room/TodayPanel.tsx:60-78` (the row's label column)
- Test: `src/ui/room/TodayPanel.test.tsx`

**Interfaces:**
- Consumes: `PanelRow.trend` from Task 3.
- Produces: a `data-testid={`panel-trend-${row.id}`}` element, present only when `row.trend !== null`.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/room/TodayPanel.test.tsx`, using whatever row fixture the file already builds:

```typescript
  it('shows a row the words for where its load is heading', () => {
    render(<TodayPanel rows={[row({ id: 'books', trend: 'more coming' })]} />)

    expect(screen.getByTestId('panel-trend-books')).toHaveTextContent('more coming')
  })

  /** Flat rows carry nothing. A phrase with no reading behind it is a claim, and this is the
   *  assertion most likely to pass by accident, so it is checked by absence explicitly. */
  it('renders no trend element at all on a flat row', () => {
    render(<TodayPanel rows={[row({ id: 'books', trend: null })]} />)

    expect(screen.queryByTestId('panel-trend-books')).toBeNull()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/room/TodayPanel.test.tsx`
Expected: the first FAILS with `Unable to find an element by: [data-testid="panel-trend-books"]`. The second passes already — kept as the regression guard for the absence rule.

- [ ] **Step 3: Write the minimal implementation**

In `src/ui/room/TodayPanel.tsx`, inside the label column after the `meaning` span:

```tsx
                {row.trend !== null && (
                  <span
                    data-testid={`panel-trend-${row.id}`}
                    className="text-xs font-medium text-ink-soft"
                  >
                    {row.trend}
                  </span>
                )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/room/TodayPanel.test.tsx` then `npm test`
Expected: PASS and the full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/room/TodayPanel.tsx src/ui/room/TodayPanel.test.tsx
git commit -m "feat: say on each panel row where its load is heading"
```

---

### Task 5: point the reserve bars at the days around today

**Files:**
- Modify: `src/ui/dial/domainBars.ts:100-118` (signature and the trend call)
- Modify: `src/ui/room/RoomShell.tsx:361` (the one real call site)
- Test: `src/ui/dial/domainBars.test.ts`, plus the call sites in `src/ui/dial/CapacityDial.test.tsx:31` and `src/ui/dial/dialText.test.ts:26,109`

**Interfaces:**
- Consumes: `trendOf(series, epsilon?)` from Task 1.
- Produces: `domainBars(reserves: Reserves, projection: Projection, days: readonly DayInput[], today: number): DomainBar[]` — `today` appended so existing positional arguments are untouched.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/dial/domainBars.test.ts`:

```typescript
  /**
   * The arrows describe the days around today, not the end of the fortnight.
   *
   * The whole 21-day projection used to be handed to `trendOf`, which keeps the LAST three
   * entries -- so the arrow described days 18, 19 and 20 while `trendOf`'s own docstring said
   * it showed "where things are going now". On a projection that mostly decays that reads
   * falling almost regardless of this week.
   *
   * Built as a series that rises near today and falls at the far end, so the old behaviour and
   * the new one disagree and only one of them can pass.
   */
  it('trends on the days around today rather than the end of the horizon', () => {
    const climbThenCollapse = Array.from({ length: HORIZON_DAYS }, (_, day) =>
      uniform(day <= 4 ? 40 + day * 5 : 60 - day * 2),
    )
    const projection = { ...project(healthy, days, DEFAULT_PARAMS), central: climbThenCollapse }

    const mental = domainBars(healthy, projection, days, 2).find((bar) => bar.key === 'mental')

    expect(mental?.trend).toBe('rising')
  })
```

`uniform(value)` builds a `Reserves` with all four at `value`; add it beside the file's existing helpers if it is not already there.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/dial/domainBars.test.ts`
Expected: FAIL — `expected 'falling' to be 'rising'`, because the old code reads days 18–20 where the series is collapsing.

- [ ] **Step 3: Write the minimal implementation**

In `src/ui/dial/domainBars.ts`, add the parameter and slice before trending:

```typescript
export function domainBars(
  reserves: Reserves,
  projection: Projection,
  days: readonly DayInput[],
  /**
   * Which day the arrows are about.
   *
   * The whole projection used to go to `trendOf`, which keeps the last three entries -- so the
   * arrow described days 18, 19 and 20 of the fortnight while `trendOf` documented itself as
   * showing "where things are going now". Slicing to today and the two days before it is what
   * makes the glyph mean what it has always claimed to.
   */
  today: number,
): DomainBar[] {
```

and replace the trend call:

```typescript
      trend: trendOf(
        projection.central.slice(Math.max(0, today - 2), today + 1).map((day) => day[type]),
      ),
```

Update `src/ui/room/RoomShell.tsx:361` to `domainBars(model.reserves, projection, days, today)`, and the three test call sites to pass a day.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/dial src/ui/room` then `npm test` then `npx tsc --noEmit`
Expected: all PASS and clean. If a `dialText` case asserted a specific trend word, re-derive it from the new window rather than relaxing the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/ui/dial/domainBars.ts src/ui/dial/domainBars.test.ts src/ui/dial/CapacityDial.test.tsx src/ui/dial/dialText.test.ts src/ui/room/RoomShell.tsx
git commit -m "fix: point the reserve bars' arrows at this week, not the end of the fortnight"
```

---

### Task 6: prove it fits, and look at it

**Files:**
- Modify (only if the browser suite says so): `src/ui/room/TodayPanel.tsx`
- Test: `tests/e2e/room.spec.ts` (run, not edited)

- [ ] **Step 1: Run the browser suite**

Run: `npx playwright test`
Expected: 74 PASS. `room.spec.ts` asserts the today panel clears the character and the ceiling band at 320×568 through 2560×1440; a phrase per row is up to six extra lines of text.

- [ ] **Step 2: If it fails, shorten the words — never the assertion**

The phrases are the adjustable part: "more coming" → "more", "easing off" → "easing". Change `trendPhrase` and its tests together. Do not relax a viewport assertion; `.claude/CLAUDE.md` forbids making a check pass by weakening it.

- [ ] **Step 3: Look at it**

Run `npm run dev`, open the room at 320px and on a laptop, expand the Today panel, then open the Reserves sheet. Read the row phrases against the bar arrows: they describe the same three days now, and the words must not contradict the glyphs.

- [ ] **Step 4: Review the diff**

REQUIRED SUB-SKILL: `code-review` over `git diff`, then `verification-before-completion` before any completion claim. Confirm the tests are in the diff, not just the working tree.

- [ ] **Step 5: Commit any wording change**

```bash
git add src/ui/room/objectTrend.ts src/ui/room/objectTrend.test.ts src/ui/room/TodayPanel.tsx
git commit -m "fix: shorten the trend wording so the panel still fits at 320px"
```

---

## Self-Review

**Spec coverage.** Unit 1 of the approved plan → Tasks 2, 3, 4 (direction, the row field, the rendering), with the forward window, the words-not-arrows rule, all six rows and the per-unit wording each pinned by a test. Unit 2 → Task 5. The plan's own verification list → Task 6. `trendOf`'s sensitivity, which both units need, → Task 1.

**Placeholders.** None: every code step carries the actual code, and the two conditional steps (widening the existing `rowFor` helper in Task 3, shortening the wording in Task 6) name exactly what to change and what forbids the alternative.

**Type consistency.** `objectTrend` and `trendPhrase` take `TrendUnit` in both their definition (Task 2) and both call sites (Task 3). `PanelRow.trend` is `string | null` where it is declared, where it is set, and where it is read (Task 4). `trendOf`'s second parameter is `epsilon` in Task 1 and is passed positionally in Tasks 2 and 5. `domainBars` gains `today` last, and all four call sites are listed in Task 5.

**Known risk carried forward.** The panel's height is the thing most likely to break, which is why Task 6 runs the browser suite before the work is called done and states that the words move rather than the assertion.
