# Micro-Start Ladder — Design

**Status:** approved for planning, 2026-09-11
**Base:** `feature/micro-start` at `0c3ced1`
**Spec:** [`burnout-app-spec-v3.md`](../../../burnout-app-spec-v3.md) §4.1, with the amendment recorded below.

## The problem

§4.1's Micro-Start is half built. `firstAction` returns one canned string from an
eight-entry table keyed on `ActivityKind`, revealed inline inside the block sheet behind
"I can't start this". Three things are missing: the action is not about the actual task,
there is no way through to finishing it, and the control is hidden on exactly the blocks a
student is most likely to be stuck on.

This design replaces the single canned move with a **ladder**: an ordered chain of small
steps, generated for the specific event, shown one rung at a time on a page of its own.

## §4.1 amendment

§4.1 reads "one concrete first action... One action, never a list, for the same reason as
§5.2: a stuck person cannot choose from a menu."

That is amended to: **the full chain is generated; exactly one rung is visible.** The
prohibition §4.1 was making is against *choosing* — a menu asks a paralysed person to
deliberate, and a wall of unticked boxes reads as proof of how much is left. Neither is
true of a chain that reveals its next rung only when the current one is ticked. There is
never more than one thing on screen to act on, which is what §5.2's reasoning actually
protects.

What does not change: one rung at a time, every rung under ten minutes, no deliberation
asked of the student, no explanation asked for on the way in.

This amendment is written into `burnout-app-spec-v3.md` §4.1 itself as part of the
implementation, not left standing only here. A design document that quietly disagrees with
the specification it cites is the failure this paragraph exists to prevent.

## Architecture

Five units, each independently testable.

### 1. `src/domain/ladder.ts` — the ladder, and the offline answer

```ts
interface Rung   { readonly action: string; readonly minutes: number }
interface Ladder { readonly blockId: string; readonly rungs: readonly Rung[]; readonly done: number }
```

`done` is a count rather than a set of ticked ids. The chain is ordered and rung 4 cannot
precede rung 3, so a count is the honest representation of the state and makes "step 3 of
6" a subtraction rather than a search.

Pure, returning new objects: `currentRung(ladder): Rung | null`, `advance(ladder): Ladder`,
`isComplete(ladder): boolean`, `replaceCurrent(ladder, rung): Ladder`.

`ruleLadder(item): Ladder` is the rule-based generator, and it lives **here rather than in
the AI layer** for the reason `firstAction` already gives in its own docstring: a stuck
student at 2am is exactly who should not be waiting on a network. It extends today's
`FIRST_MOVE` table from one move per `ActivityKind` into a chain of three or four.

For `rest` and `sleep` the rungs lower the bar to resting — "put the phone in another
room", "set a timer and sit down" — and never frame rest as a task to be completed. This
is what makes the button safe on every block (see Routing) without inverting §5's
structural protection of recovery, which the spec calls the most important design decision
in the app.

`microStart.ts` keeps `isStuck` and remains the automatic trigger. `firstAction` keeps its
name and its signature but is reimplemented as the first rung of `ruleLadder`, so there is
one table rather than two that can disagree. It has a real consumer: the Telegram bot
answers `/start <task>` with it, and that reply is a single message with no page to route
to.

### 2. `api/micro-start.ts` — the model, server side only

Edge runtime, copying `api/plan.ts` on every part that matters. Reads `GROQ_API_KEY` from
the server environment with no `VITE_` prefix, so the credential cannot reach the bundle.
Answers **503 when no key is configured**, which the client treats as an ordinary state and
not an error — that is the normal path in CI, in tests, and under `vite dev`.

Every field is validated at the boundary before it reaches a prompt, because a block title
is user-authored text: title length-capped, `kind` checked against `BLOCK_KINDS`, `hours`
range-checked. Anything else is a 400.

### 3. `src/ai/ladder.ts` and `src/ai/ladderSchema.ts` — asking, and not trusting the answer

The prompt asks for three to six ordered steps, each under ten minutes, each a physical
first move rather than a smaller version of the task — §4.1's "outline the essay is still
the essay" stated to the model directly. `ladderSchema` validates the reply all-or-nothing,
mirroring `parseModelReply`: a malformed answer falls back to `ruleLadder` rather than
travelling one hop further into the app.

`ladder.ts` is exported from `src/ai/index.ts`. `groq.ts` stays absent from that surface,
as it is today.

### 4. Persistence — `StoredSettings.ladders`

`StoredSettings` gains `readonly ladders?: readonly Ladder[]`, optional.

**No migration and no adapter change**, which is the same trick `calibration` used: both
adapters already persist settings as one blob. Settings written before this feature keep
loading, and that is asserted by a test rather than assumed.

Keyed by `blockId`. A ladder is dropped when its block is removed or completed, so the
record cannot outlive the thing it describes.

The alternative — new `Repository` methods — was rejected: it costs changes in the local
adapter, the Supabase adapter, the fallback adapter and the contract tests, to store a
handful of small records that have exactly the lifetime settings already have.

### 5. Routing and the page

A new `View` kind `{ kind: 'microStart'; itemId: string }` at **`/week/block/:id/start`**,
structurally identical to the existing `editBlock`: it sits under the block it is about, and
`back()` returns it to `toBlock(itemId)`. Back goes to the event sheet; close goes to the
room. Rendered full-screen rather than as a `Sheet` — the point of the page is that nothing
else is in view.

`blockActions.ts` adds `microStart` to the unconditional `MANUAL` list, beside `edit` and
`remove`. That is the decision "every block, no exceptions": a fixed class, a past block and
a protected rest block all offer it. The safety that used to come from hiding the control
now comes from what the rest and sleep ladders say.

`BlockSheet`'s inline reveal and its own local copy of `MicroStartCard` are **deleted**.
There is one interactive micro-start path, not two that can disagree about a block's first
move.

`src/ui/microStart/MicroStartCard.tsx` is **kept**. It is not an orphan: `LiveCards` renders
it as §3's "stuck" card, the automatic trigger's own surface in the room. What changes is
where its call to action goes — to the page rather than to the block sheet — so the room
offers the first rung and the page carries the rest of the chain. The page itself is a new
file, `MicroStartPage.tsx`.

The page shows the event title, "Step 3 of 6", the current rung and its time box, and four
controls:

| Control | Behaviour |
|---|---|
| `Done — next step` | `advance`, persist, render the next rung |
| `That one doesn't fit` | asks the endpoint for one replacement rung, given the ladder so far and the rung being rejected, and swaps it in with `replaceCurrent`. Falls back to the corresponding rung of `ruleLadder` when the model is unavailable. The rest of the chain is untouched, and the count does not move — rejecting a step is not progress through it. |
| `Stop here. That's enough.` | leave, progress kept, no shame copy |
| past the last rung | offer to mark the event done via the existing `completeItem` |

## Failure behaviour

Generating shows a working state. A 503, a timeout, a malformed reply and being offline all
land on `ruleLadder` **silently**. A stuck person does not need an error dialog, and the
rule ladder is a real answer rather than a degraded one — the same judgement the planner
already makes about its own fallback.

A save failure surfaces through the existing `saveProblem` channel in `RoomShell`. A stale
`itemId` in the address resolves to the room, matching `fromPath`'s existing total
behaviour.

## Testing

TDD, red before green. Coverage thresholds only go up.

- **Unit.** Ladder algebra including the boundaries (`advance` past the last rung,
  `currentRung` on a complete ladder). A rule ladder for every `ActivityKind`. Rest and
  sleep ladders never frame rest as a task. Every rung under ten minutes. Schema rejection
  of malformed replies. Route round-trips through `toPath`, `fromPath` and `back`.
- **Component.** The page renders exactly one rung and never the others. Progress advances.
  "Stop here" keeps progress. The button appears on a fixed block, a past block and a
  protected rest block.
- **Integration.** A reload resumes at the right rung with the same wording. Settings
  written before this feature still load.
- **Endpoint.** 503 with no key. 400 on a bad body. A reply the schema rejects does not
  reach the client as data.

`security-check`'s static layer plus its deep audit, since this adds a surface that holds a
credential. The HawkScan loop after implementation.

## Not built

- **§4.1's Learning half** — logging which micro-starts led to work, and dropping phrasings
  that do not work for this student. It needs weeks of per-student data, and §11 files it
  under "if time allows". The pull request will say it is absent rather than implying the
  loop is closed.
- **A timer on the page.** Not asked for, and a countdown is a second feature wearing this
  one's clothes.
- **The engine and optimizer** are untouched.
