# Rulings

Design decisions taken in conversation while this app was built. The code cites them constantly -- `Ruling 41`, `Ruling 45` -- and they were recorded nowhere, so a third of the reasoning in this codebase pointed at a document that did not exist.

**This index is reconstructed from the citations themselves, not from the original
decisions.** Each entry below is the most explanatory comment that cites that ruling,
quoted as found, plus where else it is relied on. That makes it a map into the real
reasoning rather than a substitute for it: the authority is still the code comment at
the cited line. Where an entry reads thinly, the ruling is one whose citing comments
assume you already know it.

Two conventions worth knowing, because the code used to blur them. `§N` now means a section of `burnout-app-spec-v3.md` and nothing else -- it stops at §13. `Ruling N` means one of these. Around 251 citations used `§N` for ruling numbers above 13, which is why a reader chasing `§45` found nothing.

Three older notations survive in comments and are not ruling numbers:

- **`§8b`** -- the task that built the durable block log (`domain/blockLog.ts`). The spec clauses it serves are §7.9, post-block confirmation, and §8.3, ignored warnings as a control arm. Left as written rather than rewritten across 60 sites, because not every citation of it is about the same half.
- **`§8b②`** -- the same task's second part: the four-way answer and its callback encoding.
- **`§0.2`** -- the second standing requirement in §0, which is a list item rather than a numbered section.

---

## Ruling 7

> Ruling 7's named syntax -- the three forms that used to pass straight through.

`src/ui/kit/palette.test.ts:59`

## Ruling 11

> §8b/Ruling 11 amended: a past day carrying no answer is a day the student went quiet,

`src/ui/room/roomModel.ts:80` — and 1 other file(s)

## Ruling 12

> Ruling 12: `RoomShell` makes `blockLog` a required prop rather than defaulting to `[]`,

`src/ui/useBlockLog.ts:14` — and 3 other file(s)

## Ruling 14

> §13/Ruling 14: the solver's two remaining hardcoded hours.

`src/optimizer/neighbours.test.ts:173` — and 3 other file(s)

## Ruling 15

> Ruling 15's second question -- "could it fit if something moved?" -- answered without building

`src/domain/placement.test.ts:199` — and 1 other file(s)

## Ruling 16

> in chat and asked first on screen. Ruling 16's rule -- never silently reshuffle -- is a property

`src/telegram/render.ts:567` — and 11 other file(s)

## Ruling 17

> Ruling 17: one candidate per insertion. A finder that returned a list here would multiply the

`src/optimizer/neighbours.test.ts:236` — and 1 other file(s)

## Ruling 18

> Ruling 18: `estimateBias` was the only parameter that learned, and this pass added `kSleep` and

`src/domain/recoveryLearning.test.ts:186` — and 2 other file(s)

## Ruling 20

> Ruling 20: four hours of final-year project and four hours of laundry were interchangeable load.

`src/optimizer/objective.test.ts:214` — and 4 other file(s)

## Ruling 21

> Ruling 21: on a fortnight with almost nothing fixed, the objective inverts from flattening peaks

`src/optimizer/objective.test.ts:278` — and 4 other file(s)

## Ruling 22

> Ruling 22's last three gaps: the fortnight at a glance, the daily check-in, and the provisional

`src/telegram/render.test.ts:570` — and 6 other file(s)

## Ruling 23

> Ruling 23: Telegram silently drops a `sendMessage` whose `callback_data` exceeds 64 bytes,

`src/telegram/render.test.ts:269` — and 3 other file(s)

## Ruling 24

> Ruling 24: navigation without a session table. Nothing is remembered between presses -- the day

`src/telegram/handle.test.ts:1311` — and 6 other file(s)

## Ruling 25

> Ruling 25's render layer, and the file was already it -- the rename is what stops the name

`src/telegram/render.ts:11`

## Ruling 26

> Ruling 26: this is the one capability the PWA does not have. Web push on iOS is unreliable and

`src/domain/proactive.ts:4` — and 2 other file(s)

## Ruling 28

> room's corner gauge and nothing else (Ruling 53): the five-bar breakdown that Ruling 28

`src/ui/room/RoomShell.room.test.tsx:15`

## Ruling 36

> Ruling 36: the schema returned one `deadlineDay`, so "WIA3001 lecture every Tuesday 9am"

`src/ai/types.ts:73` — and 1 other file(s)

## Ruling 37

> Ruling 37: the same class, noticed rather than declared. A student adding something whose title

`src/domain/recurrence.ts:33` — and 5 other file(s)

## Ruling 38

> Ruling 38: recurrence is expanded here and nowhere later, so a weekly class becomes the three

`src/domain/placement.ts:58` — and 2 other file(s)

## Ruling 39

> Ruling 39: one field, and it buys the three operations expansion otherwise makes painful --

`src/domain/recurrence.test.ts:97` — and 5 other file(s)

## Ruling 40

> Ruling 40: an end date, for semester break. Nothing monthly, nothing fortnightly, no rules. */

`src/domain/recurrence.test.ts:62` — and 3 other file(s)

## Ruling 41

> the student is already checking -- Ruling 41's whole point is that recurrence is confirmed on

`src/ui/planner/PlannerScreen.tsx:45` — and 15 other file(s)

## Ruling 42

> yet *is* a low-structure week by this measure -- Ruling 42 exists because that is common -- so

`src/optimizer/objective.ts:331` — and 5 other file(s)

## Ruling 43

> by arithmetic rather than by the student, and Ruling 43's Day select is what finally showed it.

`src/domain/calendar.ts:183` — and 25 other file(s)

## Ruling 44

> Ruling 44's anchor, said to a model. Empty for a week that has never been dated, because there

`src/ai/calendarAnchor.ts:48` — and 23 other file(s)

## Ruling 45

> Ruling 45's fourth decision: the room empties as the day is worked through. A block the student

`src/ui/room/dayLoad.test.ts:104` — and 22 other file(s)

## Ruling 46

> Ruling 46: what each object means and what is behind it today. Derived from the same week the

`src/ui/room/RoomShell.tsx:530` — and 18 other file(s)

## Ruling 47

> Ruling 47: 0..1, how much of today is already spoken for -- drawn as a clock face filling.

`src/ui/room/roomState.ts:69` — and 5 other file(s)

## Ruling 49

> Ruling 49: the log could not be READ, which is not the same as nobody having answered.

`src/ui/App.tsx:49` — and 3 other file(s)

## Ruling 50

> Ruling 50: the guard's own capability, asserted rather than assumed.

`src/ui/kit/palette.test.ts:49`

## Ruling 51

> The block log is not defaulted either: Ruling 51 made `roomModel`'s `blockLog` required,

`src/ui/request/RequestBoxScreen.tsx:34` — and 4 other file(s)

## Ruling 52

> Ruling 52. The gauge was in the DOM, carried the right number, and was invisible: the

`src/ui/room/Room.test.tsx:170` — and 2 other file(s)

## Ruling 53

> and made "the week" mean two things at once. Ruling 53 had already moved it off the room

`src/ui/reserves/ReservesSheet.tsx:12` — and 6 other file(s)

## Ruling 54

> its own full-bleed stage now (Ruling 54), and duplicating forty lines of sheet wiring

`src/ui/room/RoomShell.tsx:517` — and 2 other file(s)

## Ruling 55

> Ruling 55's choice: the words and the cards overlay the lower room instead of scrolling

`src/ui/room/RoomShell.room.test.tsx:376` — and 4 other file(s)

## Ruling 56

> {/* Ruling 56's gate, moved with what it guards. §1.5: "a student at 12% reserve

`src/ui/room/RoomShell.tsx:789` — and 2 other file(s)

## Ruling 57

> Ruling 57's companion nit, and the reason it is worth a test rather than a comment: the

`src/ui/room/Character.test.tsx:127` — and 5 other file(s)

## Ruling 58

> Ruling 58: these were centred labels and nothing else, so "Someone asked me for

`src/ui/AddSheet.tsx:35` — and 6 other file(s)

## Ruling 59

> Ruling 59: the week is a sheet like everything else, and the breakdown lives behind the

`src/ui/room/RoomShell.weekModal.test.tsx:10` — and 15 other file(s)

## Ruling 60

> Ruling 60: one level up is the block, not the week. Skipping it would make Back and the

`src/ui/room/view.test.ts:148` — and 26 other file(s)

## Ruling 61

> Ruling 61: the live cards wait behind the `Waiting` button now, so opening it is part

`src/ui/room/RoomShell.distress.test.tsx:41` — and 12 other file(s)

## Ruling 62

> Ruling 62/Ruling 44: the calendar is forwarded, not dropped. The mock used to take only the

`src/telegram/handle.test.ts:84` — and 6 other file(s)

## Ruling 63

> Ruling 63: what the sheet does with the answer, which is the part that was missing.

`src/ui/AddSheet.test.tsx:261` — and 5 other file(s)

## Ruling 64

Recorded at the time rather than reconstructed, unlike the entries above.

**A stated sleep target is a guess the app makes, not a promise it keeps.** The projection
assumes it; the solver may still place work past midnight, and the app warns when a day will
cost a night. The rejected alternative was a hard wall -- shrinking the placeable day so work
could never be booked into the hours a student said they would be asleep. That is more
faithful to the words, and it makes a crunch fortnight genuinely unsolvable: the rebalancer
loses most of its freedom exactly when it is needed. `optimizer/gaps.DAY_END_HOUR` is
therefore untouched by the whole sleep feature.

`src/data/types.ts` — the field this governs, with the reasoning in place

## Ruling 65

Recorded at the time.

**The deadline squeeze is a forecast, never a record.** When a day asks for more hours than a
day has and something is actually due, the app says so *before* the night -- and stores
nothing. It never writes a reduced figure into `sleepByDay`, because it never observed the
night. Storing it would be simpler downstream and would have the app assert what a student
slept on evidence it does not have, which is the same rule that kept the Today panel's bed
row silent for a night nobody answered.

The accepted cost, stated so it is not rediscovered as a bug: the projection stays optimistic
on an over-committed day, because it assumes the planned night. The warning sentence and the
room's own dimming light are what cover it.

`src/domain/sleepForecast.ts` — the module, and the accepted cost in its own words

## Ruling 66

Recorded at the time.

**Planning a night and checking a night are separate acts, with separate surfaces.** §8's
check-in card asks "how much sleep last night?", once a day, and then disappears: it is about
a night that already happened, and the answer is evidence. The sleep page is where a student
says what they intend, and it has an address because an intention has to be changeable.

Two consequences that look like inconsistencies and are not. The page offers whole hours
(6/7/8/9) while the card keeps its four buckets, because "under 5" is an honest thing to
report and an absurd thing to aim for. And the two write to different places -- the plan into
`Schedule.sleepByDay`, the report into `domain/sleepLog` -- which is what finally lets the app
tell "slept eight hours" from "nobody has asked yet", and so what lets it compare them at all.

`src/ui/sleep/SleepSheet.tsx` — the page; `src/ui/room/view.ts` — why it is an address


## Ruling 67

Recorded at the time.

**Sleep deprivation is charged as drain, never as negative recovery.** A night short of §6.1's
five-hour baseline costs the mental and physical reserves per hour short, added to `drain[d]`.

The obvious alternative — dropping the `max(0, …)` so the sleep credit goes negative — is
mechanically backwards. `recovery[d]` is multiplied by `efficiency[d]`, which falls as the
reserve falls, so a negative credit would get *smaller* the more depleted a student was:
deprivation would hurt a rested student more than an exhausted one, inverting §6.2's spiral
rather than deepening it. A cost belongs in drain, where `stateMultiplier` already makes costs
rise as a reserve falls.

Charged flat rather than through `actualCost`'s state multiplier. That multiplier prices the
effort of *doing* something at a given reserve, and a night that did not happen is not an
activity. The compounding arrives through the reserve itself falling, which makes the next
day's work dearer.

The coefficient is 4, not `k_sleep`'s 6 and 7. Measured: at mirrored rates a two-hour night
regime empties both reserves by day four, and once several sit at zero every bad week looks
identical — the model loses the resolution the spiral exists to show. At 4, a two-hour night
costs about 15 mental and 12 physical on the day, which is a serious visible hit that a single
all-nighter recovers from.

`src/engine/params.ts` — the coefficients and their reasoning; `src/engine/drain.ts` — the term

## Ruling 68

Recorded at the time.

**The solver prefers not to put work in a student's night, and is never forbidden from it.**
Hours of work sitting after the stamped bedtime are charged as a small penalty in
`objective.score`.

`gapsOn` treats everything from `WAKE_HOUR` to midnight as placeable, so the search has always
been free to put work at 23:00 — and nothing scored it, so among arrangements it was allowed
to make it had no preference at all for protecting a night. Measured: asked for two hours near
09:00 on a day whose only wide opening is the last one, `hourNear` returns 22:00.

The lower bound of that window was always a statement about when a student is awake —
`WAKE_HOUR = 8` exists precisely so nothing lands at four in the morning. This is the upper
bound finally saying the same thing.

Soft, not a wall. Clamping `gapsOn` to the bedtime instead would forbid the solver from ever
touching a night, which makes a crunch fortnight genuinely unsolvable exactly when the
rebalancer is most needed — the "promise rather than guess" option Ruling 64 already rejected.
This makes the solver *prefer* 14:00 when 14:00 is free, still use 23:00 when there is nowhere
else, and leaves `domain/sleepForecast` to say so honestly when it does.

Sparse in the way `deadlinePressure` is — zero until bedtime, linear after it, rather than a
falloff across the evening. That term's comment records the measurement behind the choice: a
smooth gradient on every item on every day took an ordinary fortnight from 402 evaluations to
2,407. Measured here with a bedtime stamped on both fixtures, the eval count and score are
unchanged, because neither fixture places work past 23:00.

Weighted like `DEADLINE_PRESSURE_WEIGHT` and for the same reason: §2.1's ordering is not up for
negotiation, and the solver may never trade a genuinely higher worst day for a better bedtime.
A test pins that as an inequality rather than trusting the weight to stay small.

`src/optimizer/objective.ts` — the term; `src/optimizer/types.ts` — why the bedtime is stamped
rather than derived

## Ruling 69

**A threshold cannot be learned by nudging it, so how much sleep is enough gets its own
estimator rather than a fifth row in `recoveryLearning`.**

`domain/recoveryLearning` already learns four figures from §8.1's prediction residuals, and the
obvious home for a fifth was beside them. It cannot go there, and the reason is structural
rather than a matter of tidiness.

That learner works by finite difference: bump a coefficient by 20%, re-run the projection,
and see how far the claim moved. `PredictionBasis` stores that sensitivity at prediction time,
and a sample whose sensitivity falls under `MIN_SENSITIVITY` is discarded as unattributable.
The module's own docstring already refuses `socialFloorHoursPerDay` on exactly this ground —
a threshold's derivative is zero everywhere except a cliff, so a finite difference reads either
nothing or nonsense.

For a ceiling on sleep credit it is worse than zero-most-of-the-time, and worse in one
direction only. Nudging the ceiling UPWARD changes the projection not at all for any student
whose nights already sit below it — which is most students, most fortnights. Every one of
those samples measures zero sensitivity and is thrown away. So the learner could only ever
observe evidence that pushes the figure up, and "seven hours is enough for me" is a correction
DOWN. A learner that can only move one way is not a learner.

What identifies a threshold is a comparison, not a derivative. `domain/sleepEnough` splits the
student's reported nights at their own median, takes the mean residual on each side, and asks
whether the longer nights landed systematically worse than the shorter ones did. If they did,
the app has been crediting sleep this student does not benefit from and the ceiling comes down
toward the split; if they landed better, it goes up past the longest night on record.

The split is at the student's own median rather than a fixed hour, which keeps the two groups
balanced whatever their sleep looks like — five-and-six-hour nights get a comparison and so do
eight-and-ten-hour ones. Both sides must clear `MIN_SAMPLES_TO_SPEAK`, which is what silences
the app for a student whose sleep never varies: there is no comparison to make, so the
population figure stands, by the same mechanism every other unmeasured parameter is silent.

The evidence bar is two-sided, and the second side was missing at first. Both groups must clear
`MIN_SAMPLES_TO_SPEAK`, AND their mean nights must sit at least `MIN_GROUP_SEPARATION_HOURS`
apart. The sample floor alone is not enough because a median split ALWAYS produces two groups:
measured on the first implementation, three nights of 7.4 hours against three of 7.6 cleared
the floor, got compared, and produced "about 7.9 hours is enough for you" out of twelve minutes
of variation and three ordinary bad days. Residuals absorb exams, colds and arguments along
with sleep, so two groups that are the same night twice will still differ. An hour, because
below it there is no plausible reading on which the difference is about sleep at all.

That makes the estimator rarer, which is the right direction. It exists for the student whose
nights genuinely swing between five and nine, not for one whose sleep is a flat line with
rounding on it.

What is NOT solved, and cannot be solved in code: the residual is confounded. It measures
everything about a day, and sleep is one input among many. Three pairs a side is a floor, not a
statistical claim, and the honest mitigations are the strict bar, the residual cap and the
clamp rather than a test.

Two habits are copied from `recoveryScales` with their reasoning rather than invented. Residuals
are clamped into a believable band before averaging, so a day sixty points from its claim —
a day that went wrong for reasons no sleep model explains — cannot rewrite what this student
needs every night. And the result is clamped to what a night could believably be for anybody.

It reaches the engine through `paramsFor`, the same single door as the other two learners, and
is assigned rather than multiplied because it arrives already in hours.

The app says the figure and acts on it. It does NOT rewrite the target the student stated: a
measurement about somebody is not licence to edit what they told you. A test in
`RoomShell.sleep.test.tsx` keeps those apart, because the code that would do the second is one
line from the code that does the first.

`src/domain/sleepEnough.ts` — the estimator; `src/engine/params.ts` — why the population
figure is nine rather than eight (it leaves room to learn downward); `src/engine/recovery.ts`
— where the ceiling binds
