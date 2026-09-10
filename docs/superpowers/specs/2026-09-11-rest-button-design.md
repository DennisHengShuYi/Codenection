# The Rest button

A student who is flat presses one control and gets time off put into their week — or an
honest account of why they cannot have it. The app decides where it goes, whether anything
has to move for it, and says so before changing anything.

## The finding this design is built on

`drain.ts` excludes `kind: 'rest'` from both `isDraining` and `isSwitch`. A rest block
dropped into a free gap adds `restHours × k_rest` of recovery, costs no drain, and does not
even register as a context switch.

So the question "is resting worth it?" is vacuously yes whenever rest simply fits. The
engine cannot refuse free recovery, and a design that pretended otherwise would be
theatre — a gate that never closes.

The question has teeth in exactly one place: when making room means moving the student's
own work. A displaced block lands on another day where it costs more under the §6.6 state
multiplier, may sit nearer a deadline and so carry more `deadlineDrain`, and does add a
context switch. That combination can leave the fortnight worse than it started.

The verdict therefore splits, and the split is the design:

- **Rest fits as things stand** — "worth it" is not a gate. It is the receipt §5.4 asks
  for: reserve before, reserve after, and the shift in the projection.
- **Rest needs something moved** — "worth it" is a real gate, and it can say no.

### Amended by synthetic deadlines

The paragraph above was true **only because nothing priced the slack the rest consumed.**
`2026-09-11-synthetic-deadlines-design.md` gives every undated item a soft deadline, which
means occupying a gap now has a cost: it is slack something else needed.

So the gate is live on **every** rung, not only the one where work moves. The ladder below
is unchanged; what changes is that rungs 0 and 2 can now refuse, and the two extra
conditions in "The gate" apply everywhere.

The brake on repeated Rest falls out of the same mechanism. Rest carries its own
regenerating soft deadline, so taking rest satisfies it and pushes it forward — and the
second rest of the day has no deadline left to meet. It stops earning and becomes pure cost
against everything competing for the same slack.

## The ladder

Four rungs, tried in order. The first that succeeds is the answer.

### Rung 0 — it fits

Walk `gapsOn(week, today)`. Clip each gap to `[max(gap.startHour, nowHour), gap end]` and
discard anything left under `MIN_GAP_HOURS`. Take the earliest survivor.

- `hours = min(gap hours, USEFUL_REST_HOURS)` — three hours, because past that
  `recoveryForDay` credits nothing and a longer block would promise recovery the model
  refuses to pay out.
- `startHour = nowHour` when now falls inside the gap, otherwise the gap's own start.

Deliberately **not** `slotOn`. That function prefers `REST_HOUR` of 20:00, which is the
right answer for planning rest and the wrong one for a student who is flat at two in the
afternoon. Rung 2 uses `slotOn` precisely because rung 2 *is* planning.

Hours already gone are never offered. Rest is scheduled forward from now or not at all.

### Rung 1 — one move opens room

No gap survives from `nowHour` onward. Ask `fixThatMakesRoom` for the single move that
opens one on today.

This is the right tool rather than a convenient one. `smallestFixes` filters to
`rank > 1e-9`, so every candidate it returns already improves the fortnight on its own
terms — days out of deficit first, then depth, then floor. `fixThatMakesRoom` then narrows
that list to moves which actually open a slot on the day in question, which is a different
question from "does this help the fortnight" and the reason the filter exists at all.

**The gate.** Project the week with the move applied *and* the rest block in the opened
slot, against the week as it stands. Require all four:

- the worst floor across all four reserves does not fall,
- deficit days do not rise,
- no soft deadline is newly missed that was being met before, and
- the day is not already at its recovery ceiling.

Failing any drops to rung 2. The move helping on its own is not sufficient, because the
rest block occupies the room the move made and the displaced work has to go somewhere.

The last two conditions come from the synthetic-deadlines design and apply on **every**
rung, including rung 0 where nothing of the student's moves. They are what stop repeated
Rest from delaying everything indefinitely, and the ceiling is what stops a day being
flooded into the invalid state described there.

### Rung 2 — the earliest later day with room

Reached when no move opens room today, or when rung 1's gate refused. Scan days
`today + 1` forward to the end of the horizon, taking the first where
`slotOn(week, day, need)` returns a slot. Here `REST_HOUR` is correct: this is
pre-committed rest, not rest now.

This crosses a line `prescribe.ts` drew on purpose. That function considers only day 0 and
says so: widening it "would mean inventing a notion of 'soon' the model does not have."
The line holds for *advice* — a suggestion about tomorrow arriving unprompted is a
different and weaker thing. It does not hold for *placement*: `placeItems` already searches
forward across the horizon for somewhere a block fits, so a forward search is a gesture
this codebase already makes. `restNow.ts` must carry this reasoning in a comment, because
the next reader will otherwise see it as an inconsistency.

### Rung 3 — refused

No gap today, no move that opens one, no day in the horizon with room. Say what is
blocking it, in the register `describeRebalance` already uses for an overloaded week with
nothing to move. Rare, and real for the crunch fixture.

## Shape

```
src/domain/restNow.ts     pure — no clock, no React, no I/O
```

```ts
export interface RestBlock {
  readonly dayIndex: number
  readonly startHour: number
  readonly hours: number
}

/** The receipt. Mirrors RequestCost, measured in the opposite direction. */
export interface RestGain {
  readonly floorBefore: number
  readonly floorAfter: number
  readonly firstDeficitDayBefore: number | null
  readonly firstDeficitDayAfter: number | null
  readonly deepestLift: number
}

export type RestPlan =
  | { readonly kind: 'fits';      readonly block: RestBlock; readonly gain: RestGain }
  | { readonly kind: 'needsMove'; readonly block: RestBlock; readonly move: Fix; readonly gain: RestGain }
  | { readonly kind: 'laterDay';  readonly block: RestBlock; readonly gain: RestGain; readonly whyNotToday: string }
  | { readonly kind: 'refused';   readonly why: string }

export function planRest(
  schedule: Schedule,
  params: EngineParams,
  today: number,
  nowHour: number,
  blockLog: readonly BlockRecord[],
): RestPlan
```

`nowHour` and `blockLog` are required parameters, not defaults. This follows
`priceRequest`, whose own comment records that optional `today` and `blockLog` are exactly
what let a Telegram call site be silently wrong for as long as it existed. A caller with no
evidence says so in writing, at the call site.

### Where the gain is measured

`RestGain` mirrors `RequestCost` field for field, with `deepestLift` where that has
`deepestDrop`. One difference matters and is not an oversight.

`priceRequest` measures on `item.type`, because a request draws from one named reserve, and
measuring on the projection's `worstFloor` reported zero cost for the commonest request
there is. Rest credits **all four** reserves through `kRest`, so measuring it on a single
type would understate it in the same way and for the same reason. The lift is therefore
measured on the worst floor across types — the same conclusion reached by applying the same
argument to a different case.

**`capacityAfter` is deliberately not copied across.** `RequestCost` computes it as
`overallReserve(withRequest.start)`, and `.start` is the fortnight's opening reserves,
which adding a block does not touch. For a request that number is context beside a price
that does move. For rest it would be the headline, and a headline that reads the same
before and after is worse than no headline. The sentence on the screen therefore quotes
`floorBefore → floorAfter`, which are read off the projection and do move.

This is an observation about `priceRequest`, not a change to it. Nothing in this design
touches that function.

### What `type` the rest block carries

`'mental'`, with `kind: 'rest'`. §5.2's matching gives mental depletion "actual downtime",
so a block that is always rest is always mental's answer.

The choice is nearly free either way, and saying why keeps a later reader from hunting for
significance that is not there: `recoveryForDay` credits rest to all four reserves through
`kRest` regardless of `type`, `isDraining` excludes it, and `preferredHour` branches on
`kind === 'rest'` before it ever reads `type`. Naming it `'mental'` is the honest label
rather than a lever.

### One targeted refactor

`fixThatMakesRoom` takes a `ParsedItem` but reads only `hours`, `type` and `kind` from it —
a `SlotNeed`. Narrowing the parameter to `SlotNeed` lets rest reuse it untouched and makes
the existing add-flow call site honest about what it actually depends on. No behaviour
changes; the add flow constructs the `SlotNeed` it was already constructing internally.

## Screen

A **Rest** control in the room's top row.

It is placed **first**, before `The week`, for a stated reason: the row's own comment
records that at 320px it is wider than the screen and relies on `flex-wrap`, so position
decides what survives on the first line.

It is also the one control that **stays visible in `lowEnergy` mode**. `The week` and
`Waiting` are both behind `!lowEnergy` because §1.5 strips the view when a student is flat.
That is precisely when a student needs this button, so hiding it would strip away the one
thing the reduced view exists to serve.

Routing follows `'rebalance'` exactly: a new `View` kind `'rest'` with a `/rest` address,
and the plan itself held in `RoomShell` rather than reconstructed from the URL — a plan is
about a moment, the same way a solve is.

`RestPreview` is one sheet with four faces, one per rung. Every path previews before it
applies, including the one where nothing of the student's moves.

### What it says

One sentence and two numbers, in `RecoveryCard`'s register — one title, one sentence, two
buttons.

- fits: "Two hours off, starting now. Takes you from 62 to 71." The two numbers are
  `floorBefore` and `floorAfter`.
- needsMove: the same, plus the move named in its own words, from `Move.describe`.
- laterDay: the same, plus one line on why not today.
- refused: one sentence on what is blocking it, and no primary button.

The full §5.4 receipt, the evenings-equivalent framing and the deficit-day arithmetic are
computed in `RestGain` and deliberately not all shown. A depleted person cannot read a
dashboard, which is the same conviction §5.2 states about menus.

## Applying it

Approve on `fits` and `laterDay`: `scheduleRecovery(week, block)`.

Approve on `needsMove`: `fix.move.apply(week)` first, then `scheduleRecovery` on the
result.

`scheduleRecovery` remains the only door to `protectedRest`, and the block it creates is
`fixed: true` as well as protected. §5.1 calls optimizer-immovable recovery the most
important design decision in the app; a student asking for it themselves is a stronger
claim on that protection than the app suggesting it unprompted.

Discard restores nothing, because nothing was applied. This is why the preview holds the
plan rather than mutating the week and offering undo.

### On displacing work

`placement.ts` states that nothing already in the week is ever touched, and §16 forbids
silent displacement. Rung 1 is not silent: the move is computed, named, shown, and applied
only on an explicit approval — the same contract `RebalancePreview` already has for the
full reshuffle. The rule being honoured is "no silent displacement", and this design
honours it.

## Testing

Unit tests on `restNow.ts` carry the weight, because it is pure and every rung is a
question about a schedule rather than about a screen.

- **Rung 0** — a gap after `nowHour` is used; a gap entirely before `nowHour` is not; a gap
  containing `nowHour` starts at `nowHour`; a five-hour gap yields three hours, not five; a
  twenty-minute gap does not qualify.
- **Rung 1** — a packed day where one move opens room returns `needsMove` with that move;
  the gate refuses a move that lowers the worst floor; the gate refuses a move that adds a
  deficit day.
- **Rung 2** — reached when no move opens room, and when rung 1's gate refuses; picks the
  earliest day with room, not merely a day with room.
- **Rung 3** — the crunch fixture with every day full returns `refused`.
- **Gain** — measured on the worst floor across types, demonstrated by a case where a
  single-type measurement would report no lift.
- **Purity** — same inputs, same plan; no `Date` read inside the module.

Component tests on `RestPreview` for the four faces and for the absence of a primary button
on `refused`. `RoomShell` tests for the button's presence in `lowEnergy` mode, for the
`/rest` address, and for approve applying the move before the rest on `needsMove`.

A regression test that `fixThatMakesRoom`'s narrowed signature leaves the add flow's
behaviour unchanged.

## Not in scope

- Failed-recovery logging. §7 replaced the permanent suppression log with a same-day
  dismissal, and this design does not reopen it.
- A duration picker. That is a menu, and §5.2 is explicit.
- The physical door and §5.3's curated outings.
- Pre-committed rest as a per-day action on the week screen. Rung 2 reaches later days
  already; a planning gesture on `WeekScreen` is a separate feature.
- Any second scheduler. All displacement stays with `smallestFixes`, per §16 and
  `placement.ts`'s own reasoning about two systems disagreeing.
