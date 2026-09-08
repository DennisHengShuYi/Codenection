---
name: security-check
description: Use after completing a milestone/feature, or before committing a change to a high-risk surface (anything holding a credential, secret, or the ability to spend money/take an irreversible action), to run a three-layer local security check -- no deployment required
---

# Security Check (Local, Three-Layer)

## Overview

No single tool catches every class of security bug, so this skill runs
three layers with different jobs, all against the code and server **on
this machine** — nothing here requires deploying anywhere:

1. **Static (Semgrep)** — catches obvious stuff in the source: hardcoded
   secrets, injection patterns, unsafe crypto/auth usage, shell-injection-
   shaped subprocess calls, and CI/CD supply-chain issues (e.g. a GitHub
   Actions step pinned to a mutable tag like `@v4` instead of a full
   commit SHA). Cheap, fast, no running server needed.
2. **Deep audit (`claude-security` plugin)** — a threat-modeling pass over
   the actual diff, for the business-logic invariants a static scanner
   can't see: does an authorization check actually run on every path that
   needs it, can a caller race two requests past a check meant to be
   atomic, does an invariant the product depends on actually hold in
   code. This is the `claude-security@claude-plugins-official` plugin
   (published by Anthropic) — a menu-driven deep scan where every finding
   is challenged by a verification agent before being reported, not a
   single pass. `disable-model-invocation` is set on it, which blocks
   *any* agent-side invocation — not just auto-triggering, but the Skill
   tool as well. It can only be started by the human directly typing
   `/claude-security` in the terminal and picking "scan changes," pointed
   at the current diff or branch — the coding agent cannot run this step
   on its own behalf, only remind you to.
3. **Dynamic (HawkScan)** — attacks the running app's actual endpoints:
   can a protected route be called without auth, does CORS actually
   reject a bad origin, does an endpoint leak more than it should. This
   needs the server *running*, but running locally (e.g. `npm run dev`
   against `localhost`) is enough — it does not need to be deployed or
   publicly reachable. Use the `hawkscan` skill (from the
   `wingman@stackhawk` plugin, StackHawk's own Claude Code integration)
   rather than driving the CLI/Docker image by hand — it generates the
   `stackhawk.yml` config and runs the scan for you. Requires the `hawk`
   binary installed and authenticated once (`hawk.exe init --browser` on
   Windows) — that's a one-time, per-machine setup step, not something to
   redo per scan.

None of the three replace each other, and none of them replace the
`code-review` skill or the project's own `CLAUDE.md` rules — this skill
is a supplement to those, focused specifically on security.

## The One Hard Rule Before Any Dynamic Scan

**Never run HawkScan (or anything that fuzzes live HTTP requests) against
an instance holding real credentials or write access to anything that
matters.** A dynamic scanner sends real requests to every endpoint it
finds, including ones that mutate state, send messages, delete records,
or spend money — if it's pointed at an instance with real permissions, a
successful "auth bypass" finding is a real action taken, not just a
report line.

Before step 3, always confirm the instance being scanned is safe to
attack:
- Any API credential, signing key, or write-capable token it holds is
  either unset or scoped to something disposable and valueless (a test
  account, a sandbox tenant, a scratch database) — never the real one.
- If a real credential must be present for the test to be meaningful,
  use a dedicated throwaway instance of it, never the one actually relied
  on for real use.

Scanning with no real credentials attached is usually the *better* test
anyway — it proves an endpoint rejects a bad request unconditionally, not
just because it happened to have nothing valuable behind it that day.

## Step by Step

### 1. Static scan — every milestone

```bash
semgrep scan --config auto .
```

If `semgrep` isn't installed yet: `pip install semgrep` (or `pipx
install semgrep` / `brew install semgrep`) — the npm package named
`semgrep` is an unrelated name-squatted stub, not the real tool; `npx
semgrep` will silently fail. If `pip install` succeeds but the `semgrep`
command still isn't found, the install directory (commonly a `Scripts/`
or `bin/` folder next to wherever `pip` put it) isn't on PATH for the
current shell — locate it and either add it to PATH or invoke it by full
path for now.

No server needed. Run this after any completed milestone, however small.
Fix or explicitly triage every finding before moving on — don't let them
accumulate silently.

**Read the flagged code before applying a fix — a generic static-analysis
suggestion can be wrong for this specific call site.** A real example:
Semgrep flagged `spawnSync(..., { shell: true })` in a fixtures script
and suggested `shell: false`. The command and args at that call site were
fully hardcoded (nothing attacker- or network-reachable ever touches
them), and the file's own comment explained `shell: true` was there on
purpose to work around a Windows-specific quirk — removing it would have
broken the script on the exact platform it's developed on, trading a
non-issue for a real regression. When a finding's fix could change
behavior, check what the surrounding code is actually doing (any
comments explaining why it's written that way, whether the flagged input
is genuinely attacker-reachable) before applying the tool's generic
advice. Triaging a finding as an accepted false-positive (with a short
comment on why) is a legitimate outcome, not a cop-out — it's not the
same as ignoring it silently.

### 2. Deep audit — before a change to a high-risk surface

Run `/claude-security` and choose **"scan changes"** — this branch's
diff, or a specific commit/PR. It won't fire on its own (explicit
invocation only), so it has to be called by name each time.

**Stop here and wait.** This step requires the human to run
`/claude-security` themselves and report the results back — the coding
agent cannot do it on their behalf (see the Overview). Once step 1 is
done, if this step is required (per the table below), do not proceed to
step 3, and do not carry on with unrelated work as if this step were
optional or already handled. Ask for it, then actually wait for the
findings to come back before continuing.

"High-risk surface" is project-specific — identify it once per project
(the module that holds a credential or signing key, the code path that
moves money or takes an irreversible action, the auth/authorization
check that everything else depends on) and treat a change touching it as
the trigger, the same way a project's own `CLAUDE.md` would name its
own sensitive files.

Not required for changes with no security surface (docs, comments,
purely cosmetic output) — use judgment, but default to running it
whenever in doubt.

### 3. Dynamic scan — after route/auth changes, local server only

```bash
<start the app locally, e.g. npm run dev>
```
Then invoke the `hawkscan` skill (e.g. "scan my app for security
vulnerabilities with StackHawk") — it handles config generation, running
the scan, and turning findings into fix tasks. Point it at the local
server, not a deployed one.

Run this whenever routing, CORS config, or an auth/token check changed —
not required for changes confined to internal logic with no route
surface change.

## When to Run Which

| What changed | Static | Deep audit | Dynamic |
|---|---|---|---|
| Any commit, any size | always | — | — |
| A high-risk surface (credentials, spend/write path, core invariant) | always | always | if route/auth also changed |
| Routing, CORS, or an auth/token check | always | always | always |
| Docs, comments, non-functional output | always | — | — |
| Before any action that isn't easily reversible | always | always | recommended |

## Reporting

Fold findings into whatever's already closing out the milestone — a
completion report's deviations section is a natural place to note
"security check run: N static findings (fixed/triaged), deep audit
clean/found X, dynamic scan clean/found Y." Don't let a security check
happen silently with no record of what it found.

## Common Mistakes

- Running HawkScan against an instance with real credentials attached —
  see the Hard Rule above. This is the one mistake in this skill
  that can actually cause real damage, not just miss a bug.
- Treating the static scan as sufficient for a high-risk-surface change —
  Semgrep does not understand a project's own business-logic invariants;
  only the deep audit (or a human) does.
- Skipping the deep audit because "it's just a small change" to a
  sensitive file — size is not a reason to skip on a high-risk surface;
  only genuine irrelevance is (see `code-review`'s same rule).
- Assuming the coding agent can run `/claude-security` on your behalf —
  it can't; `disable-model-invocation` blocks agent-side invocation
  entirely, so this step only ever happens if you type it yourself, every
  time, even mid-pipeline.
- Running the dynamic scan against a change with no route/auth surface —
  wasted effort; the deep audit already covers internal-logic changes.
- Forgetting to reconfirm, right before a dynamic scan, that no real
  credential has been left attached from an earlier, unrelated test.
- Applying a static-analysis tool's generic suggested fix without reading
  the actual call site first — see the `spawnSync`/`shell: true` example
  above. A fix that's correct in general can be wrong for one specific,
  already-deliberate line of code.
- Guessing at values a fix needs to be correct (e.g. pinning a CI action
  to a commit SHA typed from memory instead of looked up) rather than
  either looking it up properly or asking before applying it — a wrong
  SHA silently breaks CI instead of hardening it.
- **Running the wrong tool because it shares the name "semgrep."**
  `npx semgrep` does not run real Semgrep — there is an unrelated,
  name-squatted npm package called `semgrep` (seen at v0.0.1) that `npx`
  will happily resolve to instead, failing with a confusing "could not
  determine executable to run" rather than a clear "wrong package"
  error. This can look like Semgrep itself is broken when it's actually
  never been invoked at all. Always install and run the real one via
  `pip`/`pipx`/`brew` (see Step 1) — never `npx semgrep`, and don't
  assume a `semgrep` on PATH is the right one without checking
  `semgrep --version` reports a real version and that `command -v
  semgrep` (or `where semgrep`) points at a Python/pip-installed
  location, not a node_modules or npm-global one.
- **Skipping past step 2 instead of stopping for it.** When walking
  through this skill, treat step 2 as a hard pause: after step 1 is
  done, stop and wait for the human to actually run `/claude-security`
  and report back its findings before doing anything with step 3 —
  don't move on to discussing or running the dynamic scan in the same
  turn as a way of not-quite-skipping step 2, and don't treat "I
  reminded them to run it" as equivalent to it having been run. Step 3
  only starts once step 2's real results (or an explicit decision that
  step 2 isn't required for this change, per the table above) are in
  hand.
