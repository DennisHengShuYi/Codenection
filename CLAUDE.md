# <Project Name>

Keep this file short — it's an index, not documentation. Depth lives in the docs this file
points to; link to it rather than restating it here. If a section below doesn't apply to this
project, delete it rather than leaving it empty.

## Project

<One paragraph: what this is, who it's for, and the one thing that makes it different. Name the
user in their own terms, not in implementation terms. If the project has real-world stakes —
real money, real customer data, irreversible actions — say so here, because every rule further
down follows from it.>

<If the project splits into distinct bounded contexts with their own vocabulary, name them here
and point at the map that relates them.>

## Repository status

<What is actually built and verified today, as opposed to planned. Written so a session starting
cold knows what it can rely on and what is still a stub. Update this as things land — a stale
status section is worse than none, because it gets trusted.>

<Where the source lives: the top-level directories and what each one owns.>

## Build / run / test

| What | Command | Notes |
|---|---|---|
| Dev server | `<command>` | <host/port, what it needs running first> |
| Tests | `<command>` | <what it covers; whether it touches the network> |
| Unit tests only | `<command>` | <the fast inner-loop command> |
| Typecheck | `<command>` | |
| Lint | `<command>` | |
| Build | `<command>` | |
| <Any dangerous command> | `<command>` | **<State plainly what real thing it touches.>** |

Setup: <the exact steps from a fresh clone to a running app, including which env vars must be
filled in and which ones have failure modes that look like bugs in your own code.>

## Stack at a glance

<Languages, frameworks, and the shape of the system in two or three sentences: which piece owns
what, and which piece is allowed to talk to which. Point at the architecture docs for the full
reasoning rather than reproducing it here.>

## Hard invariants — never compromise

<The rules needed on every task, where violating one silently breaks the product's central
promise. These are the highest-value lines in this file — a coding agent reads them on every
change, so state each as a rule, not as background. Give each one a reason and a pointer to the
decision record behind it. Delete the examples below and write this project's real ones.>

- **<Rule, stated as an imperative.>** <One sentence on what breaks if it's violated.> (<ADR/issue ref>)
- **Untrusted input is validated at the boundary.** <Name this project's specific version:
  which values may never originate from a model, a client, or a third party, and where they must
  be re-derived instead.>
- **Limits and permissions are enforced server-side.** A client's claim about its own quota,
  role, or budget is never taken at face value.
- **<Name the single source of truth for the state that matters most>**, and what may not cache
  or duplicate it. Fix slowness with a loading state, not a cache — unless there's a recorded
  exception, in which case name it and its test.
- **No irreversible action without an explicit human confirmation.** Never unattended, never on
  a value the user hasn't actually been shown.
- **One path for <the thing that must stay consistent>.** Nothing else may derive it, or two
  parts of the system disagree.
- **Never commit a secret.** `.env` is gitignored; credentials used for testing are disposable
  and scoped to nothing valuable.

## Skills

<Project-specific skills and slash commands, one line each on when to reach for them. The
workflow skills that gate feature work live in `.claude/CLAUDE.md` instead — this section is for
the ones unique to this project.>

## Post-mortems

None yet. When something bites, write it up as `docs/post-mortem/YYYY-MM-DD-<slug>.md` and link
it here with a one-line lesson.

## Read on demand — don't preload everything

<Each entry: the file, one line on what's in it, and — in bold — the trigger that means it must
be read. The trigger is the part that makes this section work; a list without triggers just gets
skipped.>

- **`<glossary file>`** — the project's vocabulary. **Read before naming anything, or whenever a
  term in a request feels ambiguous.**
- **`docs/adr/`** — the decisions and why they went that way, including which supersede which.
  **Read before changing architecture, or when code looks deliberately odd and you're tempted to
  "fix" it.**
- **`README.md`** — setup, layout, and the public surface. **Read before running or wiring
  anything.**
- **`<design or spec artifacts>`** — <what's settled in them, and any habits in them that must
  NOT cross over into production code>. **Read before <the work they govern>.**

## When sources conflict

<Name the winner for each kind of question — typically: the glossary wins on vocabulary, the ADRs
win on architecture with higher-numbered ones superseding those they name, and code wins on what
is actually built today. This file and the README describe intent as well as reality, so verify
before relying on either.>
