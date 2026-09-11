# Synthetic deadlines

Non-urgent gets a deadline anyway. Health, relationships and rest have no due date, which
is why they always lose. Give them synthetic ones and let them compete on equal terms.

Every event carries a deadline. Real where one exists, synthetic where none does, and the
model treats the absence of a due date as a thing to be repaired rather than a fact to be
worked around.

## The premise, in the codebase's own words

`objective.ts` already states the mechanism as a known property of `deadlinePressure`:

> Undated work has no deadline to be late for and costs nothing.

It shows up in three places, and they compound.

| Place | What it does | Consequence |
| --- | --- | --- |
| `objective.deadlinePressure` | `if (item.deadlineDay === null) continue` | Deferring undated work is free to the solver |
| `constraints.violations` | Only rejects `dayIndex > deadlineDay` | Nothing rejects a fortnight where the walk never happens |
| `scheduleEdits.deferItem` | Clamps to `deadlineDay ?? HORIZON_DAYS - 1` | "Later" on undated work is unbounded to the horizon edge |

So health, relationships and rest do not lose because the model undervalues them. The
reserve model already punishes neglect as a *stock* — isolation drain is what sets a rested
student's social floor three weeks out, as `requestCost` records. They lose because the
*scheduling* layer has no term that mentions them at all: nothing gives the solver a reason
to put the block on a particular day rather than no day.

## Why this is not `deadlineDay`

`constraints.violations` treats `item.dayIndex > item.deadlineDay` as a **hard rejection**.
A schedule that breaks it "is rejected outright rather than scored badly, so no amount of
gain elsewhere can buy its way past".

Writing a synthetic deadline into `deadlineDay` would therefore mean that the first time a
student went a day longer than usual without a walk, their entire fortnight became invalid
and the solver could return nothing. The thing that makes a synthetic deadline useful — that
it can be missed, repeatedly, at a cost — is the exact thing `deadlineDay` is defined not to
permit.

Soft deadlines get their own field, and `constraints.ts` is told in writing to ignore it.

## The field

```ts
/**
 * Latest dayIndex this SHOULD occupy, when nothing says it must.
 *
 * Absent on items that carry a real `deadlineDay` — those are already charged, by
 * `deadlinePressure`, and charging them twice would double-count one effect.
 * Also absent on weeks saved before synthetic deadlines existed, which is what makes
 * this optional rather than required.
 */
readonly softDeadlineDay?: number
```

A sibling of `deadlineDay` on `ScheduledItem`, stamped by a new `src/domain/softDeadlines.ts`.

`user_state` holds a student's whole week as one JSON document — deliberately not
normalised, because "the schedule's shape changes with every plan in this project". So this
needs no migration. Weeks saved before it exists load without the field and are stamped on
read.

### Effective deadline

```ts
export const effectiveDeadline = (item: ScheduledItem): number | null =>
  item.deadlineDay ?? item.softDeadlineDay ?? null
```

One function, so nothing downstream has to remember the precedence. A real deadline always
wins: it is a fact about the world, and a derived number must never override one.

A `fixed: true` block with no deadline — a lecture, a shift — takes its own `dayIndex`. It
cannot move, so it is due when it is due. This falls out rather than being special-cased,
and it is what makes "every event has a deadline" true without exception.

### Where the number comes from

One constants table of tolerable gaps, in days:

| Kind | Interval | Clock starts from |
| --- | --- | --- |
| `rest` | 1 | last occurrence |
| `lightExercise` | 3 | last occurrence |
| `socialRestorative` | 4 | last occurrence |
| `hardExercise` | 4 | last occurrence |
| `studyBlock` | 5 | entry |
| `errands` | 7 | entry |
| `socialDraining` | 7 | entry |

**Rhythms restart, tasks do not.** The four kinds whose clock restarts from the last real
occurrence are rhythms: doing one satisfies the need and pushes the next due date forward.
The three that run from entry are to-dos: doing one does not make the next one less due,
because there is no next one.

"Last occurrence" is read from the block log — what actually happened, confirmed by the
student — and never from what is merely scheduled. A rest block sitting on Thursday is a
plan; a rest block the student said happened is evidence. Only the second may push a
deadline forward, or the app would congratulate a student for intending to rest.

The intervals are the app's, not the student's. §20 is explicit that no student should be
made to rank their own work, "because everybody marks everything high and the ranking
carries no information once they have." §5.1's user-set floor is a real request and a real
feature, and it is deliberately not this one — see "Not in scope".

### Why it can be stored rather than recomputed

A soft deadline depends on the item's kind, on the last confirmed occurrence of that kind,
and on when the item entered the week. **None of those change when the solver moves a
block.** It is invariant across a solve, which is what keeps it off the hot path: stamped
once, read as a field thousands of times, never recomputed inside the search.

It is re-stamped at exactly three moments: when a week is loaded, when an item is added or
edited, and when a block answer is recorded. The third is what makes a rhythm regenerate.

## The objective term

`neglectPressure`, alongside `deadlinePressure` in `objective.ts` and modelled on it
closely enough that the two read as one idea applied twice.

```
for each item:
  if item.deadlineDay !== null: skip      // already charged, do not double-count
  if item.softDeadlineDay is absent: skip
  buffer = item.softDeadlineDay - item.dayIndex
  if buffer > NO_BUFFER_LEFT_DAYS: skip   // sparse, see below
  total += consequenceOf(item, params) * min(NO_BUFFER_LEFT_DAYS + 1 - buffer, MAX_NEGLECT)
```

### Sparseness is not a simplification, it is the budget

`deadlinePressure`'s own comment records the measurement: a smooth `1 / (1 + buffer)`
falloff "gives the objective a gradient at *every* item on *every* week, so the hill climber
always has another fractional improvement available and grinds on chasing it", taking an
ordinary fortnight from **402 evaluations and 73ms to 2,407 and 222ms** — past §2.1's
sub-100ms budget, "to express a difference between five days of buffer and six that the
model has no basis for claiming."

Every word of that applies here and applies harder, because this term is charged against
*more* items — every undated one, where the existing term skips them all. So it charges
nothing until the buffer is genuinely gone.

### The lateness cap, and why it is not optional

A hard deadline in the past is a constraint violation and `constraints.ts` owns it. A soft
deadline in the past is **the normal case** — it is what "you have not seen anyone in nine
days" *is*. So lateness has to keep costing, and rise with the days.

Rising without bound is the danger. §2.1's ordering is stated in `objective.ts` as not up
for negotiation: the solver "may never trade a genuinely higher worst day for a
better-arranged week", and `worstFloor` is untouched in every mode. An uncapped neglect term
would eventually exceed any floor difference and invert exactly that ordering — a student
three weeks behind on laundry would get a wrecked worst day in exchange for a tidy one.

`MAX_NEGLECT` bounds the multiplier so the whole term stays, like `DEADLINE_PRESSURE_WEIGHT`
and `DEFICIT_AREA_WEIGHT`, a tiebreaker rather than a fourth objective. Its own weight
constant is sized so a fully-neglected week costs less than a single deficit day.

## What deliberately does not read it

**`constraints.violations`.** Stated in a comment, because the next reader will assume the
omission is a bug. A soft deadline that cannot be missed is a hard deadline, and a hard
deadline on rest would invalidate a fortnight for a student who had a busy Tuesday.

**`nearestDeadlineByDay`, and so `drain.deadlineDrain`.** That sweep produces
`daysToNearestDeadline`, which the engine turns into anticipatory mental stress: "the closer
the nearest deadline, the more mental load the day carries before any work is done."

Feeding synthetic deadlines into it would model a student carrying anticipatory stress
**about having to relax** — the app would make resting a source of dread and then prescribe
rest for the dread. This is the single most tempting wrong turn in the design, because
reusing the existing sweep is a two-line change and it looks like consistency.

**`placement.ts`.** Deferred deliberately — see "Not in scope".

## The daily recovery ceiling

A separate defect, found while designing the Rest button and worth fixing on its own merits.

`constraints.isWork` excludes rest from the daily hours cap, and `recoveryForDay` caps rest
credit at `USEFUL_REST_HOURS` **per block** rather than per day — deliberately, so that
"three separate hours of rest still pay out three hours' worth. It is the single unbroken
twelve-hour block that is suspect." Five rest blocks therefore credit fifteen hours, and a
day can be filled with protected rest that the cap never counts.

The consequence is concrete: `placeItems` places work anyway when nothing fits, that work
lands on top of protected rest, `violations` reports the overlap, and the week is invalid.
`neighbours` degrades gracefully — it accepts any move with non-increasing violations, so
the search is not stuck — but it can only repair the week by moving **work**, never rest,
because rest is `fixed` *and* `protectedRest`.

### Enforced at creation, not as a constraint

The ceiling is checked at every path that can create rest — the Rest button's gate, the
prescription accept, the event form — and reported by `editWarnings.ts`, which exists for
this kind of warning already.

It is deliberately **not** a hard constraint, and the reason is the same asymmetry as above.
A `violations` entry the solver cannot repair is a week permanently marked invalid: no move
the search can generate will ever move protected rest, because §5.1 forbids it. Blocking
creation gives identical protection with no dead-end state.

The cost of this choice is stated plainly: a week that arrives over the ceiling by some
other route — a hand-edited import, a week restored from before the ceiling existed — is not
corrected, only reported. That is the right trade against a week the app declares broken and
cannot fix.

## Checking whether a soft deadline was met

```ts
export interface SoftDeadlineMiss {
  readonly itemId: string
  readonly title: string
  readonly kind: ActivityKind
  readonly type: LoadType
  readonly softDeadlineDay: number
  readonly daysLate: number
}

export function missedSoftDeadlines(
  schedule: Schedule,
  today: number,
  blockLog: readonly BlockRecord[],
): readonly SoftDeadlineMiss[]
```

Pure, sorted by `daysLate` descending — most neglected first.

A miss is an item whose `softDeadlineDay` is behind `today` and which the block log does not
record as done. The block log is the arbiter for the same reason it is for the interval
clock: a plan is not evidence.

### `prescribe.ts` sources the what from here

`prescribe` currently decides what is being neglected from reserve levels — the emptiest
reserve below `PRESCRIBE_BELOW`. That becomes a second, uncoordinated voice the moment this
lands: "your social reserve is low" and "you have not seen anyone in nine days" are the same
sentence twice, on the same day, and a student reads that as the app repeating itself.

So `missedSoftDeadlines` becomes the single answer to "what is being neglected", and
`prescribe` asks it instead of the reserves. Everything else about `prescribe` is unchanged
and deliberately so: one prescription or nothing, never a list, still matched through
§5.2's `ADVICE` table, still sized to the real gap.

**Its signature widens to require `today` and `blockLog`, and both Telegram call sites are
fixed in the same change.** `handle.ts` calls `prescribe(week)` in two places. Making the
new arguments optional would repeat the exact fault `priceRequest`'s own comment records:
defaults "are precisely what let the Telegram `/ask` call site be silently wrong for as long
as it existed — it priced every request against day 0 of the fortnight with no check-in
evidence, compiled, read reasonably, and tested green."

## What this does to the Rest button

It repairs the hole in that design and is why its spec is amended in the same change.

The Rest spec's §1 finding was that rest in a free gap is free recovery — `drain.ts`
excludes `kind: 'rest'` from both `isDraining` and `isSwitch` — so "is it worth it" could
never answer no, and the gate was real only on the rung where work had to move.

That was true **only because nothing priced the slack the rest consumed.** Once undated
things carry soft deadlines, occupying a gap has a cost: it is slack something else needed.
So the gate becomes live on every rung.

### Repeated Rest

The brake falls out of the mechanism rather than being bolted on. Rest's own soft deadline
regenerates on the interval above, so **taking rest satisfies it and pushes it forward** —
and the second rest of the day has no deadline left to meet. It stops earning and becomes
pure cost against everything else competing for the same slack. The gate sees the cost and
refuses.

The daily recovery ceiling is the second, blunter guard behind it, for the paths a gate does
not cover.

## Testing

- **The table** — every `BlockKind` has an interval; a test that walks `BLOCK_KINDS` so a new
  kind cannot be added without one.
- **Rhythms vs tasks** — a confirmed rest in the block log pushes rest's next deadline
  forward; a confirmed errand does not push the next errand's; a *scheduled but unconfirmed*
  rest pushes nothing.
- **Precedence** — an item with a real `deadlineDay` gets no `softDeadlineDay`, and
  `effectiveDeadline` returns the real one; a `fixed` block with neither takes its own day.
- **Sparseness** — `neglectPressure` charges zero at a buffer of two days, and the solver's
  evaluation count on the ordinary fixture does not rise materially against the recorded
  baseline. This is a performance assertion and belongs in the suite, because the comment it
  is defending is a measurement.
- **The cap** — a fortnight neglected for the whole horizon scores worse than a fresh one,
  but never so much worse that a lower `worstFloor` wins. This is the §2.1 inversion guard.
- **Not read** — `violations` returns nothing for an item past its soft deadline;
  `toDayInputs` reports the same `daysToNearestDeadline` with and without soft deadlines
  present. Both are guards against a future reader "fixing" the omissions.
- **Ceiling** — creation paths refuse past the ceiling; `violations` still returns nothing
  for an over-rested day, so the unrepairable state cannot reappear by accident.
- **Misses** — sorted most-neglected-first; a done block is not a miss; `prescribe` returns
  the advice matched to the worst miss rather than to the lowest reserve.
- **Telegram** — both call sites pass real `today` and `blockLog`.
- **Migration** — a week with no `softDeadlineDay` on any item loads, stamps, and scores.

## Not in scope

- **`placement.ts`.** Making undated work back away from its synthetic deadline the way real
  deadlines do would invert `placeItems`' candidate-day ordering for every undated item,
  rippling through the add flow, the request flow and recurrence expansion. The objective
  will already pull that work earlier. Worth doing, as its own change, once soft deadlines
  have proven themselves.
- **`deferItem`'s clamp.** It still stops at `deadlineDay ?? HORIZON_DAYS - 1`. Clamping to
  the soft deadline would make "Later" refuse, which is a UX decision about a button rather
  than a modelling one, and it deserves its own hearing.
- **§5.1's user-set floor.** "The user defines their minimum; the app defends it" is a real
  request and a real feature. It needs a settings surface, persistence and a defaulting
  story, and it is a layer *on top of* this one rather than a variant of it.
- **Ranking which neglect matters most beyond `daysLate`.** `commitments.lapsed` sets the
  precedent — everything due lapses together rather than working out which one tipped it,
  "blunt but honest: the model knows the fortnight does not fit, and it does not know which
  one ask is to blame."

---

# As built

Four things in the design above were wrong, and the tests found them. Recorded here rather
than edited into the body, so the reasoning that produced the wrong answer stays visible
next to the one that replaced it.

## The neglect cap is 3, not 14, and the budget test caught it

The design set `MAX_NEGLECT` at a fortnight, reasoning that a fortnight is the horizon so a
fortnight of neglect is as bad as the model can claim to tell.

The new budget test — the one for a fortnight where *nothing* is dated, which is the shape
`hillClimb`'s own budget test never exercises — failed at **4,769 evaluations against a
3,000 bound**. That is the same order as the **4,326** `deadlinePressure`'s comment records
for §20's first attempt, and it is the same fault: my term was sparse in *buffer* but
saturated too slowly, so every late item still offered the climber a fractional improvement
and it ground on chasing them.

The fix is the codebase's own argument applied to the other side of the line. "Due tomorrow"
and "due in a week" differ in kind while "due in five days" and "due in six" do not — and
equally, one day late and two days late differ in kind while nine days late and ten do not.

`MAX_NEGLECT` is 3 and `NEGLECT_PRESSURE_WEIGHT` is 0.005, set together so the worst
per-item charge lands beside `DEADLINE_PRESSURE_WEIGHT`'s. Nothing is lost to the student:
`missedSoftDeadlines` still reports the true `daysLate`, which is what they actually see.

An earlier attempt at the weight alone (0.006 at a cap of 14) let a single neglected item
cost more than a deficit day. That was caught by the test asserting neglect never outweighs
the floor — which also turned out to be a bad test, because a 10-hour study block barely
moves a 21-day floor. It now compares against a week with two hours less sleep a night,
which genuinely lowers it.

## A rhythm still ahead is a plan, not a miss

The design said `missedSoftDeadlines` reports "an item whose `softDeadlineDay` is behind
`today` and which the block log does not record as done".

That reported a rest block booked for Friday as nine days overdue, because rest's first
deadline falls on day zero and the block is not confirmed yet. The app would go on saying
"you have not stopped in nine days" *after* the student had booked the rest — which is the
app not listening, and precisely what routing prescriptions through this was meant to end.
A failing low-energy test surfaced it: the recovery card started outranking the stuck card
on a fixture that had nothing to do with either.

A miss is now a block whose **day has gone by** unconfirmed, or a rhythm with nothing
upcoming at all. A block still ahead of today is never a miss however late it is scheduled.

The objective is unaffected and deliberately so. `neglectPressure` still charges a block
scheduled past its soft deadline, which is what pulls it earlier — the lateness is real, it
just is not something to tell somebody off about.

## Rhythms date from the fortnight, and successive ones are spaced

Two details the design left implicit, both forced by working the cases:

- With nothing ever confirmed the clock starts at **-1** — one day before day zero — so the
  first occurrence is due after exactly one interval. Anchoring "never done" at *today*
  instead is the tempting version and it is broken: the deadline would be re-derived on
  every load and walk forward with the calendar, so a rhythm could never become overdue at
  all.
- Successive occurrences of one rhythm are ranked by day and spaced one interval apart, so
  three rest blocks do not all inherit the same due day and all read as late.

## What the receipt quotes

The design said the lift is measured on the worst floor across types, arguing from
`RequestCost.floorBefore`'s own reasoning. That was wrong twice over, and the same test
caught both.

- **The fortnight's floor does not move.** It sits at the trough, which for a rested student
  is social isolation three weeks out; three hours of rest on day three does not reach it.
  This is exactly the trap `RequestCost` documents about its own floor — met again from the
  other direction.
- **Neither does the lowest of the four types on the rest's own day.** That minimum is
  social almost everywhere, and `kRest` barely touches social.

`RestGain.dayBefore`/`dayAfter` quote `overallReserve` on the day the rest lands — the same
units §1.2's dial already shows, so it is also the number the student has learned to read.
The floor pair is kept as context and is frequently unchanged, which the field's own comment
now says.

## Where the Rest gate actually has teeth

The design claimed soft deadlines make the "worth it" gate live on every rung. Building it
showed that is not true, and the honest version is narrower.

Rest dropped into a gap that was *already free* still costs nothing — `drain.ts` excludes it
from `isDraining` and `isSwitch`, and nothing about a soft deadline changes that. No block of
the student's moves, so no soft deadline can newly be missed.

So on rung 0 the gate is the **recovery ceiling**, and that is the real brake: press Rest
repeatedly and the day fills to `DAILY_RECOVERY_CEILING`, after which the ladder offers a
later day instead of stacking more onto today. The floor, deficit-day and newly-missed-soft-
deadline gates have teeth on rung 1, where something of the student's does move.

## Smaller things

- `USEFUL_REST_HOURS` is exported from `src/engine` rather than copied. Three places carried
  their own `3` with a comment saying it was this one.
- `fixThatMakesRoom` takes a `SlotNeed`, as designed. Its `deadlineDay` argument turned out
  never to have been read at all.
- Telegram needed a reply of its own for "the block log could not be read". Reusing
  `askUnavailableReply` would have answered a question about pricing a request that nobody
  asked.
- `RoomShell` is where the stamping happens, because it is the one place that already owns
  both `today` and the block log.
