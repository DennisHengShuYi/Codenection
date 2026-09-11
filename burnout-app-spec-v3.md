# Stress & Workload Manager: Specification v3

**Track:** Lifestyle, Beating the Burnout
**Platform:** Installable PWA (React, TypeScript, Tailwind, Framer Motion, Supabase, Vercel)
**Working name:** TBD

> **Version history.** v1 was a burnout simulator headlining visibility. v2 pivoted to a refusal engine, arguing students already know how buried they are. v3 returns to the load-manager framing (team decision), structured around the team's five focus areas. Declining survives as a tool inside load balancing rather than as the thesis. The room and the capacity dial are combined rather than chosen between.

---

## 0. Thesis and structure

**The app manages what a student is carrying, from seeing it through to recovering from it.**

Five promises, one feature cluster each. This structure is the spec, the build plan, and the pitch.

| # | Promise | Section |
|---|---|---|
| 1 | See everything in one glance | §1 |
| 2 | Balance the load | §2 |
| 3 | Plan properly | §3 |
| 4 | Start without paralysis | §4 |
| 5 | Take breaks before burnout | §5 |

Supporting: the engine (§6), calibration (§7), validation (§8), Malaysia specifics (§9), technical (§10), scope (§11), pitch (§12), the chat channel (§13).

### Standing requirements

These apply to **every screen, component and feature in this document**. Not a phase at the end. A feature is not done until it meets them.

1. **Responsive at every breakpoint.** Mobile-first at 390px. Every screen works at 320px, 390px, 768px and 1280px+. No horizontal scroll, no clipped content, no overlap, at any width. Detail in §10.
2. **One-handed reachability.** Primary actions in the lower half of the viewport on mobile.
3. **Three taps maximum** to any core action: log a task, approve a decline, take a recovery block, start a stuck task.
4. **Accessible as built, not retrofitted.** See §1.5 and §11.
5. **No cold start.** Every screen renders something useful with zero user data.

### Known limitations, stated up front

Carry these into the pitch rather than waiting to be asked.

- **The long projection is not verifiable.** If it says day 14 and you rebalance, you never learn whether it was right. It is a decision aid. What we validate is the 48-hour claim (§8).
- **"Time" is the unit, not a category.** The brief lists five areas and we surface five labels, but the model uses four load types measured in time-weighted units. Schedule density is a derived view, not a fifth bucket.
- **Web-first costs us sensor access.** Sleep, steps and screen time sit in the phone already. We chose PWA for demo friction and deployability. Capacitor is the migration path, same React codebase, and it is also what a true home-screen widget would need.
- **The optimizer may have little to move.** Verified in week one, see §2.5. Under this framing the optimizer is load-bearing, so this test matters more, not less.

---

## 1. Focus 1: see everything in one glance

### 1.1 The home screen is a composite

**The room is the surface. The capacity dial sits in one corner as a compact readout.**

Neither alone is right. The dial is precise, conventional and unambiguous, but it is the screen every wellness app already has, and it cannot express that social at 14% is bad in the *opposite* direction from mental at 140%. The room carries composition and total without reading, and does a job a number cannot, but it risks reading as a game and is slower to build.

Together: the room gives the instinct, the dial gives the number, no tap required for either.

### 1.2 The capacity dial

- Semicircular gauge, 0 to 120%, with the needle past the maximum when overloaded.
- Headline percentage in the centre. This is the brief's own example ("you're at 90% capacity this week") delivered literally.
- Five domain bars beneath or beside, each against **its own ceiling**, not a shared scale.
- Trend glyph per domain (▲ ▬ ▼), so severity is never carried by colour alone.
- **Low social is flagged as a warning, not as "good."** Most trackers would count low social load as healthy. Flagging it proves the model understands burnout rather than summing hours.

**Build this first.** Roughly two hours, and it de-risks focus 1 completely. If the room lands, it wraps around the dial. If time runs out, the dial alone is a complete answer to focus 1 and the room becomes a roadmap item.

### 1.3 The room

One screen, not an environment.

| Object | Encodes |
|---|---|
| Ceiling weights | Total load, pressing lower as it rises |
| Paper stack | Mental load |
| Floor clutter | Errands, one box per pending item |
| Plant | Physical health, wilting with sleep debt and inactivity |
| Bed | Sleep debt |
| Window weather | The projection, rendered literally |
| Light level | Reserve |
| Door | Lights when getting outside is the highest-value action |
| Character posture, colour, expression | Reserve state |

Character states: Flattened · Running low · Holding on · Steady · Rested.

**Interaction.** Tap any object for its numbers. Tap a clutter box to complete or defer, with real model consequences. Tidy-up animation when a rebalance is applied.

**Two-state comparison.** In the decision flow (§2.3) the room appears as *now* and *if you accept*. Side by side above 768px, toggle below.

**The gamification rule.** The character reflects, never scolds. No death, no dying plant, no broken streaks, no leaderboards on rest. Resist the pet framing specifically: a pet creates obligation, and obligation is more load. This is a mirror, not something you can kill.

**Scope guard.** One room, nine bindings, one tidy-up sequence. No room editor, no unlocks, no customisation. That is a different product and it will eat the weekend.

### 1.4 Getting everything into the app

Focus 1 depends entirely on the app knowing about everything. Three input paths, in priority order.

**Primary: OCR.** One button, camera or gallery, model identifies what it is looking at.

- **Assignment brief OCR.** Deadlines, weightings, word counts from a photographed course outline. Higher value than timetable OCR, because deadlines cause the pile-up.
- **Timetable OCR.** Screenshot or PDF to vision model to structured JSON. Skip Tesseract: timetables are grids and traditional OCR scrambles them. Vision models handle grid layout natively.
- **Shift roster photo.** Part-time students receive schedules as photos in group chats.
- **Photo of anything.** The entry point is not restricted to the three document types above. A handwritten planner page, a notebook, a whiteboard from a group meeting, a Post-it, a lecture slide with deadlines on it. The vision model does the identification, so widening what the camera accepts costs almost nothing. This also handles a real behaviour: plenty of students plan on paper, and turning a photographed notebook page into a structured week is something no other team will do.

Schema: course code, day, start, end, venue, weeks active, **confidence**. Semester dates captured at import so recurring load stops correctly at break.

**Never import silently.** Confirm screen, low-confidence rows flagged, one-tap correction. A wrong class time silently poisoning every prediction is the fastest way to lose trust, and users cannot debug what they never saw.

**Secondary: Google Calendar (optional supplement).**

> **Team decision required.** Wing Teng's version treats Google Calendar as the primary input. This spec treats it as a supplement. Calendar is easier and more reliable to parse, but most Malaysian uni students do not keep their timetable in Google Calendar, so it risks returning an empty week and a hollow first impression. Recommendation: OCR primary, calendar as an additive import for those who use it, never as the only path. Decide before building the import UI.

**Tertiary: the say-anything planner (§3.1)** for everything unstructured.

### 1.5 Accessibility of the glance layer

- Full text equivalent of every room object state and every dial value. This is the primary view in low-energy mode and for screen readers, not a fallback.
- Severity never carried by colour alone: pair with position, shape, label.
- Reduced-motion setting keeps the app fully functional.
- **Low-energy mode.** Below a reserve threshold the interface collapses to one number and one action. A student at 12% reserve should not be handed a dashboard. This is a product decision as much as an accessibility one, and it is also the fallback for any screen that cannot be made to work at 320px.

---

## 2. Focus 2: balance the load

### 2.1 Auto-Rebalancer

Must be a solver, not a shuffle.

**Fixed:** classes, shifts, hard deadlines, already-protected rest.
**Movable:** soft deadlines, undated work, errands.

**Objective: maximise the minimum reserve across the 21-day horizon.** Not total load, not evenness. Burnout is a floor problem. A fortnight that averages fine but bottoms out at 8 is still a crash.

```
score(schedule) = min(reserve[d] for d in 0..21)
                  − 0.3 × count(days below deficit)
                  − 0.1 × fragmentation penalty
```

The fragmentation term stops the solver from "fixing" your week by scattering ten small tasks across every day, which reduces peak load but drains more through context switching.

**Search: hill climbing with random restarts.** Neighbours are generated by moving one movable task one day, batching two same-type errands into a block, inserting a rest block into a gap, or **reordering within a day** (§6.6). Best neighbour, repeat to convergence or 200 iterations, three restarts. Roughly fifty lines, under 100ms on a phone. No solver library, no backend call.

**Hard constraints.** Nothing past its deadline. Nothing overlapping a fixed block. **Protected rest never moves**, which is the constraint that expresses the app's whole stance. Daily hours capped so it cannot solve your week with a 14-hour Sunday.

**Reporting.** Never "optimised." Always specific: "Moved three things, batched four errands into Saturday morning, added a rest block Friday evening. Your worst day goes from 8 to 41." One tap to undo all of it.

### 2.2 Variants

- **Smallest-fix search.** Same machinery, single move, top three by effect. "Move the lab report to Monday. Day 21 reserve goes 11 → 44." A student will do one thing; they will not follow a nine-change reshuffle.
- **Rebalance for a target.** "What do you want to protect this week": sleep, one social thing, gym, a specific deadline. People follow plans built around something they chose.
- **Sensitivity ranking.** Which single lever moves the horizon most. Usually sleep.
- **Errand batching** by location and time window.

### 2.3 Declining, as a balancing tool

Demoted from thesis to tool, but the mechanics survive intact.

- **The request box.** Paste, type or speak an incoming request. Back comes a cost estimate and a drafted reply. No messaging-app integration: a share target was considered and rejected as Android-only for PWAs, unsupported on iOS, and awkward to demo on a laptop.
- **Price the request in what gets given up.** Never "this takes 6 hours." Always "this costs you two gym sessions and one evening out, and moves your deficit crossing from day 21 to day 14." The optimizer already knows which recovery blocks get eaten, because it just tried to fit it.
- **Warn before accepting.** "This pushes you to 105%." Shown with the two-state room comparison (§1.3).
- **Drafted declines, user approves.** The app never declines autonomously. It does the *work* of declining; the user keeps the *decision*. Three tones: soft decline, defer with a proposed date, accept with a named trade-off.
- **Provisional yes with auto-expiry.** Every acceptance carries a review date the model picks. If reserve cannot hold it by then, it lapses and the app drafts the withdrawal. Students do not struggle to say no because they lack a reason; they struggle because saying no requires an act. This flips the direction of effort.
- **Weekly load budget.** Set once. Adding beyond it forces removing something first, physically, before the app accepts it. A trade, not a dismissible warning.
- **Extension drafter.** When a week is unsalvageable, draft the message to the lecturer with a proposed date the model says can actually be met.

### 2.4 Reality Check

Corrects the student's time estimates against their own history rather than asking them to be more realistic.

Planned vs actual on every completed task, learned per load type. Surfaced as a padding multiplier applied silently, and as a line on the "how you work" screen (§7.6): "You underestimate writing by 1.7×. We pad it automatically."

### 2.5 Week-one validation task

**Do this before building any rebalance UI.**

Load a real UM timetable plus a realistic assignment set into the objective function. Run the solver. Count the degrees of freedom.

For a typical final-year student the movable set may be small. If rebalance returns "moved one thing by a day," then **smallest-fix search, within-day reordering and rest insertion carry focus 2 instead**, and the full optimizer drops out of the headline. That is a fine outcome, but you want to know in week one, not week three.

---

## 3. Focus 3: plan properly

The gap in earlier versions. The app had a solver but never helped anyone *make* a plan.

### 3.1 Say-anything planner

**Unstructured thoughts in, structured week out.**

A single box. The student types, pastes or speaks whatever is in their head, in whatever order, with no formatting:

> "essay due friday 2000 words haven't started, mums birthday sunday need a present, gym been skipping, group meeting sometime this week, laundry, that internship application"

The model returns a structured set: each item with a load type, an effort estimate, a deadline if one is implied, and a hard/soft flag. Shown as editable chips before anything is committed.

This solves the friction problem that kills every task app. Manual task entry is the single largest reason students abandon planners, and it is the reason the rest of this spec is worthless if nobody enters anything.

**Voice input** through the same pipeline. Speaking a brain dump is faster than typing one, and it is also an accessibility win.

### 3.2 Confirm, don't assume

Same principle as OCR import. Parsed items appear as chips the student can retype, recategorise, or delete with one tap. Nothing enters the model unconfirmed.

Low-confidence extractions are visually flagged rather than silently guessed.

### 3.3 Plan generation

Once items exist, the optimizer (§2.1) produces a proposed week, not just a rearrangement of an existing one. Same machinery, empty starting state.

Output is a plan the student can accept wholesale, accept partially, or ignore. Never auto-applied.

### 3.4 Feasibility at block level, not just week level

With state-dependent cost (§6.6) the plan can be honest about individual blocks:

> "You have gym at 5. Your 7pm study block will realistically run at about 70%, so I've shortened it to 90 minutes."

That is where students actually feel the problem, and it is what "plan properly" should mean.

---

## 4. Focus 4: start without paralysis

A distinct failure mode from overload, and the only one in this document not caused by carrying too much. A student at 60% capacity can still be completely stuck on one task.

### 4.1 Micro-Start

**Permission at task level.** "You don't have to write the essay. You have to open the document and write the title. Eight minutes." Same shape as the refusal layer: reduce what the person is carrying *right now*.

**Triggers, both required:**

- **Automatic.** A task sits untouched past a threshold. Suggested: two scheduled slots missed, or three days past first appearance.
- **Manual.** A "Micro start" button on **every** block, with no exceptions — a fixed class, a block already in the past and protected rest all carry it, because those are a large share of what a student is actually stuck on. Zero friction, no explanation asked for. What keeps this safe on rest is not a missing button but what the rest and sleep chains *say*: they lower the bar to resting and never ask anybody to finish, complete or get through it. (Amended 2026-09-11.)

**Behaviour.** Task title plus context to the model, returning an ordered **chain** of concrete first actions, each time-boxed under ten minutes. **Exactly one is shown at a time**: ticking the current step reveals the next, and the others are never on screen. Never a visible list, for the same reason as §5.2 — a stuck person cannot choose from a menu, and a wall of unticked boxes reads as proof of how much is left. Revealing one step at a time asks for no choice at all, which is what that reasoning actually protects.

> Amended 2026-09-11. This section previously read "returning **one** concrete first action... One action, never a list." The single action was real but thin: it unstuck the first minute and left the student with no way through. The prohibition being made was against *choosing*, and a chain that reveals its next rung only when the current one is ticked never asks anyone to choose — so the constraint is met rather than overridden. See [`docs/superpowers/specs/2026-09-11-micro-start-ladder-design.md`](docs/superpowers/specs/2026-09-11-micro-start-ladder-design.md).

**Learning.** Log which micro-starts actually led to work. If "open the document" works for this student and "make an outline" does not, stop suggesting outlines. Same two-tap machinery as the block ratings in §6.6.

**Model effect.** A stuck task accrues mental drain without accruing progress, so paralysis shows up as rising mental load with flat completion. That divergence is itself a detectable signal and can trigger Micro-Start automatically.

---

## 5. Focus 5: take breaks before burnout

### 5.1 Structural

- **Rest is a scheduled object with weight**, sitting in the plan next to assignments and consuming real time. Not a notification. The optimizer treats it as fixed and cannot move it to fit work in. **The most important design decision in the app**, because it makes recovery structurally protected rather than optional.
- **User-set hard floor.** The user defines their minimum; the app defends it.
- **Recovery budget.** Unspent rest shows as a deficit in red, exactly like unfinished work. Students already understand budgets and guilt about unspent things; point that machinery at the right target.
- **Recovery debt** carries forward when blocks are skipped.
- **Pre-committed rest.** During a calm week, schedule rest for the crunch week ahead. The app then only defends a decision the user already made rather than persuading a depleted person to rest now.
- **Recovery has a ceiling as well as a floor.** Rest blocks have a maximum useful duration, past which returns go flat and then negative. A 12-hour scroll session is not recovery, and the model must not count it as neutral free time. Passive screen time scores as low-quality recovery, well below a walk or sleep. When a block overruns significantly the app checks in rather than assuming it worked. This is where failed-recovery logging matters most: doom-scrolling will consistently rate as "didn't help," and the model should stop counting it.

### 5.2 Prescriptions

- **Matched to the depleted type.** Social low prescribes a person. Physical low prescribes movement. Mental low prescribes actual downtime, not a different screen.
- **Sized to the real gap.** 40 minutes free at 3pm gets a 40-minute suggestion, at 3pm, nearby.
- **One option only.** Depleted people cannot choose from a menu, and every extra option lowers the odds of any action.
- **Failed recovery is logged.** If lying down does nothing but a walk works, the app stops prescribing the failure.

### 5.3 Getting out of the house

Named explicitly in the brief, so it becomes an interface element rather than a message.

The **door lights up** when it is the highest-value move. Tap it, get three nearby options filtered by gap and budget, tap one, it is scheduled and protected. Three taps from feeling bad to having a plan.

Curated local list rather than a live maps call, so it is instant and cannot fail during judging.

**Optional stance:** at critical reserve the door is the only interactive object and tasks grey out. The app refuses to help you work. On by default, disableable so it is never coercive.

### 5.4 Making recovery visible

- **Recovery receipt.** After a rest block: reserve before, after, and the shift in the projection. Rest feels unproductive because its effects are invisible. Make them visible and it stops feeling like slacking.
- **Immediate response.** The figure straightens, the light lifts, the projection rises. The causal link is what turns a suggestion into a habit.
- **Momentum, never streaks.** "Four recovery blocks in the last two weeks," with the reserve line alongside. No punishment for gaps.

### 5.5 Social recovery

- **Route the nudge through someone else.** When social reserve hits zero, show a friend who is also low. Reaching out to help is easier than reaching out for help, and both parties benefit.
- **Status broadcast, not schedule sharing.** Share a reserve band with a small circle. A friend sees you have been in deficit a week without seeing your tasks.
- **Load-aware hangout matching** on overlapping free windows.

---

## 6. The engine

Justification infrastructure for everything above. It does not need to be right, it needs to be **defensible**.

### 6.1 Structure

Four coupled load types, measured in time-weighted units:

`mental` · `physical` · `social` · `errands`

Five labels surface in the UI to match the brief's wording; the taxonomy underneath is four, with schedule density as a derived view.

```
reserve[d+1] = reserve[d] − drain[d] + recovery[d] × efficiency[d]

drain[d]      = Σ (task_hours × type_intensity) × estimate_bias
recovery[d]   = max(0, sleep − 5) × k_sleep + rest_blocks × k_rest
efficiency[d] = 0.45 + 0.55 × (reserve[d] / 100)
```

### 6.2 The mechanic that makes it real

**Recovery efficiency falls as reserve falls.** At full reserve you get 100% of your rest back. At 20% reserve, 56%.

This nonlinearity produces the spiral where things look survivable right up until they aren't. It is the phenomenon the brief's background paragraph describes, and it is what a linear tracker cannot represent.

### 6.3 Coupling

Physical depletion drags mental capacity. Social isolation slows recovery across the board. A small coupling matrix applied each tick.

Consequence: a student who is not busy but is isolated shows as unwell. A single-number model would call them healthy.

### 6.4 Drain refinements

- **Estimate bias, per type, learned** from planned vs actual. Surfaced as Reality Check (§2.4).
- **Context switching penalty.** Fragmented days drain more than blocked days at equal hours.
- **Deadline proximity multiplier.** Anticipatory stress is real.
- **Travel load** from venue changes between back-to-back commitments.
- **Rolling debt.** Deferred load compounds rather than disappearing, and deferred tasks stay visible on the shelf rather than vanishing.

### 6.5 Uncertainty and missing data

Three projections at estimate biases 0.95×, 1.15×, 1.4×, shown as a band.

**Missing check-ins widen the band and bias the central estimate pessimistic.** Self-report degrades exactly when it matters: a student in a genuinely bad week will not check in. Treating gaps as neutral makes the projection optimistic right before the crash.

Stronger version: **treat absence as signal.** Non-check-in correlates with bad weeks. A model that gets more worried when the user goes quiet is behaving correctly.

### 6.6 State-dependent task cost

A task's cost is a property of the task **and the state you are in when you reach it**.

```
actual_cost = base_cost × state_multiplier(reserve, recent_activity)
```

**Reserve-dependent capacity.** At 70% reserve, two hours of study costs two hours. At 25% reserve it costs closer to three, because you work slower and retain less. Mirrors the efficiency curve: depleted people are less efficient in both directions.

**Carryover.** Every completed activity leaves a residue on the *other* reserves for a few hours, decaying with time.

```
carryover[type] = Σ over recent activities:
    intensity × cross_effect[activity_type][type] × decay(hours_since)
```

| Just did | Effect on mental capacity, next 2h |
|---|---|
| Hard exercise | −25%, recovering over ~3h |
| Light exercise or walk | +10% |
| Long study block | −30%, needs a real gap |
| Social event | −15% if draining, +10% if restorative |
| Errands and travel | −10% |
| Sleep | Full reset, plus overnight recovery |

The positive signs matter as much as the negative ones. Light movement genuinely raises subsequent focus, which makes the app's own recovery suggestions self-justifying: a walk is not just rest, it buys a better study block.

**Consequences.** Sequencing becomes a lever. The optimizer can no longer stack gym at 5pm and deep study at 7pm and call it a good day. This partly answers the degrees-of-freedom problem in §2.5: even when the *days* are fixed, the **order within a day** is usually free, and no timetable takes that away.

**Learning it.** Every completed block gets a **two-tap rating: easier than expected / about right / harder than expected**, taken at completion when recall is perfect. Fit backwards: if "harder than expected" clusters after gym sessions, that user's exercise-to-mental cross-effect is strong. Exponential smoothing on the matrix, same as every other parameter. Some people study fine after training and some are wrecked for the evening; the app finds out rather than assuming.

---

## 7. Calibration

Design constraint: **never ask the user to enter, only to correct.** Editing something wrong is roughly five times faster than building from nothing, and psychologically a different task.

### 7.1 Mode picker

One screen, four taps. Sets every prior.

| Mode | Structure | Failure mode watched for |
|---|---|---|
| Studying | High | Deadline pile-ups, overload |
| Working | High | Chronic drain, no slack |
| Studying and working | Very high | Collision between the two |
| Between things | Low | Drift, isolation, no anchor |

**Semester break is a toggle on top of mode**, not a fifth option. In low-structure states the optimizer switches from flattening peaks to defending a floor.

### 7.2 Three-day painter

Prefilled hour grid, three days, tap only what is wrong. Roughly 20 seconds.

Yesterday, the day before, one weekend day. Recall collapses past 48 hours, and fiction calibrated into the model is worse than no data. Three days gives enough contrast between a loaded day and a light one.

Cells cycle: free → study → work → errands → rest → social → sleep.

### 7.3 What the painter extracts

| Parameter | Derived from | Used for |
|---|---|---|
| Max focus run | Longest unbroken study block | Optimizer sizes blocks to this |
| Baseline sleep | Mean of sleep blocks | Sets `k_sleep` |
| Peak hours | When study blocks cluster | Deep work scheduled here |
| Current load shape | Whole grid | Initial projection |

### 7.4 Progressive calibration

- **Day 0, from the painter.** Focus length, sleep baseline, peak hours, load shape. Enough to project immediately.
- **Days 1 to 7, from check-ins.** Recovery rate, fragmentation tolerance, sleep debt rate. Exponential smoothing toward whatever would have predicted correctly.
- **Day 7 onward, from completions.** Estimate bias per type, and the cross-effect matrix.

### 7.5 Ask relative, not absolute

Not "how many hours can you focus" but "how long before you drift: under 30 min, about an hour, a couple of hours, longer." Buckets, not numbers.

Estimate bias is never asked for. It emerges, and the user need not know the parameter exists.

### 7.6 "How you work" screen

The payoff that makes calibration feel like a benefit rather than a chore:

- "You focus well for about 90 minutes, then quality drops."
- "Your best hours are 9 to 11am."
- "You underestimate writing by 1.7×. We pad it automatically."
- "You lose about a quarter of your focus for two hours after training."
- "One hour of rest gives you back about 4 reserve points. Below 30 reserve that drops to 2."
- "Wednesdays are consistently your heaviest day."

Nobody has told a student any of this before. It is also the sharpest answer to "how is this different from a to-do list."

### 7.7 No cold start

Population defaults produce a working app on first open. A **calibration meter** shows tuning progress so setup reads as progress, never as a gate.

### 7.8 The check-in

Optional and passive-first. Infer the sleep window from first and last phone use. Ask only when model uncertainty is genuinely high, roughly twice a week, always with a stated reason.

When asked: four taps, under fifteen seconds. Sleep, energy, one word, "did you do what you planned." Voice or natural language as an alternative.

### 7.9 Post-block confirmation

**The single highest value-per-effort input path in the app.** After a scheduled block ends, one notification, two taps: **did this happen? yes / no / partly.**

Two seconds of user effort, feeding three separate model parameters:

- **Reality Check (§2.4).** Planned vs actual needs *actual*. Without this the app never learns that a student underestimates writing by 1.7×, and Reality Check has no data source at all.
- **Carryover matrix (§6.6).** The two-tap difficulty rating rides on the same prompt. "Yes, and it was harder than expected" is one additional tap, taken at completion when recall is perfect.
- **Micro-Start trigger (§4.1).** A block that repeatedly returns "no" is a stuck task, which fires Micro-Start automatically without the student having to admit they are stuck.

**Retroactive fill.** For anyone who dismisses the prompts, offer a single end-of-day confirmation instead: "Yesterday looks like it went to plan, correct?" One tap to confirm the whole day, tap individual blocks to correct. Far faster than logging as you go, and it recovers data from students who ignore notifications.

**Never punish a miss.** "No" is a neutral answer that feeds the model, not a failure the app comments on. A student who did not do the thing is exactly the one whose data you most need.

---

## 8. Validation

The part most teams skip and the part that will land hardest with a technical judge.

### 8.1 The falsifiable claim

**Predict tomorrow's reported energy, 24 to 48 hours out.** These resolve regardless of whether the user intervenes, which the 21-day projection does not.

Score them. Publish mean absolute error. That is the accuracy number the app displays.

### 8.2 What we do not claim

The 21-day projection is never described as validated. It is a decision aid. Say this in the product copy, not only in the pitch.

### 8.3 Ignored warnings as a control arm

Log every warning the user does not act on. Those are the cases where the long projection can actually be tested. Over a semester this produces real evidence on whether the deficit crossing predicted anything.

Free data, no extra build, and the honest path to validating the long claim later.

---

## 9. Malaysia-specific

- **Public holidays reduce commitments but not deadlines.** An assignment due Monday still needs doing over a long weekend. A holiday shifts load rather than removing it, and the model shows that honestly instead of drawing a fake dip.
- **Festival periods default to demanding, not restful.** Raya, CNY and Deepavali mean travel, family obligation and social demand. For many students that is a heavier week. Users can mark any holiday restful or demanding.
- **State-level variation.** Selangor differs from KL differs from Penang. Hardcode a table for the demo rather than depending on an API during judging.
- **Curated local get-outside list** by area.
- **Prayer time blocks.** Optional, prefilled from location, treated as fixed recovery.
- **Ramadan mode.** Roadmap, not build.

---

## 10. Technical

### Stack

React, TypeScript, Tailwind, shadcn for the shell, Framer Motion for the room, Recharts for the weekly digest, Supabase for data and auth, Vercel for hosting.

The room and the dial are hand-rolled SVG. The digest is Recharts. Do not build two design systems.

### Deployment

**Vercel, and only Vercel.** One hosting platform for the whole app: the PWA shell, the
service worker, and every server-side route. Supabase sits alongside it as a managed
service for data, auth and storage — a dependency, not a second place to deploy to. There
is no separate backend host, and adding one would be a mistake rather than an upgrade.

**Why one platform is enough.** The expensive work does not run on a server. The optimizer
is client-side by design (§2.1: under 100ms on the phone, no backend call) and the engine
(§6) is arithmetic over a 21-day array. That leaves four server-side jobs, all of them
short request-response work that a serverless function does well:

| Job | Runs as | Why it fits |
|---|---|---|
| Groq calls — planner, Micro-Start, decline drafting | Vercel route | Short request, short response |
| Vision OCR (§1.4) | Vercel route | Bounded call, results cached |
| Data, auth, file storage | Supabase | Managed service, not a hosting decision |
| PWA shell and service worker | Vercel CDN | Static delivery |

Nothing in the must-build scope (§11) is long-running, stateful, or a persistent
connection, which is the only real reason to add a second platform. **A second host would
cost us on judging day**: another dashboard, another deploy to keep in sync, another
service that can be down mid-demo. Against a four-day build that opens with "deploy hello
world on day one," splitting the hosting is pure downside.

**Four constraints that follow from this choice.** These are consequences of serverless, not
reasons to reconsider it.

1. **Neither API key ever reaches the browser.** Groq and the vision model are called from
   `/api` routes only. A client-side call leaks the key in devtools and breaks rule 7.
2. **Photos do not travel through a function.** Serverless request bodies are capped at
   roughly 4.5MB and phone photos exceed that. The client uploads to Supabase Storage and
   passes a signed URL to the vision model. That is also where the OCR cache lives, which
   is what keeps "nothing is called live on stage" true.
3. **Vision calls are time-boxed.** Free-tier execution limits are short. Bound the call
   and fall back to manual entry rather than hanging the confirm screen — that path exists
   anyway, because §1.4 forbids silent import.
4. **Per-block push is not scheduled from Vercel.** Cron granularity on the free tier is
   too coarse for §7.9's end-of-block prompt. Either schedule from Supabase (`pg_cron`
   plus an Edge Function), or drop push for the hackathon and rely on §7.9's retroactive
   fill, which needs no notification at all. iOS PWA push requires 16.4+ and a home-screen
   install, so it is fragile to demo either way.

**When this decision would need revisiting.** A persistent WebSocket server, a background
job queue, or cron at minute granularity. In this document those map only to the social
features in §5.5 and the Capacitor migration — all of which §11 already files under
roadmap.

### Responsive design

A standing requirement (§0), not a polish pass. Build mobile-first at 390px and check every commit at all four breakpoints.

| Breakpoint | Target | Layout |
|---|---|---|
| 320px | Small phones | Single column, side padding ≤12px, text never below 13px |
| 390px | Baseline, build here | Single column, primary actions in the lower half |
| 768px | Tablet, split view, foldables | Two columns where content genuinely pairs, otherwise stay single |
| 1280px+ | Laptop, **judging** | Max content width capped, centred. Never stretch the room or digest across a full desktop viewport |

**Per-component:**

- **Room and dial (§1).** SVG with a `viewBox` and `width: 100%`, scaling cleanly at every width without a media query. This is the main argument for hand-rolled SVG over canvas or images. At 320px the dial may need to stack above the room rather than sit in its corner. Object labels drop out before object shapes do.
- **Two-state room comparison (§1.3).** Side by side above 768px, toggle below. Never two rooms side by side on a phone.
- **Request box and decision flow (§2.3).** Single column at every width. The drafted reply must be fully visible without scrolling at 390px, or the approve action loses its context.
- **Say-anything planner (§3.1).** The chip list must wrap, never scroll horizontally. Long task titles truncate with the full text on tap.
- **Weekly digest.** Charts stack vertically on mobile. Recharts needs `ResponsiveContainer` with an explicit parent height, since percentage heights collapse.
- **Three-day painter (§7.2).** 18 columns will not fit at 320px. Either horizontal scroll within the grid with the day label pinned, or collapse to 3-hour buckets below 360px. **Decide this before building it.**
- **Evidence tables.** Never horizontal-scrolling on mobile. Reflow to stacked label-value pairs below 768px.
- **Low-energy mode.** Already one number and one action, so responsive by construction. Use it as the fallback if any screen cannot be made to work at 320px.

**Testing.** DevTools device toolbar at all four widths on every screen, plus one real phone. Test landscape too: the room plus a drafted reply in landscape at 390px tall is the tightest case in the app.

**Do not build a separate desktop layout.** One responsive layout, capped in width. The brief asks for something students keep on their phone, and a bespoke desktop experience works against that claim.

### External dependencies

All free tier, all with hardcoded fallbacks:

- **Groq** for the say-anything planner, Micro-Start, decline drafting and cost framing.
- **Vision model** for OCR. Cache parsed results so nothing is called live on stage.
- **Messaging channel** (§13) for the chat surface. The app must stay fully usable with the
  bot switched off -- it is a second door, never the only one.
- **Places (optional)** for get-outside, with a curated local list as fallback.

### Widget

A true home-screen widget is not available to PWAs on either platform. What is available: a lock-screen glance via web push, and an installed icon with a badge count showing reserve. If a real widget matters to the team, that is another argument for Capacitor.

### Rules compliance

| Rule | Status |
|---|---|
| 1–5, platform freedom | Web PWA, permitted |
| 6, deployable | Vercel plus Supabase, public URL, installable to a real phone. **Deploy hello world on day one.** |
| 7, third-party APIs | Free-tier services only, own keys, a fallback for each (§10 external dependencies, §13.6) |
| 8, know your internals | The reserve equation and efficiency curve explain in 20 seconds. **Every member must be able to do this**, not just whoever wrote it |
| 9, core logic built during hackathon | Engine, optimizer, room, dial, planner all original |
| 10, accessibility | Six items implemented properly, named specifically |
| 11, original work | Clean commit history from the start date |

### Build order

- **Day 1.** Deploy hello world. Run the §2.5 validation task. Build the capacity dial.
- **Day 2.** Engine. Say-anything planner.
- **Day 3.** Room. Rebalancer and decision flow.
- **Day 4.** Micro-Start, recovery, accessibility, seeded demo account.

Rehearse the demo from hour six onward.

---

## 11. Scope

### Must build

**Focus 1:** capacity dial with five domain bars · room with nine bindings · assignment brief OCR with confirm screen · photo-of-anything OCR entry point · low-energy mode and text-equivalent views
**Focus 2:** Auto-Rebalancer · smallest-fix search · request box with cost framing · drafted declines · provisional yes with auto-expiry · Reality Check
**Focus 3:** say-anything planner with confirm chips · plan generation
**Focus 4:** Micro-Start, automatic and manual triggers
**Focus 5:** protected rest blocks · category-matched prescriptions · recovery quality ceiling · get-out-of-the-house mode
**Engine:** four coupled reserves · efficiency curve · reserve-dependent capacity multiplier · carryover matrix with hardcoded priors · missing-data pessimism
**Calibration:** mode picker · three-day painter · parameter extraction · post-block confirmation with two-tap difficulty rating · "how you work" screen
**Validation:** 48-hour prediction scoring
**Cross-cutting:** responsive verification at 320 / 390 / 768 / 1280px on every screen · PWA install · deployed to Vercel from day one, public URL live for the whole build

### High value if time allows

Timetable OCR · Google Calendar import · voice input · within-day sequencing in the optimizer · two-tap block ratings · Micro-Start effectiveness learning · inline block-level feasibility warnings · recovery receipt · weekly load budget · extension drafter · festival and holiday load · weekly digest

### Roadmap slide only

Learned per-user cross-effect matrix (needs weeks of ratings; seed the demo account and present it as how the model matures, do not try to demonstrate learning in a weekend) · hangout matching · status broadcast · cohort curve · group load view · Ramadan mode · cycle tracking · semester report · counterfactual replay · ignored-warning validation results · Capacitor migration for sensors and a true widget

---

## 12. The pitch

Structured on the five promises. Five sections, one demo beat each.

1. **See it.** Open on the room with the dial in the corner at 106%. Say nothing for two seconds. Then: "This is everything they're carrying, in one screen."
2. **Balance it.** Paste an incoming request. The app returns the cost and a drafted reply. Hit rebalance and let the room tidy itself.
3. **Plan it.** Type a messy brain dump. Watch it come back structured.
4. **Start it.** Tap "can't start this" on the essay. One small action, eight minutes.
5. **Rest.** The door lights up. Three taps to a scheduled, protected break.

Then the credibility close:

6. **Show the engine.** Reserve equation, efficiency curve. Twenty seconds.
7. **Narrow your own claim.** "Our 21-day projection is not verifiable, so here is the 48-hour claim we do verify, and here is our error on it." Nobody else in the room will voluntarily do this, and it will land harder than any feature.
8. **Walk the brief clause by clause**, naming the feature that answers each.

### Lines worth having ready

- "Your calendar tells you what you agreed to. This tells you whether you can survive it."
- "The app doesn't remind students to rest. It makes resting the path of least resistance."
- "It shouldn't just track and report. We don't track. We forecast, and then we act on it."

---

## 13. The chat channel

### 13.1 Why a bot at all

**The highest-value input path in this document depends on the least reliable delivery
mechanism we have.** §7.9 calls post-block confirmation "the single highest value-per-effort
input path in the app" -- two taps that feed Reality Check (§2.4), the carryover matrix
(§6.6) and the Micro-Start trigger (§4.1) at once. It needs a notification to exist. §10
concedes that per-block push cannot be scheduled from Vercel's free tier, that iOS PWA push
requires 16.4+ *and* a home-screen install, and that no real widget is available to a PWA at
all.

A chat bot removes that whole class of problem. It reaches any phone, needs no install, has
no OS version gate, and its prompt arrives as a message to reply to rather than as a
notification the student must act on inside an app they have to open first.

**This does not contradict §2.3.** The integration rejected there is the *Web Share Target
API* -- a browser feature, Android-only, unsupported on iOS. A bot is a different mechanism
and inherits none of that objection. §2.3's actual rule, that the app never declines
autonomously, holds here unchanged and is restated in §13.4.

**The bot is a second door, never the only one.** Every flow below already exists in the
app, or is specced to. Nothing may become bot-only: a student without the bot must lose no
capability, and a channel outage must never take the product down.

### 13.2 Telegram or WhatsApp

> **Team decision required.** These pull in opposite directions and the answer changes the
> build. Recommendation below; decide before writing the adapter.

| | Telegram | WhatsApp |
|---|---|---|
| Proactive messages | Unrestricted once the student starts the bot | **Only within 24h of their last message**, otherwise pre-approved templates only |
| Cost | Free | Templates are billable, and categorised |
| Time to first message | Minutes, a token from BotFather | Days if verifying a business; minutes on a sandbox with a join code |
| Interface | Inline keyboards, effectively unlimited | Three quick-reply buttons, or a ten-item list |
| Account linking | A deep link carrying a token, one tap | A code the student must send back |
| **Where Malaysian students already are** | **Smaller** | **Dominant** |

**The tension is real and worth stating plainly.** Telegram is the better engineering choice
by some distance: free, instant, and -- critically -- it does not restrict proactive
messaging, which is the entire point of a product built on nudges (§5.2) and check-ins
(§7.9). WhatsApp's 24-hour window fights the core of what this app does.

WhatsApp is the better *product* choice, because it is where the students in the brief
actually are. §1.4 already observes that a shift roster arrives "as a photo in a group
chat" -- that is a WhatsApp behaviour, and forwarding is native there in a way it is not
elsewhere.

**Recommendation: build on Telegram, name WhatsApp as the target, and put one adapter
between the flows and the transport.** The flows in §13.3 are identical either way; only
delivery differs. That makes the channel a configuration decision rather than a rewrite, and
it means a demo cannot be lost to a verification queue.

**Have the answer ready for a judge who asks why not WhatsApp**, because one will: the
24-hour window, template billing, and business-verification lead time -- and the adapter
that makes it a swap rather than a rebuild.

### 13.3 What the bot does

Every flow is an existing part of the product reached through a different door. None is new
behaviour, and none may bypass the confirmation rules in §3.2.

**Post-block confirmation (§7.9).** "Did the 7pm study block happen?" with *yes / no /
partly*, and the two-tap difficulty rating riding on the same prompt. This is the flow that
justifies the channel: without it, Reality Check has no data source at all.

**Brain dump (§3.1).** A message or a **voice note**, parsed into structured items and
returned as something to confirm before any of it counts. Voice is already wanted in §3.1 as
an accessibility win; in a chat app it is simply how a thought gets sent, rather than a
feature to build.

**Photo import (§1.4).** Forward a timetable, an assignment brief, a shift roster, or a
photographed planner page. Same vision pipeline, same confirm step. Forwarding from the group
chat the photo arrived in removes every step between seeing it and importing it.

**Retroactive fill (§7.9).** "Yesterday looks like it went to plan, correct?" One reply
confirms the day. This is what recovers data from students who ignore prompts, and it is
cheap once the channel exists.

**Recovery nudge (§5.2).** One option, sized to the real gap, matched to the depleted type.
One option only, for the reason §5.2 already gives: a depleted person cannot choose from a
menu.

**Micro-Start (§4.1).** "Can't start this" as a message, answered with one concrete action
under ten minutes.

**Request pricing (§2.3).** Forward an incoming ask; get back what it costs in what gets
given up, and a drafted reply. The draft is text the student copies and sends themselves.

### 13.4 What the bot must never do

- **Commit anything unconfirmed.** §3.2 applies unchanged: parsed items are proposals until
  the student approves them. A chat interface makes silent commitment easier, which is
  exactly why the rule matters more here.
- **Decline, send, or reply on the student's behalf.** §2.3: the app does the *work* of
  declining and the student keeps the *decision*. A bot that can send messages must still
  never send that one.
- **Renew or accept anything unattended.** ADR-0008's stance, restated for a channel where
  it would be easy to forget.
- **Carry the room or the dial.** Those are visual and glanceable by design (§1.1). Send a
  deep link into the app instead.
- **Treat a phone number or chat id as an identity.** See §13.5.
- **Scold.** §1.3's gamification rule and §7.9's "never punish a miss" both hold. A missed
  block gets a neutral answer, not a comment.

### 13.5 Linking an account

A phone number or chat id is a claim, not proof. The app shows a short-lived code; the
student sends it to the bot; the bot links that chat to the signed-in account. §13.2 notes
Telegram can carry this in a deep link instead, which is one tap rather than a copy.

Until a chat is linked it may do nothing that touches an account. Unlinking is available from
the app, and signing out must not silently leave a linked chat able to read a week.

### 13.6 Technical shape

- **Inbound is a webhook into a Vercel function** (§10 Deployment): a short request and a
  short response, exactly what serverless is good at. No second host, and no change to the
  Vercel-only decision.
- **Verify every inbound payload's signature**, and treat message content as untrusted input
  crossing a trust boundary. It is the most exposed surface in the product, because anyone at
  all can message a bot.
- **Outbound scheduling is not Vercel's.** Per-block prompts need minute granularity, which
  free-tier cron does not have. Supabase `pg_cron` plus an Edge Function -- the same
  conclusion §10 reaches for push.
- **One adapter between the flows and the transport**, per §13.2, so the channel stays a
  configuration decision.
- **The bot degrades to nothing.** Switched off, or with its API down, the app is exactly the
  app: no flow becomes unreachable, matching how every other external dependency in §10 is
  treated.

### 13.7 Scope, honestly

All seven flows in §13.3 is a second product, and this document's own build order (§10) has
four days in it. The channel is worth specifying whole and building narrow.

- **Must build, if the channel is attempted at all:** account linking (§13.5), and **one**
  flow end to end. Post-block confirmation is the highest product value; brain-dump-by-voice
  is the better demo beat. Which one is a **team decision**.
- **If time allows:** photo forwarding, retroactive fill, recovery nudges.
- **Roadmap slide:** Micro-Start over chat, request pricing and drafted declines, and the
  WhatsApp transport itself if the build ran on Telegram.

**A live bot on stage needs a network, a phone and a linked account.** Rehearse it, and keep
a seeded fallback, in the same spirit as §10's rule that nothing is called live on stage.
