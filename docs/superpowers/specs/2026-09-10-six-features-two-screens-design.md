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

**Live cards appear only when they apply and are absent otherwise.** On a day when nothing has
happened the room screen is a room, a number, a paragraph and two buttons.

**Two permanent controls:** `The week`, and `+`.

**`describeRoom()`'s paragraph is capped at three sentences.** It can currently emit six, and
at 320px six sentences push both buttons below the fold. Character state and weather are always
kept — they are the two the room cannot say any other way — then at most one more, chosen in
this order: door lit, sleep debt, clutter, plant. The full text stays available to screen
readers via the drawing's `aria-label`; the cap is visual only.

### Card precedence

There are four things that can want the screen at once — recovery, "how did today go?", a
lapsed commitment, and a stuck task — and on a bad evening a student can qualify for all four.
Showing them together hands a menu to a depleted person, which is precisely what §7 deletes
`outings.ts` for doing.

**One ordered rule, and a cap that depends on reserve:**

```
1. recovery          (the reserve is low and something would help)
2. lapsed            (a commitment expired and there are words to send)
3. stuck task        (a task has sat three days, or missed two slots)
4. how did today go  (the day is ending and it has not been answered)

below the low-energy threshold  → show exactly ONE card, the first that applies
otherwise                       → show at most TWO
```

Recovery leads because it is the only card that addresses *why* the others are hard. "How did
today go?" is last because it asks the student for something rather than offering them
anything.

**Low-energy mode is not a separate view.** Below the threshold this same screen drops the week
link, trims the paragraph to the character sentence, and shows one card — which the rule above
already defines. §1.5's "one number and one action" is met without a second implementation.

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

### Where your reserves stand

§1.2's five-domain breakdown — each domain against its own ceiling, with its trend glyph and,
where it applies, its written warning — sits at the **foot of this screen**, under a heading,
beneath the day grid.

It is here rather than on the room because the room reads capacity exactly once, as the corner
gauge §1.1 asks for. Two readings of the same number on the landing screen is the duplication
this whole design exists to remove, and the louder of the two was the "dashboard a student at
12% reserve should not be handed". The week is the screen about how the fortnight spends the
reserve, so the breakdown of where it is going belongs to it.

Last on the screen, not first: the overview and Rebalance are §4's primary surface, and a
dashboard above them would push the fortnight's one action below the fold at 320px.

The low-social warning — "You have been spending a lot of time alone" — lives in this
breakdown. It is the single clearest evidence the model understands burnout rather than
summing hours, and it must stay reachable wherever the breakdown goes.

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

Sits directly under the overview grid and **stays there when a day is open** — the day grid
opens below it, not between it and the overview. Rebalance belongs to the fortnight, not to the
selected day, and moving it down as the day expands would suggest it acts on that day alone.

Runs the existing hill-climb solver, reports in plain English, plays the tidy-up animation.
After a run the overview redraws and the open day stays open, so the change is visible in both
at once.

**`smallestFix` becomes its fallback**, not a feature of its own. It does not exist for the
case where there is nothing left to move at all — with no candidates, both searches come back
empty and `describeRebalance` already has its own honest line for that ("nothing left to move,
this fortnight is beyond what rearranging can fix"). It exists for the narrower, more common
case: the hill climb rejects every candidate under its own objective — usually on fragmentation
or floor grounds — while at least one of those same candidates would still measurably help the
student (fewer days in deficit, a higher floor). Rebalance then says it found nothing, and
offers that one move instead. §2.5 warns this is the likely case for a real final-year student,
which makes it the more honest headline rather than a consolation prize.

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

### Micro-start must stay a push

§4.1's automatic trigger fires after two missed slots or three days. If micro-start only lived
in this sheet it would become **pull** — week → day → block — and a stuck student at 2am is
exactly the person who will not go looking for it. Today the room at least draws stuck clutter
with an attention ring; a display-only room removes even that.

So a stuck task also raises a **live card on the room screen** (third in §3's precedence
order), carrying the same micro-start and opening the same sheet. The sheet is where it lives;
the card is how it finds you.

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

### How a typed event becomes numbers

Nothing decides an event's drain, recovery or efficiency directly. An event is classified on
three axes and the engine derives all three numbers from them:

| Axis | Values | Decides |
|---|---|---|
| `type` | 4 — mental · physical · social · errands | which reserve it spends |
| `kind` | 8 — hardExercise · lightExercise · studyBlock · socialDraining · socialRestorative · errands · rest · sleep | **whether it drains or recovers**, and what residue it leaves for the hours after it |
| `intensity` | 0–2 | how hard, within its kind |

**`kind` is the load-bearing one**, and the parse has never produced it. The Groq prompt asks
for `{title, type, hours, deadlineDay, hard}`, and `addItems` then invents a kind from a fixed
four-row table: `mental→studyBlock`, `physical→lightExercise`, `social→socialDraining`,
`errands→errands`, with `intensity` hardcoded to 1.

Four consequences, all live today:

- **Half the engine is unreachable from typing.** `hardExercise`, `socialRestorative`, `rest`
  and `sleep` cannot be produced by free text or by a photo. `hardExercise` is reachable from
  **nowhere in the app** — its row in `CROSS_EFFECT` can never fire.
- **The gym bug.** *"gym, 2 hours"* → `physical` → `lightExercise`, whose cross-effect is
  `mental +0.10`. The engine believes a two-hour gym session *improves* the next study block.
  `hardExercise` is `mental −0.25`. A study block after training costs roughly 25% more than
  projected, and the optimizer will happily schedule exactly that.
- **Typing "rest" produces work.** No text can reach kind `rest`. *"Nap for an hour"* becomes
  `lightExercise` and **drains** rather than recovers.
- **`intensity` is a dead axis.** A skim-read and a final exam are both 1.

**The fix: the parse carries `kind`.**

1. The Groq prompt and `replySchema` gain a `kind` field, validated against the engine's own
   `ActivityKind` union so a hallucinated value is rejected at the boundary rather than
   corrupting every projection downstream.
2. `addItems` reads `item.kind` instead of consulting `KIND_FOR`.
3. The rules fallback derives kind from the signal words **it already has** — its physical list
   is `gym · run · walk · swim · football · training · exercise · yoga`, which already separates
   the hard from the light. It also gains a small `rest` signal set (`nap · rest · break ·
   downtime`), which is what fixes the third bullet offline.
4. `ItemChip` lets a student correct the kind before accepting, as it already does the type.

This matters more than it looks: `GROQ_API_KEY` is blanked in `vitest.config.ts` and `vite dev`
does not serve `/api` at all, so **the rules fallback is the path the whole test suite and the
entire local dev loop actually exercise.** Fixing only the model path would leave the gym bug
everywhere except production.

**Defaults follow the doctrine `addItems` already states** — that crediting recovery which never
happened reports a student as fine while they sink, whereas under-crediting only errs toward
caution. So an unclassifiable physical block defaults to `hardExercise`, not `lightExercise`,
and social stays pessimistic at `socialDraining` exactly as it does today.

**`intensity` stays at 1 and is not asked for.** `kind` already encodes "how hard" more usefully
than a 0–2 figure a student would guess at, and a field nobody sets is how the calibration
subsystem got the way it did.

**Kind `rest` is not the `protectedRest` flag.** `addItems` must keep refusing to set `fixed` or
`protectedRest` on anything from a parse — §5.1's guarantee rests on it. A movable rest block
the optimizer may still shuffle is a different thing and is safe.

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
take the reserves below 40, lowest first
  errands has no advice → skip it, try the next one
  none left             → nothing

no free hour today      → nothing
already dismissed today  → nothing
otherwise                → one card, 1 hour, today, AT THE GAP FOUND

  social   → Message someone you like and see them
  physical → Get outside and walk
  mental   → Stop and do nothing — no screen
  errands  → no advice; falls through
```

**Two corrections to the current behaviour, both defects rather than simplifications:**

*Errands no longer swallows the prescription.* `prescribe` takes the single lowest reserve and
`ADVICE['errands']` is undefined, so it returns null. A student whose errands reserve is lowest
at 22 while mental sits at 25 gets **no card at all, ever** — the emptiest reserve silently
suppresses advice for the second-emptiest. Errands still has no advice of its own (telling
someone who is flat to do a chore is advice nobody follows), but it now falls through instead
of blocking.

*The insert goes where the gap is.* The gate asks whether there is a free hour today; the
insert was hardcoded to 16:00. Those are different questions, and once `freeGapOn`'s arithmetic
is gone nothing reconciles them — the card could schedule rest on top of a class. The scan that
finds the free hour returns **where** it is, and the block is inserted there. 16:00 survives
only as the tie-break when the day is empty.

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
│ How did you sleep?               │
│ [ under 5 ] [ 6 ] [ 7 ] [ 8+ ]   │
│ ─────────────────────────────────│
│ Essay draft — you planned 3h     │
│                                  │
│ [didn't] [less] [right] [longer] │
└──────────────────────────────────┘
```

Three taps, once a day.

### The sleep row, and why it is here

Sleep does not come from the profile. It comes from `schedule.sleepByDay`, and **nothing in
the app has ever written it after the week is created** — not the painter, not the planner,
not the check-in. The painter set `sleepBaselineHours`, which is the *threshold* in
`max(0, sleep − baseline)`, not the sleep data. So sleep has been frozen at its seeded values
since the first commit, and two of §1.3's nine bindings — the plant and the bed, both driven
by `sleepDebt` — have been reporting a constant.

Cutting the painter makes that worse in a way that is easy to miss:

```
before, painted 7h:   max(0, 5.5 − 7) = 0      no sleep credit
after,  default 5h:   max(0, 5.5 − 5) = 0.5    credit appears
```

The seeded crunch week sleeps 5.5 hours on weeknights. Falling back to the population baseline
of 5 would make the app **more optimistic about recovery for exactly the sleep-deprived student
it exists for**. That is not an acceptable side effect of a UI simplification.

So the sleep row writes `sleepByDay[today]`, closing a loop that has never been closed. It
costs one tap, it is the only engine input the app asks for and never receives, and it makes
the plant and the bed move for the first time.

Buckets, not a typed number, per §7.5: `under 5 → 4.5 · 6 → 6 · 7 → 7 · 8+ → 8.5`.

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

## 8b. The block log

A per-day record of what was scheduled and what became of it. **Nothing renders it.** It is
written by the today card and by the Telegram bot, read by the engine, and never shown.

It exists because three separate defects share one missing piece — a durable record of block
outcomes that both writers can reach and something can actually read.

### The record

```ts
export type BlockAnswer = 'didnt' | 'less' | 'right' | 'longer'

export interface BlockRecord {
  readonly blockId: string
  readonly type: LoadType        // Reality Check needs it
  readonly plannedHours: number  // Reality Check needs it
  readonly dayIndex: number      // checkedIn needs it
  readonly answer: BlockAnswer
  readonly answeredAt: number
}
```

It carries `type` and `plannedHours` **itself** rather than looking them up, because a week is
persisted as a jsonb blob and there are no rows for `block_id` to join against. That is exactly
why the existing `block_answers` table cannot be read by anything: it stores the answer alone,
which is not enough to compute an outcome.

### What it fixes

**① The answer vocabulary.** Migration `0004` constrains answers to `yes / no / partly`; §8's
card sends four duration answers. The two are not variants of one question:

```
yes / partly / no       → did you do it        (completion)
less / right / longer   → how long did it take (duration)
```

Reality Check consumes only the second. The current code multiplies them together —
`actualHours = plannedHours × happened × overrun` — as though they were one axis, and they are
not. The commonest study outcome, *"I sat down for the full three hours and got through half the
essay"*, records as `partly` → `1.5h`, telling the app the student works less than they do. The
honest reading is that the essay is **longer than three hours**, which is what `longer` records.

Migration `0005` widens the check to the four answers and adds the three columns. Existing rows
stay valid.

**② The two loops join.** `block_answers` is written by `api/telegram.ts` and read by nothing —
one hit in the whole codebase, and migration `0004`'s own comment admits it. Meanwhile
`profile.confirmations` is written only by the app. So answering on your phone at 11pm teaches
the app nothing, which makes §9's Telegram flow collect into a void. One log with two writers
and one reader removes the problem rather than adding a sync rule.

**③ `checkedIn` gets a signal.** §6.5's missing-data pessimism — 8% compounding per consecutive
silent day, forgiven on the next check-in — is implemented in `projection.ts` and can never
fire, because `toDayInputs` is the only builder of `DayInput` in the app and hardcodes
`checkedIn: true`. A past day carrying blocks and no answer is a day the student went quiet.

> **Days ahead must be `true`.** A future day has nothing to check in about, and marking the
> horizon as missed would compound to `1 + 0.08 × 21 = 2.68×` pessimism on every projection,
> permanently. `checkedIn = dayIndex > today ? true : answered.has(dayIndex)`.

### Where it lives

**Behind the `Repository`**, not in Supabase directly. The app works signed out on IndexedDB,
and putting the log in `block_answers` alone would silently stop Reality Check working for
anyone without an account.

```ts
loadBlockLog(): Promise<readonly BlockRecord[]>
recordBlockAnswer(record: BlockRecord): Promise<void>
```

Local adapter → IndexedDB. Supabase adapter → `block_answers`, which needs the RLS policies
migration `0002` already models on `auth.uid()`; the table currently has RLS enabled with **no
policies at all**, so the browser can reach none of it. Both adapters run the shared contract
suite, as they already do for weeks and settings.

### The profile shrinks to one field

`confirmations` and `confirmedItemIds` stop being stored and become derived:

```ts
confirmations    = log.map(r => ({ type, plannedHours, actualHours: plannedHours * FACTOR[r.answer] }))
confirmedItemIds = log.map(r => r.blockId)
```

Leaving `predictions` as the only thing the profile still holds. One source of truth, no sync
rule, and no question about which side wins when both answered the same block.

### Deliberately invisible

§10 already records that Reality Check stops being narrated when `HowYouWork` is deleted. This
section is why that is safe rather than a loss: the correction still runs on every projection,
and §7.5's own stance is that the student is asked relative questions and *need not know the
parameter exists*. The visible half of the validation story remains the accuracy line on the
room screen.

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
| `src/ui/kit/Sheet.tsx` | §12. Replaces `ZoomLayer`, keeping its focus, Escape and dialog semantics. |
| `src/ui/kit/Card.tsx` | §12. One card, three tones. |
| `src/ui/kit/Button.tsx` | §12. Three variants, two sizes, 44px minimum. Replaces 18 hand-written copies. |
| `src/ui/kit/Field.tsx` | §12. Label, control, help, error. |
| `src/fixtures/umProfile.ts` | §14 step 0. Seeded confirmations and resolved predictions. |

### Changed

| File | Change |
|---|---|
| `src/ui/room/Room.tsx` | Drops `onSelect` and all twelve overlay buttons. Display-only. |
| `src/ui/room/RoomShell.tsx` | 507 lines → routing and data only. The eleven-case `contentFor` switch goes. |
| `src/ui/room/roomModel.ts` | Drops `prescribedOn`'s three-way routing and the `calibrationProgress` row. |
| `src/ui/room/view.ts` | `zoom(objectId)` → the new screen union. |
| `src/domain/prescribe.ts` | Simplified per §7. |
| `src/domain/calibration.ts` | Profile shrinks to `predictions` alone — §8b derives the other two from the block log. |
| `src/domain/engineParams.ts` | `paramsFor` takes the block log's outcomes; `sleepBaselineHours` is fixed at `SLEEP_BASELINE_HOURS` (5). |
| `src/data/types.ts` | `Repository` gains `loadBlockLog` and `recordBlockAnswer` (§8b). |
| `src/data/localRepository.ts`, `supabaseRepository.ts`, `repositoryContract.ts` | Both adapters implement the log and both run the shared contract. |
| `src/optimizer/objective.ts` | `toDayInputs` takes the answered days so `checkedIn` stops being hardcoded `true`. |
| `api/telegram.ts` | `recordBlockAnswer` writes the four-answer vocabulary and the three new columns. |
| `src/domain/prescribe.ts` | Also returns *where* the free gap is, not only whether one exists. |
| `src/optimizer/types.ts` | `Schedule.recoveryLog` removed. |

### Persisted profiles

`mode`, `focus`, `semesterBreak`, `peakStartHour`, `painted`, `modeChosen` and `calibratedDays`
are dropped from the type. Already-saved profiles carry those keys; the loader ignores unknown
keys, so no migration is needed and nothing fails to load.

**One behaviour change is not silent and must be stated:** a student who had painted a 7-hour
baseline was getting `sleepBaselineHours: 7`; they now get the population figure of 5. Their
projections become slightly more generous about sleep recovery from the moment they update. The
sleep row on the today card (§8) is what makes this defensible — it replaces a painted guess
about a typical night with a reported figure about an actual one.

`Schedule.recoveryLog` is likewise dropped and ignored on load. No week fails to open.

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

Invisible is not the same as absent, and §8b is what keeps the distinction honest: the block log
records every answered block durably, on both storage adapters and from both writers, and feeds
`paramsFor` on every load. Reality Check gets *more* data than it has today, not less — it is
only the narration that goes.

---

## 11. Deliberate deviations from the spec

Each of these is a considered choice, not an oversight.

| Deviation | Reason |
|---|---|
| **The three-day painter is cut** (§11 must-build) | The highest-effort screen in the app. It produced two parameters: estimate bias, which post-block confirmation produces better from what actually happened, and `sleepBaselineHours`, which it produced as a *painted guess about a typical night*. §8's sleep row replaces the second with a reported figure about an actual night, and writes `sleepByDay` — which the painter never did. This is the only genuine must-build casualty, and the sleep row is what stops it being a regression. |
| **Mode picker, focus bucket and semester-break are cut** (§7.1) | Nothing reads them. Cutting them costs the model nothing and removes two on-screen claims the code does not implement. |
| **"Tap any object for its numbers" is gone** (§1.3) | The drawing is display-only. Every number survives — in the gauge, in `describeRoom()`'s paragraph, and in the week. |
| **Get-out-of-the-house mode is cut** (§5.3, must-build) | A three-item menu inside a card whose stated premise is that a depleted person cannot choose from a menu. |
| **Failed-recovery suppression is cut** (§5.2's last line) | Replaced by "not today". The permanent version was a defect: one failure suppressed a kind forever. |
| **Low-energy mode is not a separate view** (§1.5) | Absorbed into the room screen, which already is one number and one action. Requirement met, second implementation avoided. |
| **The words view is not a separate view** (§1.5) | `describeRoom()`'s paragraph is on the room screen permanently, and the week is already text. A third list of the same rows was the duplication being removed. |
| **`isStuck`'s miss-counting half of the trigger (§4.1) is not built** | §4.1 fires Micro-Start on "two scheduled slots missed, or three days past first appearance". Nothing in the codebase counts missed slots, so `misses` was hardcoded `0` at all three call sites — half the trigger could never fire. Deleted the parameter rather than wire a fake counter: only the days-old half is real, and `isStuck` now says so honestly. |
| **`move` does not exist in `BlockAction`, and "Undo" has no retract** | `move` was specified and wired once, but no day/time picker was ever built for it, so it behaved identically to "Later" — a silent stub. Dropped. "Undo" is a label over a read-only recorded answer: `Repository.recordBlockAnswer` only upserts, there is no retract operation, so the button shows what was said rather than pretending to undo it. |
| **`prescribe` keeps cap-and-round arithmetic §7's Removed list says was deleted** | `Math.min(slot.hours, MAX_BLOCK_HOURS)` and `Math.round(hours * 2) / 2` are both still in `prescribe.ts`. §7 replaced `freeGapOn`'s cap-and-round with "one hour, if there is one", but the cap against `USEFUL_REST_HOURS` and the half-hour rounding on the actual free slot remain — shipped, not caught before merge. |
| **A fourth semantic accent exists: `--color-critical`** | `styles.css` defines `--color-critical: #e11d48`, which is rose-600 — a colour §12 deletes by name from the three-accent budget. It is consumed outside `kit/` at `CapacityDial.tsx` (the overloaded arc) and `DomainBarList.tsx` (the critical bar fill), for the one severity above attention: the reserve model's own worst read. Kept as a fourth accent rather than folded into `--color-attention`, because "needs you" and "over 100%" are different severities and collapsing them would lose that distinction. |
| **"Not today" is session-scoped, not day-scoped** (§7) | `RoomShell.tsx` holds `recoveryDismissed` in a plain `useState`, so a same-day reload resurfaces the card rather than the dismissal surviving until the next day as §7 states. |
| **`RecoveryCard` is a `Card`, not the `Sheet` §12's per-panel table names** | Its actions sit in a plain flex div rather than a pinned action bar. Built as a card early and never moved when the per-panel table was written; shipped as-is rather than reworked in this pass. |

---

## 12. Visual design

### The problem, measured

```
9 colour families across 17 background utilities, chosen per component
"rounded-lg bg-slate-900 px-4 py-3 text-white" hand-written 18× in 12 files
styles.css is one line: @import 'tailwindcss'
no tailwind config, no @theme, no design tokens
no shared primitive — no Button, no Card, no Sheet, no Field
de-emphasis is opacity-70, which fades the background through the text
```

Each feature was built in its own session and invented its own look: violet micro-start, sky
prescription, amber door panel, rose, indigo, emerald. There is nothing to refactor here
because there is no system to refactor — this section builds one.

### The palette comes from the room

The room is the app's identity: warm cream walls, a slate ceiling, amber on the floor. The
interface should sit *in* that room rather than beside it. Tokens go in `styles.css` via
Tailwind v4's `@theme`.

**Ground and ink:**

```
--color-ground     #faf8f4    the page
--color-surface    #ffffff    cards and sheets
--color-line       #e3ddd2    borders
--color-ink        #1c1917    primary text
--color-ink-soft   #6b635a    secondary text — replaces every opacity-70
```

**Exactly three semantic accents.** More than three and none of them mean anything:

```
--color-attention  amber-500  needs you: stuck, lapsed, deficit, unconfirmed
--color-calm       sky-600    recovery, rest, protected blocks
--color-action     ink        primary buttons
```

Deleted outright: `violet-50`, `rose-600`, `rose-300`, `indigo-400`, `emerald-600`,
`slate-500`, `sky-300`, `amber-100`, `amber-400`.

**Four load-type hues, for calendar blocks only**, and never carrying meaning alone (§1.5) —
every block also shows its label and its type in words:

```
mental    indigo-500
physical  teal-600
social    rose-500
errands   stone-500
```

Amber is deliberately excluded from that set, so "needs you" stays unambiguous everywhere.

### Four primitives, and every panel is built from them

New directory `src/ui/kit/`:

| Component | Rules |
|---|---|
| `Sheet` | The container every button opens. Title, scrolling body, action bar pinned to the bottom. |
| `Card` | `bg-surface border-line rounded-xl p-4`, with one prop: `tone="attention" \| "calm" \| null`. |
| `Button` | `variant="primary" \| "secondary" \| "quiet"`, `size="lg" \| "sm"`. Minimum 44px touch target, always. |
| `Field` | Label, control, help text, error. Every input goes through it. |

**No component outside `kit/` writes a colour utility.** That is mechanically checkable and
§13 makes it a test.

### Sheet anatomy — and the one-handed fix

§0.2 requires primary actions in the lower half of the viewport on mobile. Today `ZoomLayer`
puts "Back to the room" at the **top** and lets each panel scatter its own buttons wherever
they land — `RoomShell`'s desk panel puts them mid-screen, `Prescription` puts them after a
paragraph, `PlannerScreen` puts them under a textarea.

```
┌──────────────────────────────┐
│  Title                    ╳  │  ← 44px close target
├──────────────────────────────┤
│                              │
│  body — scrolls              │
│                              │
├──────────────────────────────┤
│  [ Primary ]  [ Secondary ]  │  ← pinned; always in the lower third
└──────────────────────────────┘
```

Below 768px the sheet rises from the bottom edge and takes the viewport. Above it, it centres
over the room with the room still visible around it.

`ZoomLayer`'s focus-on-open, its Escape handler, its `role="dialog"` and `aria-modal` are all
correct and carry over into `Sheet` unchanged. Only the layout and the misplaced back-link
change.

### Per-panel layout

| Sheet | Title | Body | Action bar |
|---|---|---|---|
| **Block** | the block's title | time · type · duration; micro-start card when stuck | derived per §5 |
| **Today** | How did today go? | three rows, each one button group | none — answering the last row closes it |
| **Add** | What's coming at you? | three large targets, stacked | Cancel |
| **Recovery** | the prescription title | one sentence | Put it in my week · Not today |
| **Photo · Type · Request** | existing copy | existing, re-laid on `Field` | existing buttons, moved into the bar |

### Out of scope for this pass

**Dark mode.** The room's light level already encodes reserve, and a dark chrome around a lit
room would collide with that meaning. It deserves its own decision, not a side effect of this
change.

---

## 13. Testing

Written first, per `test-driven-development`. Behaviour changes ship with their tests in the
same change.

**Pure modules, exhaustively:**

- `scheduleView.test.ts` — banding at boundaries; deficit days marked; unconfirmed-block marks
- `dayGrid.test.ts` — position and height from `startHour`/`hours`; derived hour range; an
  empty day; overlapping blocks
- `blockActions.test.ts` — one case per row of §5's table; `fixed` never offers Move; the
  micro-start trigger at exactly 3 days and exactly 2 misses
- `todayCard.test.ts` — picks the least-sampled load type; nothing to ask when all confirmed;
  the sleep bucket → hours mapping; **writing a sleep answer changes `sleepByDay[today]` and
  therefore moves `sleepDebt`**, which is the regression test for the frozen-binding defect
- `prescribe.test.ts` — rewritten for §7's rule; the four reserve cases; the <1h and
  dismissed-today gates; **errands-lowest falls through to the next reserve under 40 rather
  than returning null**; **the block is inserted at the gap found, not at 16:00, when 16:00
  is occupied**
- `cardPrecedence.test.ts` — the ordering; two cards above the low-energy threshold and
  exactly one below it; nothing when nothing applies
- `roomText.test.ts` — extended: never more than three sentences; character and weather always
  present; the full text still reaches the drawing's `aria-label`

**Components:**

- `Room.test.tsx` — rewritten to assert the scene contains **no** buttons
- `WeekScreen`, `BlockSheet`, `TodayCard`, `AddSheet` — one file each
- `RoomShell.test.tsx` — routing only; the eight `RoomShell.*.test.tsx` files have their
  assertions moved down to the component that now owns each one

**Guards against the failure this codebase keeps repeating.**

Four times a mechanism has been built, tested, and left with no consumer — and every one passed
CI:

| Orphan | How it failed |
|---|---|
| `hardExercise` | a row in `CROSS_EFFECT` no producer could ever emit |
| `block_answers` | written by the bot, read by nothing |
| `checkedIn` | hardcoded `true` by the only builder of `DayInput` |
| calibration | four settings collected, none read |

Green tests proved each of them still did what it used to do — which was nothing. So three
cheap guards:

- **`reachable.test.ts`** — every `ActivityKind` can be produced by the parser or by a
  prescription, or appears in an `INTENTIONALLY_ABSENT` map **with a written reason**. That map
  is the point: a deliberate absence is recorded, a forgotten one fails. (`sleep` is the one
  legitimate entry — it enters through `Schedule.sleepByDay`, never as an activity.)
- **`tables.test.ts`** — no table is written without being read. Heuristic: it classifies by the
  method chained after `from(` within a short window, so a read split across statements would be
  missed. Narrow on purpose — it catches the shape the mistake actually took, which is a table
  whose only mention is a write.
- **`checkedIn`** — asserted to carry real data rather than a constant.

**Each guard must be run against `main` first and seen to fail** on the orphan it exists for. A
guard that has never failed is not a guard.

**The design system (§12):**

- `kit/` components get their own tests — `Button`'s three variants, `Card`'s three tones,
  `Sheet`'s focus-on-open and Escape (carried over from `ZoomLayer`'s existing tests)
- **A lint-style test asserting no component outside `src/ui/kit/` writes a colour utility.**
  Greps the `src/ui` tree for `bg-`, `text-` and `border-` followed by a Tailwind colour name
  and fails on any hit outside `kit/`. This is the only thing that stops the system decaying
  back into 18 hand-written buttons, and it is cheap.
- **A test that every action bar's primary button sits in the lower half** at 390px — §0.2's
  one-handed rule, which nothing currently checks.

**Responsive verification at 320 / 390 / 768 / 1280px** on both screens, per §0's standing
requirements — specifically the day hour-grid at 320px, which is the layout this design chose
*because* seven columns could not survive it, and the room screen at 320px with the paragraph
capped and both buttons above the fold.

**Three-tap check** (§0): log a task = `+` → type → accept ✓ · take a recovery block = card →
accept ✓ · start a stuck task = week → day → block, micro-start opens with it ✓.

---

## 14. Build order

Sequenced so the thing everything else hangs off exists first, and so there is a demoable app
at every line. **Stop-and-demo line marked.**

| # | Step | Why here |
|---|---|---|
| 0 | **Seed confirmations and predictions** | Before any UI. See below — without it the accuracy line reads "not enough data" through the entire demo. |
| 1 | **§12 tokens + `kit/`** | Before any screen. Building screens first means restyling them twice, and the 18 hand-written buttons are already the evidence for what happens without it. |
| 2 | `scheduleView.ts` + `dayGrid.ts` | Pure, testable, and everything else hangs off them. |
| 3 | `WeekScreen` — overview + day grid | The new primary surface, built on `kit/` from its first commit. |
| 4 | `blockActions.ts` + `BlockSheet` | Makes the week operable rather than a picture. |
| 5 | `TodayCard` + `todayCard.ts` | Closes the estimate and sleep loops. |
| 6 | Strip `Room` to display-only, move the gauge in, add card precedence | The room screen becomes final. |
| — | **← STOP AND DEMO FROM HERE** | Room, week, blocks, today card, rebalance. All five pitch beats except the request box are reachable, and everything on screen is on the design system. |
| 7 | `AddSheet`, and re-lay the three input screens on `kit/` | The largest remaining styling debt: `PlannerScreen`, `PhotoImportScreen` and `RequestBoxScreen` are the three files that most predate any system. |
| 8 | Recovery simplification | Smallest change on the list, and the one whose absence is least visible in a demo. |
| 9 | Deletions and `useProfile` rename | Pure removal; nothing depends on it landing. |

**Step 1 is not decoration and must not be deferred.** Every screen from step 3 onward is
written against `kit/`, so the system is paid for once. Deferring it to the end means every
screen gets styled twice, and the second pass is the one that gets cut when time runs out.

Rebalance needs no step — it moves from the `ceiling` panel to under the overview in step 2 and
gains its `smallestFix` fallback in step 3.

### Seeded data — what already exists, and what does not

`useSchedule` already falls back to `umCrunchWeek()`: a real 21-day UM fortnight with fixed
classes, assessments, errands, and a sleep pattern of 5.5h on weeknights. **The week grid will
not be empty and Rebalance will have things to move.** That half of the demo is safe today.

What is **not** seeded is the profile. `DEFAULT_PROFILE` has empty `confirmations` and empty
`predictions`, which means:

- the accuracy line reads *"not enough data"* — the pitch's credibility close, absent
- estimate bias stays at 1 — Reality Check never demonstrates anything
- the today card has nothing resolved to show against

So step 0 adds a seeded profile beside the seeded week: roughly twenty confirmations spread
across the four load types with a believable overrun bias, and five or six resolved predictions
giving a mean absolute error in the range the pitch quotes. It ships as a fixture next to
`umWeek.ts`, used on first run exactly as the week is, and it must exist **before** any UI work
so every step can be rehearsed against it.

---

## 15. Out of scope

Not in this change, and not implied by it: any change to `src/engine` or `src/optimizer`
beyond deleting `Schedule.recoveryLog`; the Telegram bot's server side; Google Calendar
import; and the room's artwork beyond removing its tap targets.
