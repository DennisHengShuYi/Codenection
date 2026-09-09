# The Room Is The App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the room the entire interface — objects are the controls, forms zoom into the object they belong to, and every notification becomes a state of the furniture it concerns.

**Architecture:** `RoomShell` replaces `HomeScreen` as the composition root, holding one `View` union instead of seven booleans. A single `roomModel` derives both the furniture's state and the sidebar's rows, so they cannot disagree. Existing feature components are reused unchanged inside a zoom container.

**Tech Stack:** React 19, TypeScript 7 (strict, `noUncheckedIndexedAccess`), Tailwind 4, Vitest 4 + Testing Library, Playwright.

**Spec:** [`docs/superpowers/specs/2026-09-09-room-is-the-app-design.md`](../specs/2026-09-09-room-is-the-app-design.md). Read it first — it records which alternatives were turned down and why, and this plan does not repeat that reasoning.

**Base:** `feature/room-is-the-app`, branched from `main`.

## Global Constraints

- **The room is the only surface.** No card floats above it and no button strip sits beside
  it. If something needs attention it is a state of an object.
- **One model, two views.** `roomModel` is the single source for the furniture and the rows.
  Deriving either from anywhere else is what this design exists to prevent.
- **Order in the sidebar is fixed**, never sorted by urgency. Attention is marked, not moved.
- **Every object is a real `<button>`**, so keyboard and screen-reader access come from the
  element rather than from `role`/`tabIndex` retrofitting.
- **§1.3's nine bindings are untouched.** Three objects are added; none is removed or
  re-bound.
- **Feature components are not modified.** `PlannerScreen`, `PhotoImportScreen`,
  `RequestBoxScreen`, `CalibrationScreen`, `Prescription`, `BlockConfirm`, `EnergyCheckIn`,
  `MicroStartCard`, `AccuracyNote`, `LapsedNotice`, `DoorPanel` take props and are reused
  as-is. If one needs changing, that is a signal the container is wrong.
- **`src/engine/**`, `src/optimizer/**` and `src/domain/**` must not change.** This is a
  presentation change.
- **Responsive at 320 / 390 / 768 / 1280px.** Below 768px the sidebar collapses to a toggle
  and a zoomed form takes the viewport.
- **Reduced motion cuts instantly.** `useReducedMotion` exists and must gate the zoom.
- **TDD, red before green.** Coverage thresholds only go up: 97 / 91 / 97 / 98.
- **Commit format:** `<type>: <description>`, ending `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

### Fixed values

| Constant | Value | Rationale |
|---|---|---|
| `SIDEBAR_BREAKPOINT` | `768` | §10's tablet width, and where two rooms already stop sitting side by side. |
| `ZOOM_MS` | `220` | Long enough to read as movement, short enough not to delay a form. Zero with reduced motion. |
| `OBJECT_ORDER` | see Task 2 | The fixed traversal order for keyboard and for the sidebar. |

---

## File Structure

```
src/ui/room/
  roomModel.ts          one model -> furniture state + sidebar rows
  roomModel.test.ts     includes the parity property test
  objects.ts            ObjectId, OBJECT_ORDER, labels, what each opens
  objects.test.ts
  view.ts               the View union and its transitions
  view.test.ts
  RoomShell.tsx         the composition root (replaces HomeScreen)
  RoomShell.test.tsx
  RoomSidebar.tsx       the sidebar, which is also the words view
  RoomSidebar.test.tsx
  ZoomLayer.tsx         renders a feature over an object's box
  ZoomLayer.test.tsx
  Room.tsx              MODIFY: full-bleed, buttons, desk/phone/mirror
  Room.test.tsx         MODIFY
src/ui/
  HomeScreen.tsx        DELETE once RoomShell replaces it
  HomeScreen.*.test.tsx REWRITE as RoomShell.*.test.tsx
tests/e2e/
  *.spec.ts             REWRITE the four driving open-* buttons
```

---

## Task 1: What each object is

**Files:** Create `src/ui/room/objects.ts`, `src/ui/room/objects.test.ts`

**Produces:**
- `type ObjectId = 'desk' | 'phone' | 'mirror' | 'papers' | 'bed' | 'door' | 'character' | 'window' | 'ceiling' | 'plant' | 'light' | \`clutter-${string}\``
- `const OBJECT_ORDER: readonly ObjectId[]`
- `interface ObjectMeta { id, label, opens, reading }`
- `function metaFor(id): ObjectMeta`

**Key decisions to encode as comments:**

- The order is fixed and is both the keyboard traversal order and the sidebar order. A list
  that reorders itself must be re-learned every visit by a screen-reader user.
- `plant` and `light` have `opens: null`. They report a reading and nothing else — silence
  teaches people to stop tapping.
- Clutter ids are dynamic (`clutter-<itemId>`), so `OBJECT_ORDER` holds a placeholder the
  model expands.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { metaFor, OBJECT_ORDER } from './objects'

describe('the room objects', () => {
  it('gives every object a label a person would recognise', () => {
    for (const id of OBJECT_ORDER) {
      expect(metaFor(id).label.length, id).toBeGreaterThan(2)
    }
  })

  it('opens something for every object except the two that only report', () => {
    for (const id of OBJECT_ORDER) {
      const opens = metaFor(id).opens
      if (id === 'plant' || id === 'light') expect(opens, id).toBeNull()
      else expect(opens, id).not.toBeNull()
    }
  })

  // §1.4 ranks the camera above typing, and both are "get it into the app".
  it('puts the planner and photo import behind the desk', () => {
    expect(metaFor('desk').opens).toBe('input')
  })

  it('puts the request box and the chat channel behind the phone', () => {
    expect(metaFor('phone').opens).toBe('outside-world')
  })

  /**
   * The order is the keyboard traversal order and the sidebar order at once. Fixed, so
   * neither has to be re-learned -- and identical, so they cannot diverge.
   */
  it('has a stable order with no duplicates', () => {
    expect(new Set(OBJECT_ORDER).size).toBe(OBJECT_ORDER.length)
  })

  it('lists the three new objects alongside the nine bindings', () => {
    for (const id of ['desk', 'phone', 'mirror'] as const) {
      expect(OBJECT_ORDER, id).toContain(id)
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail** — `npx vitest run src/ui/room/objects.test.ts`
- [ ] **Step 3: Implement** `objects.ts` per the interfaces above.
- [ ] **Step 4: Run, typecheck, commit.**

---

## Task 2: One model, two views

**Files:** Create `src/ui/room/roomModel.ts`, `src/ui/room/roomModel.test.ts`

**Consumes:** `roomStateFor` (`src/ui/room/roomState.ts`), `prescribe`, `lapsed`, `isStuck`,
`attemptsIn`, `paramsFor`, `predictions` — all unchanged.

**Produces:**
- `interface RoomRow { id: ObjectId; label: string; reading: string; attention: boolean }`
- `interface RoomModel { state: RoomState; rows: readonly RoomRow[] }`
- `function roomModel(input): RoomModel`

**The important test in this plan.** The parity property is what stops the two views drifting
apart later, and it is worth more than any other test here:

- [ ] **Step 1: Write the failing test**

```ts
/**
 * The property the whole design rests on: the room and the sidebar are two presentations of
 * one model, so anything the furniture is signalling must appear in the list and the reverse.
 * Without this they drift, and the words view quietly becomes a second-class description of
 * a picture rather than an equal way to operate the app.
 */
it('marks exactly the rows whose objects are showing attention', () => {
  for (const scenario of SCENARIOS) {
    const model = roomModel(scenario)
    const attentive = new Set(model.rows.filter((r) => r.attention).map((r) => r.id))

    expect(attentive, scenario.name).toEqual(objectsShowingAttention(model.state))
  }
})
```

`SCENARIOS` covers: a comfortable week; a depleted one; a lit door; a stuck task; a lapsed
commitment; a block awaiting confirmation; a prediction awaiting a report; thin calibration;
and an empty week. Each is a plain object, no randomness — a generated-input test here would
be slower and no more revealing.

Plus: every row has a non-empty reading; rows appear in `OBJECT_ORDER`; the order does not
change when attention changes; clutter expands to one row per box; and a week with no
clutter yields no clutter rows.

- [ ] **Step 2: Run and watch fail. Step 3: Implement. Step 4: Commit.**

---

## Task 3: The view machine

**Files:** Create `src/ui/room/view.ts`, `src/ui/room/view.test.ts`

**Produces:** the `View` union from the spec, plus `zoomTo`, `back`, `toWords`, `toRoom`.

**Tests:** zooming from the room enters zoom; `back` from zoom returns to the room; `back`
from words returns to the room; zooming while zoomed replaces rather than nests; **no two
kinds are ever simultaneously active** — asserted by the type and by a test that the value is
one object, because the seven booleans it replaces permitted exactly that contradiction.

---

## Task 4: The room, redrawn

**Files:** Modify `src/ui/room/Room.tsx`, `Room.test.tsx`

Three changes:

1. **Full-bleed.** `100dvh`, `preserveAspectRatio="xMidYMid slice"`, existing `viewBox="0 0 300 200"` kept.
2. **Objects become buttons.** Each `<g onClick>` becomes `<g role="none">` wrapping a
   `<foreignObject>` button, or an SVG `<a>`/`<g tabindex>` — whichever passes the keyboard
   test. The current `aria-hidden="true"` on the SVG must go, since the objects are now
   controls; the text equivalent moves into the sidebar.
3. **Desk, phone and mirror** are drawn, each with an attention state.

**Tests:** every object in `OBJECT_ORDER` is reachable by keyboard in that order; each has an
accessible name from `metaFor`; attention renders a visible marker *and* an accessible one,
never colour alone; the SVG is no longer `aria-hidden`.

---

## Task 5: Sidebar and zoom

**Files:** Create `RoomSidebar.tsx`, `ZoomLayer.tsx` and their tests.

`RoomSidebar` renders `model.rows`. Above 768px a persistent rail; below, a toggle opening
the same list full-screen. Clicking a row **focuses the object then zooms it** — not opening
the feature directly, which is the decision that keeps the room primary.

`ZoomLayer` renders a feature over an object's bounding box, full-viewport below 768px, and
cuts instantly when `useReducedMotion` is set.

**Tests:** rows render in `OBJECT_ORDER`; attention shows; clicking a row zooms its object;
the toggle appears below 768px only; the zoom layer traps focus and returns it to the object
on close; reduced motion produces no transition.

---

## Task 6: RoomShell, and the tests that must change

**Files:** Create `RoomShell.tsx` + tests; delete `HomeScreen.tsx`; rewrite the eight
`HomeScreen.*.test.tsx` and the e2e specs driving `open-*` buttons.

`RoomShell` holds one `View`, renders `Room` + `RoomSidebar` + `ZoomLayer`, and maps each
`ObjectId` to the feature it opens. Every feature component is passed the same props it
receives today.

**The rewritten tests must assert the same behaviour through the new surface**, not less of
it. Where a test drove `open-planner` it now drives the desk; where it asserted a card
appeared, it asserts the object shows attention and the zoom contains the card. A rewrite
that quietly checks less is the failure mode to watch for here.

**Run everything:**

```bash
npm run typecheck && npm run test:coverage && npm run build
PORT=5241 npx playwright test --workers=1
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Shell, one `View` union | 3, 6 |
| One model, two views | 2 |
| Furniture map, three new objects | 1, 4 |
| Sidebar focuses the object | 5 |
| Sidebar = words view = low-energy | 5, 6 |
| Fixed order | 1, 2, 5 |
| Zoom, 320px behaviour, reduced motion | 5 |
| Parity test | 2 |
| Nine bindings untouched | 4 |

**Placeholder scan:** Tasks 3–6 describe tests rather than spelling out every case, because
their shape is established by Tasks 1–2 and by the eleven existing component test files this
repo already has. Task 2's parity test is written out in full because it is the one nothing
else in the codebase resembles.

**Type consistency:** `ObjectId` is defined in Task 1 and consumed in 2, 4, 5 and 6.
`RoomModel` is defined in Task 2 and consumed in 5 and 6. `View` is defined in Task 3 and
consumed in 6 only.

**Three risks:**

1. **Buttons inside SVG.** `<foreignObject>` has real quirks in Safari, and SVG `<a>` is not
   a button. Task 4 must be driven by the keyboard test rather than by what looks right —
   if neither approach passes, the fallback is an invisible HTML button layer positioned over
   the SVG, which is uglier and works everywhere.
2. **The rewritten tests could assert less than the originals.** Called out in Task 6, and the
   thing to check hardest at review.
3. **`HomeScreen` deletion touches everything.** It is imported by `App.tsx` and by eight test
   files. Task 6 is where the diff gets large, and it is the point at which splitting the PR
   becomes attractive if review stalls.
