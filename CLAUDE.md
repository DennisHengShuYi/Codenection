# Codenection — a stress and workload manager for students

A student opens this and sees one screen: a room that fills up with what the fortnight is
asking of them. The point is not tracking. The point is that **recovery gets less effective
the more depleted you are**, so a week looks survivable right up until it isn't — and a
linear tracker cannot show that. Everything here exists to make that spiral visible early
enough to act on, and then to offer one concrete action rather than a dashboard.

Nothing here touches money or anyone else's data. The stakes are quieter and still real: a
student decides what to drop based on what this says, so a number that is confidently wrong
is worse than one the app admits it cannot compute. Several rules further down follow from
exactly that.

The authority on intent is **`burnout-app-spec-v3.md`** at the repository root. Code cites it
as `§1.2`, `§6.3` and so on, and those stop at §13. Decisions taken in conversation are cited
as `Ruling 41`, and are indexed in **`docs/rulings.md`**.

## Repository status

Built and passing: the engine and optimizer, the room and week screens, the say-anything
planner, photo and calendar import, Micro-Start, the Rest button, the request box, the sleep
page, accounts, and the Telegram channel. `npx tsc --noEmit` is clean and `npm test` is green.

Sleep is worth a sentence of its own, because it spans four layers and its parts are easy to
mistake for each other. `Schedule.sleepByDay` is the PLAN — what the app assumes each night
will be, seeded from a target the student states on the sleep page. `domain/sleepLog` is the
REPORT — which nights were actually answered, keyed by date, which is what lets the app tell
"slept eight hours" from "nobody has asked yet". `domain/sleepReality` compares them and stays
silent below three nights; `domain/sleepForecast` warns that an over-committed day will cost a
night and deliberately stores nothing. Rulings 64 to 66 record why each is shaped that way.

Known not built, with the spec amended to say so rather than promising it: §7.2's three-day
painter and its parameter extraction, §7.7's calibration meter, §9's Malaysia-specific holiday
and get-outside lists, and §6.4's rolling debt. There is also no server-side quota on the
public AI endpoints — `plan`, `draft`, `read-photo`, `micro-start` and `insight` spend the
Groq budget unauthenticated, which `api/micro-start.ts` states in place.

Sleep is worth reading about before changing anything near it, because four numbers that look
alike answer different questions. `Schedule.sleepByDay[d]` is the night at the **end** of day d
— §6.1 puts sleep in `recovery[d]`, which produces `reserve[d+1]` — and it holds what the app
*assumes*, derived every render by `domain/sleepAssumed` from three durable facts in settings:
a target, any night the student set, and `domain/sleepLog`'s reported nights. The four sleep
figures that must never converge are `DEFAULT_SLEEP_HOURS` (8, the night assumed when nobody
has said), `SLEEP_BASELINE_HOURS` (5, where sleep starts paying and below which it now costs),
`ENOUGH_SLEEP_HOURS` (9, where it stops paying — the population figure, learned down per
student by `domain/sleepEnough`) and `roomState.RESTED_NIGHT_HOURS` (7, the line below which a
student counts as short). Rulings 64 to 69 record why each part is shaped as it is.

One known-open item from the sleep work: `RoomShell.tsx` has grown well past the 800-line
ceiling, because extracting the settings sheet was dropped from that change rather than done in
a file being edited concurrently.

Half of a student's personal sleep *need* is now learned rather than assumed, and the halves
are easy to confuse. `domain/sleepEnough` learns `EngineParams.enoughSleepHours` -- where sleep
stops paying back -- by pairing reported nights against §8.1's resolved predictions and
comparing the two halves of that student's own sleep, split at their median night. It is
deliberately not a fifth entry in `domain/recoveryLearning`, because a finite difference cannot
identify a threshold and could only ever push this one up; Ruling 69 records why. A student
whose sleep never varies gets silence and the population figure, by the same mechanism every
other unmeasured parameter is silent -- and so does one whose two groups sit less than an hour
apart, which is the half of the evidence bar the sample floor does not cover. `sleepBaselineHours` -- the other end of the same window,
where sleep *starts* paying -- is still unmeasured, and §7.2's painter is still the plan for it.

Where the source lives:

| Directory | Owns |
|---|---|
| `src/engine` | The model. Four coupled reserves, the drain and recovery equations, the projection band. Pure: no I/O, no clock, no randomness. |
| `src/optimizer` | The rebalancer. Hill-climbs a fortnight against §2.1's objective. Pure except for an injected `Rng`. Never imports `src/domain`. |
| `src/domain` | Everything the model needs deciding around it: the calendar anchor, placement, deadlines, prescriptions, calibration, the block log. |
| `src/ui` | React. `ui/room/RoomShell.tsx` is the router as well as the room. |
| `src/ai` | Groq prompts and the Zod schemas every model reply is validated against. |
| `src/telegram` | The bot's intents and wording. Pure; decides nothing the app does not. |
| `src/data` | The repository contract and its local and Supabase adapters. |
| `api/` | Vercel functions. The only place a credential is ever read. |

## Build / run / test

| What | Command | Notes |
|---|---|---|
| Dev server | `npm run dev` | http://127.0.0.1:5180 |
| Tests | `npm test` | ~155s. Excludes `*.integration.test.ts`, which need a real database. |
| Typecheck | `npx tsc --noEmit` | Covers `src`, `api`, `tests`, `scripts` and the configs. |
| Coverage | `npm run test:coverage` | Thresholds are enforced and describe `src` only — see `vitest.config.ts`. |
| Integration | `npm run test:integration` | **Talks to a real Supabase project and clears the store before every test.** Disposable account only. |
| Browser suite | `npm run test:e2e` | Playwright, against the dev server. |
| Build | `npm run build` | |
| Solver timing | `npm run measure:solve` | Re-run after any engine change; §2.1 budgets a solve under 100ms. |
| Solver freedom | `npm run measure:dof` | What the rebalancer can actually move, and what it gains. |
| Telegram webhook | `npm run telegram:webhook` | **Points the live bot at a URL.** |

Setup: copy `.env.example` to `.env` and fill it in — it documents every variable, what reads
it, and what silently stops working when it is unset. Two failure modes look like bugs in your
own code rather than missing configuration: without `GROQ_API_KEY` the planner silently falls
back to its rule-based parser, and without all four `GOOGLE_*` values the calendar entry point
disappears from the UI entirely.

Every pull request must pass CI, and **any change to behaviour updates the test files in the
same change** — new behaviour gets new tests, changed behaviour gets its existing tests
rewritten, removed behaviour gets its tests deleted, and a bug fix gets a failing regression
test first. A green build on stale tests proves only that the code still does what it used to.
Never make a check pass by weakening a test or disabling a step. The full rule is in
`.claude/CLAUDE.md`.

## Stack at a glance

React 19 and TypeScript on Vite, Tailwind, Supabase for auth and storage, Vercel functions in
`api/`, Groq for language and vision, a Telegram bot as a second door.

The dependency order is `engine → optimizer → domain → ui`, and it is one-way in one place
that matters: **`src/optimizer` must never import `src/domain`**, because `src/domain` imports
the optimizer. `src/telegram` may use `src/domain` but decides nothing itself.

## Hard invariants — never compromise

- **The engine is pure.** Nothing in `src/engine` reads a clock, a network or a random number.
  The optimizer calls `project` thousands of times per solve; that is what makes it possible,
  and what lets the whole model be tested without a single mock.
- **Each reserve is priced and repaid on its own level, never the average of four.** Burnout is
  a floor problem. Averaging let three healthy reserves subsidise a collapsed one and damped the
  spiral exactly where it matters. `overallReserve` is the dial's headline and an input to
  nothing. (`engine/efficiency.ts`)
- **"Deficit" means the floor, everywhere.** The dial, the room's weather, the week grid and the
  optimizer objective all test `floorReserve < DEFICIT_THRESHOLD`. The mean is strictly laxer
  and one screen using it is one screen disagreeing with the model it renders.
- **Model output is never trusted.** Every Groq reply is parsed by a Zod schema in `src/ai` that
  takes its vocabulary from `engine/types.ts`. A model may describe an item; it may never
  originate an id, a day index, an hour, a load type or a block kind.
- **Protected rest has one door.** `domain/scheduleRecovery` is the only thing that creates it,
  and nothing arriving from a parse may create it whatever the text says. §5.1 calls this the
  most important design decision in the app.
- **The student's own day, not the server's.** `domain/calendar.dayLabel` and `todayIndex` are
  the only places a day index becomes a date or a name. §9 puts this app at UTC+8, where a
  UTC-derived "today" is wrong for the first eight hours of every day.
- **A credential is read only in `api/`.** Nothing under `src/` reads a server-side secret, and
  the `VITE_` prefix is a security boundary rather than a naming convention: it publishes the
  value into the browser bundle.
- **Limits and permissions are enforced server-side.** A client's claim about who it is is
  re-verified against Supabase, never decoded and trusted.
- **Errors are never silently swallowed.** Every hook that persists something a student changed
  reports a failed write; a change that applied on screen and vanished later, silently, is the
  specific bug this rule exists to stop.
- **Never commit a secret.** `.env` is gitignored and the credentials used for testing are
  disposable and scoped to nothing valuable.

## Read on demand — don't preload everything

- **`burnout-app-spec-v3.md`** — what the product is for, section by section, including what was
  amended and what was cut. **Read before building anything a `§` reference points at, and
  before assuming a feature is missing rather than deliberately absent.**
- **`docs/rulings.md`** — the decisions the code cites as `Ruling N`. **Read when a comment
  cites one and you are about to change what it decided.**
- **`.claude/CLAUDE.md`** — the workflow every change goes through, and the rule that tests ship
  with behaviour. **Read before starting any non-trivial change.**
- **`docs/superpowers/specs/`** — the design record per feature, richer than the spec on the
  screens. **Read before changing the room, the week, or the routing.**
- **`.env.example`** — every variable, what reads it, and what quietly stops working without it.
  **Read before running or deploying anything.**

## When sources conflict

The code wins on what is true today. The spec wins on what the product is *for*, and carries
inline amendments where the two were reconciled. `docs/rulings.md` is an index reconstructed
from citations, so the citing comment at the cited line outranks it. This file describes intent
as well as reality — verify before relying on it.
