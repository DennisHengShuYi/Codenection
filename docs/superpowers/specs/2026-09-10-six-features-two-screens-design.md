# Six features, two screens

**Date:** 2026-09-10
**Status:** design, approved in conversation, not yet planned
**Branch:** `worktree-four-doors` (worktree at `.claude/worktrees/four-doors`, based on `main`)

---

## 1. Why

The app works. It is also unusable, for three reasons that compound.

**Every feature is drawn twice.** `Room.tsx` lays twelve invisible tap targets over the
drawing; `RoomSidebar.tsx` lists the same eleven rows again. Both read `model.rows`, both
call the same handler. Two surfaces, one destination each, and a student has to learn both.

**The dial §1.1 says never to hide is two taps deep.** §1.1 is explicit: the room is the
surface, the capacity dial sits in one corner as a compact readout, *"no tap required for
either."* It is currently behind the `light` object.

**Two objects are junk drawers.** `phone` holds lapsed commitments, a social prescription,
the request box and the Telegram link. `mirror` holds the account bar and the whole
calibration screen. Neither grouping means anything to a student; both exist because the
features had to go somewhere and those were the objects left over.

Underneath that, `RoomShell.tsx` is 507 lines and holds all eleven feature panels inline in
one `contentFor` switch — the switchboard its own docstring says it replaced.

### What the audit found

Grepping for who actually *reads* the calibration profile settled the scope question:

```
profile.mode            → nothing reads it
profile.focus           → one printed sentence
profile.semesterBreak   → nothing reads it
profile.peakStartHour   → one printed sentence
calibrationProgress()   → feeds only its own progress bar
```

`paramsFor()` — the only function that turns a profile into engine parameters — reads
`confirmations` and `painted`. Nothing else. Mode, focus and semester-break never reach the
model.

Two sentences currently on screen make claims the code does not implement:

- *"You focus for about 55 minutes before you drift, so blocks are sized to that."* Nothing
  sizes blocks to it.
- `semesterBreak`'s comment claims the optimizer switches from flattening peaks to defending
  a floor. Nothing reads the flag.

So the calibration subsystem, minus post-block confirmation, is decorative. Removing it
costs the model nothing and removes two untrue statements from the product.

Also found: `smallestFix` is built, tested and reachable from nowhere; `RoomSidebar`'s
`trimmed` prop is used only by its own test.

---

## 2. What the app becomes

**Six features, two screens, one sheet, one settings page.**

| # | Feature | What it is |
|---|---|---|
| 1 | **The room + gauge** | Nine bindings, display-only, reserve percentage in the corner |
| 2 | **The week** | Overview grid → day hour-grid → block sheet |
| 3 | **Add** | Photograph something · type it out · someone asked me for something |
| 4 | **Rebalance** | Moves the fortnight; falls back to the single most useful move |
| 5 | **Recovery** | One card, one action, "not today" |
| 6 | **How did today go?** | Two taps, once a day |

Plumbing, not features: sign in, and the Telegram link.

The organising principle is **how often you do it**, not what kind of thing it is:

| Frequency | Where it lives |
|---|---|
| Every open | the room itself, zero taps — gauge, room state, whatever is live |
| Most days | one tap — the week, and `+` |
| When it happens | appears only when it applies, absent otherwise — recovery, lapsed, requests |
| Once, ever | settings — account, Telegram link |

That last distinction is what the current build gets wrong: calibration and the chat link sit
at the same visual weight as the features touched daily.

---

## 3. Screen one — the room

```
┌──────────────────────────────────┐
│ ░░░░░░░░ ceiling ░░░░░░░░░░░░░░  │
│                        ╭──────╮  │
│  ▭ papers    █door█    │ 68%  │  │
│                        │ ▁▃█▂ │  │
│  ✱ char   ▫ desk       ╰──────╯  │
│  ■■■ clutter   ▓▓bed▓▓   ❦ plant │
└──────────────────────────────────┘
  You are running low. Storm coming.
  48h predictions: right 4 of 5 so far.
  The 21-day outlook is not validated.

  ⚡ live cards, only when they apply

     [ The week ]            ┏━┓
                             ┃+┃
                             ┗━┛
```

**The drawing is display-only.** No tap targets at all. All nine of §1.3's bindings survive
untouched — ceiling, papers, clutter, plant, bed, window, light, door, character. They report;
they do not navigate.

**The gauge sits inside the room**, in a corner. This is §1.1 taken literally for the first
time and it removes the reason `light` needed to be a destination.

**Beneath the drawing, always:** `describeRoom()`'s paragraph (§1.5's text equivalent), and
the accuracy line with §8.2's disclaimer beside it.

**Live cards appear only when they apply and are absent otherwise:** the recovery card, the
"how did today go?" card, a lapsed-commitment notice. On a day when nothing has happened the
room screen is a room, a number, a paragraph and two buttons.

**Two permanent controls:** `The week`, and `+`.

**Low-energy mode is not a separate view.** Below the reserve threshold this same screen drops
the week link and shows one action. §1.5's requirement is met without a second implementation.

---

## 4. Screen two — the week

### Overview

All 21 days, three rows of seven, each cell shaded by that day's load.

```
SCHEDULE                21 days
      M   T   W   T   F   S   S
w1   ░░  ▓▓  ██  ▓▓  ░░  ░░  ░░
      8   9  10  11  12  13  14
w2   ▓▓  ██  ██  ██  ▓▓  ░░  ░░
     15  16  17  18⚠ 19  20  21
w3   ░░  ░░  ▓▓  ▓▓  ░░  ░░  ░░
     22  23  24  25  26  27  28

░ light   ▓ busy   █ heavy   ⚠ deficit

           [ Rebalance ]
```

A day carrying an unconfirmed block is marked, so the confirmation prompt is discoverable from
the overview rather than only from the card.

### Day

Tapping a cell opens that day as an hour grid **beneath** the overview. One column, so it
works at 320px where seven columns cannot.

```
── WED 10 ────────── ██████░░ heavy

 08  ┌──────────────────────────┐
 09  │ Data Structures       🔒 │
 10  └──────────────────────────┘
 14  ┌──────────────────────────┐
 15  │ FYP meeting              │
 16  └──────────────────────────┘
 19  ┌──────────────────────────┐
 20  │ Essay draft              │
 22  └──────────────────────────┘
```

Blocks positioned by `startHour`, sized by `hours`, hue from `type`, so the day's composition
is visible rather than only its list. `🔒` marks `fixed`, `🛡` marks `protectedRest`.

The hour range is derived from the day's blocks rather than fixed, so an empty day is not
sixteen rows of nothing.

### Rebalance

Sits under the overview, because it rewrites what is under it. Runs the existing hill-climb
solver, reports in plain English, plays the tidy-up animation.

**`smallestFix` becomes its fallback**, not a feature of its own. When the solver cannot
improve the fortnight, Rebalance says so and offers the single most useful move instead.
§2.5 warns this is the likely case for a real final-year student, which makes it the more
honest headline rather than a consolation prize.

---

## 5. The block sheet

Tapping a block opens a sheet whose buttons are **derived from the block's state**. Never five
buttons; usually two.

| The block is… | The sheet offers |
|---|---|
| Today or later, movable | Done · Later · Move · "I can't start this" |
| Today or later, `fixed` 🔒 | Done only — the optimizer cannot move it, so the interface must not offer to |
| `protectedRest` 🛡 | Did you actually rest? Yes / No |
| Stuck ≥3 days or ≥2 missed slots | the micro-start card opens with the sheet, unasked (§4.1's automatic trigger) |
| In the past, unconfirmed | the same four-way question the card asks — *didn't / less / right / longer* |
| In the past, confirmed | what you recorded, and Undo |

"I can't start this" is §4.1's manual trigger.

The past-block case matters: §4's overview marks days carrying unconfirmed blocks, so there
are two routes to the same question. **The card is the prompt; the sheet is the place.** Both
write the same `BlockOutcome`, and a block answered by either is not asked about again.

This is the single largest consolidation in the design. **Done, Later, Move, micro-start and
confirmation are not five features — they are five states of a block.** They collapse into one
screen that the calendar needed to render anyway.

It also deletes the *clutter box* as a species: a floor box was only ever a stuck errand.
The room still draws them; they are no longer a separate destination.

---

## 6. The `+` sheet

```
┌──────────────────────────────────┐
│ What's coming at you?            │
│                                  │
│ [ 📷 Photograph something      ] │
│ [ ⌨  Type it out               ] │
│ [ 💬 Someone asked me for       ] │
│      something                   │
└──────────────────────────────────┘
```

The request box is not a separate feature. Photo, text and request are the same shape —
*something arrives → confirm what it is → it becomes blocks*. The request path is the one that
prices it and drafts the reply before you commit.

All three keep their existing behaviour, including: never import silently, low-confidence rows
flagged, the two-room comparison, the three drafted replies, and no send button.

---

## 7. Recovery, simplified

The current card contradicts itself: it says *one thing to do, never a menu, because a
depleted person cannot choose* — and then the physical prescription hands over a list of three
places. The list goes.

```
┌──────────────────────────────────┐
│ Get outside and walk             │
│ One hour. It's the thing that    │
│ would help most right now.       │
│                                  │
│ [ Put it in my week ]  Not today │
└──────────────────────────────────┘
```

**The whole rule:**

```
lowest reserve ≥ 40      → nothing
less than 1h free today  → nothing
already dismissed today  → nothing
otherwise                → one card, 1 hour, today, 16:00

  social   → Message someone you like and see them
  physical → Get outside and walk
  mental   → Stop and do nothing — no screen
  errands  → nothing, deliberately
```

**"Put it in my week"** keeps `scheduleRecovery`'s existing behaviour exactly: inserted with
both `fixed: true` and `protectedRest: true`. This remains the only path in the app that
creates protected rest, and nothing parsed from text may ever set those flags.

**"Not today"** dismisses for the day. It no longer suppresses that kind permanently.

### Removed

- `outings.ts` and `DoorPanel.tsx` — a menu inside a card whose premise is no menus
- `recoveryLog.ts`, `recordAttempt`, `attemptsIn`, the `RecoveryAttempt` type, and
  `Schedule.recoveryLog`
- `freeGapOn`'s cap-and-round arithmetic, replaced by "one hour, if there is one"

This fixes a real defect on the way out: suppression was permanent and absolute, so one
afternoon where a walk did not help meant the app never suggested walking again. And
`helped: true` was recorded but read by nothing — `prescribe` only ever checked `!helped`.

---

## 8. "How did today go?", simplified

Per-block confirmation currently asks two questions about **every** block. Four blocks today
is eight taps, which is why it would never happen. Two cuts: **one block, and one question
about it.**

```
┌──────────────────────────────────┐
│ How did today go?                │
│                                  │
│ [empty] [low] [ok] [good] [great]│
│ ─────────────────────────────────│
│ Essay draft — you planned 3h     │
│                                  │
│ [didn't] [less] [right] [longer] │
└──────────────────────────────────┘
```

Two taps, once a day.

**The energy row** resolves the 48-hour prediction. Unchanged in behaviour: five relative
bands, never a typed number; a resolved prediction is never rewritten; mean *absolute* error;
"not enough data" rather than 0.0 when nothing has resolved.

**The block row** produces the same `BlockOutcome` the engine already consumes:

```
didn't happen  → actual 0
took less      → ×0.75
about right    → ×1
took longer    → ×1.5
```

This collapses the current `yes/partly/no × harder/same/easier` grid into one four-way answer.
The only case lost is "it happened but only partly" — the least useful of the nine
combinations and the hardest to answer honestly.

**Which block it asks about:** the unconfirmed block whose **load type has the fewest
confirmations so far**. One line of code, and it means the three-sample threshold — where the
engine starts correcting estimates — is reached as fast as possible despite asking once a day.

### Removed

- `EnergyCheckIn.tsx` and `BlockConfirm.tsx`, replaced by one `TodayCard`
- the `character` and `papers` objects as destinations these hid behind

---

## 9. Settings

Behind a small control on the room screen. Account, and the Telegram link.

The Telegram channel earns its place because it is a second door into the two flows that fail
when they require opening an app: getting something in, and confirming a block at 11pm. Per
§13.7, **one** flow end to end — post-block confirmation, because that is the flow the
validation claim dies without.

---

## 10. Modules

### New

| File | Job |
|---|---|
| `src/ui/week/scheduleView.ts` | Pure. Days → load bands and deficit marks for the overview. |
| `src/ui/week/dayGrid.ts` | Pure. Blocks → positioned rows for the hour grid. |
| `src/ui/week/blockActions.ts` | Pure. A block → which actions its sheet offers. |
| `src/ui/week/WeekScreen.tsx` | Overview + day grid + Rebalance. |
| `src/ui/week/BlockSheet.tsx` | The sheet. |
| `src/ui/today/TodayCard.tsx` | Energy row + one block row. |
| `src/ui/today/todayCard.ts` | Pure. Picks which block to ask about. |
| `src/ui/AddSheet.tsx` | Photo · text · request. |
| `src/ui/useProfile.ts` | Loads and saves the profile. `useCalibration` renamed and moved out of the deleted `calibration/` directory — the profile still has to be persisted once the calibration *screens* are gone. |

### Changed

| File | Change |
|---|---|
| `src/ui/room/Room.tsx` | Drops `onSelect` and all twelve overlay buttons. Display-only. |
| `src/ui/room/RoomShell.tsx` | 507 lines → routing and data only. The eleven-case `contentFor` switch goes. |
| `src/ui/room/roomModel.ts` | Drops `prescribedOn`'s three-way routing and the `calibrationProgress` row. |
| `src/ui/room/view.ts` | `zoom(objectId)` → the new screen union. |
| `src/domain/prescribe.ts` | Simplified per §7. |
| `src/domain/calibration.ts` | Profile shrinks to `confirmations`, `confirmedItemIds`, `predictions`. |
| `src/domain/engineParams.ts` | `paramsFor` reads confirmations only. |

### Deleted

```
src/ui/room/hotspots.ts
src/ui/room/RoomSidebar.tsx
src/ui/LowEnergyView.tsx            (absorbed into the room screen)
src/ui/calibration/                 (whole directory — ModePicker, Painter,
                                     HowYouWork, CalibrationScreen, BlockConfirm;
                                     useCalibration survives as useProfile)
src/ui/validation/EnergyCheckIn.tsx
src/ui/recovery/DoorPanel.tsx
src/domain/painter.ts
src/domain/outings.ts
src/domain/recoveryLog.ts
```

`smallestFix.ts` is **kept** and newly surfaced as Rebalance's fallback.
`AccuracyNote.tsx` is **kept** and moves onto the room screen permanently.

**Reality Check becomes invisible, and that is intended.** `HowYouWork` was where the
estimate bias was shown in words. With it gone, `paddingFor`'s correction still runs on every
projection — it simply stops being narrated. The visible half of the validation story is the
accuracy line on the room screen, which is the number §8.1 actually asks to be published.

---

## 11. Deliberate deviations from the spec

Each of these is a considered choice, not an oversight.

| Deviation | Reason |
|---|---|
| **The three-day painter is cut** (§11 must-build) | It is the highest-effort screen in the app and produces two parameters that post-block confirmation produces better, from what actually happened. This is the only genuine must-build casualty. |
| **Mode picker, focus bucket and semester-break are cut** (§7.1) | Nothing reads them. Cutting them costs the model nothing and removes two on-screen claims the code does not implement. |
| **"Tap any object for its numbers" is gone** (§1.3) | The drawing is display-only. Every number survives — in the gauge, in `describeRoom()`'s paragraph, and in the week. |
| **Get-out-of-the-house mode is cut** (§5.3, must-build) | A three-item menu inside a card whose stated premise is that a depleted person cannot choose from a menu. |
| **Failed-recovery suppression is cut** (§5.2's last line) | Replaced by "not today". The permanent version was a defect: one failure suppressed a kind forever. |
| **Low-energy mode is not a separate view** (§1.5) | Absorbed into the room screen, which already is one number and one action. Requirement met, second implementation avoided. |
| **The words view is not a separate view** (§1.5) | `describeRoom()`'s paragraph is on the room screen permanently, and the week is already text. A third list of the same rows was the duplication being removed. |

---

## 12. Testing

Written first, per `test-driven-development`. Behaviour changes ship with their tests in the
same change.

**Pure modules, exhaustively:**

- `scheduleView.test.ts` — banding at boundaries; deficit days marked; unconfirmed-block marks
- `dayGrid.test.ts` — position and height from `startHour`/`hours`; derived hour range; an
  empty day; overlapping blocks
- `blockActions.test.ts` — one case per row of §5's table; `fixed` never offers Move; the
  micro-start trigger at exactly 3 days and exactly 2 misses
- `todayCard.test.ts` — picks the least-sampled load type; nothing to ask when all confirmed
- `prescribe.test.ts` — rewritten for §7's rule; the four reserve cases; the <1h and
  dismissed-today gates

**Components:**

- `Room.test.tsx` — rewritten to assert the scene contains **no** buttons
- `WeekScreen`, `BlockSheet`, `TodayCard`, `AddSheet` — one file each
- `RoomShell.test.tsx` — routing only; the eight `RoomShell.*.test.tsx` files have their
  assertions moved down to the component that now owns each one

**Responsive verification at 320 / 390 / 768 / 1280px** on both screens, per §0's standing
requirements — specifically the day hour-grid at 320px, which is the layout this design chose
*because* seven columns could not survive it.

**Three-tap check** (§0): log a task = `+` → type → accept ✓ · take a recovery block = card →
accept ✓ · start a stuck task = week → day → block, micro-start opens with it ✓.

---

## 13. Out of scope

Not in this change, and not implied by it: any change to `src/engine` or `src/optimizer`
beyond deleting `Schedule.recoveryLog`; the Telegram bot's server side; Google Calendar
import; and the room's artwork beyond removing its tap targets.
