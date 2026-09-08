---
name: plain-language-test-plan
description: Use when presenting a testing plan to the user for approval, after the detailed implementation plan is approved and before any test or implementation code is written
---

# Plain-Language Test Plan

## Overview

This sits between the approved, detailed implementation plan and actual
implementation. Before any test or production code is written, describe
every test that will exist in plain English, for the user to approve —
same idea as `plain-language-plan-review`, applied to testing instead of
architecture. **Completeness rule applies here too:** nothing gets left
out to keep the plan short.
The user wants full visibility into what will and won't be verified
before any code exists.

## Format

Walk the same units of work named in the approved implementation plan.
For every function, class, or behavior — new or reused-but-modified —
describe:

- **What is tested** — the behavior or scenario in plain language (e.g.
  "rejects an empty email on submit," not `expect(result.error)`).
- **Test type** — unit, integration, or end-to-end, and briefly why that
  level (e.g. "integration, because it depends on the real API response
  shape").
- **Cases covered** — every case, listed individually: the happy path,
  each edge case, each error/failure case. Never summarize a group as
  "and edge cases" — name each one.
- **Expected result** — what should happen, in plain language. No
  assertion syntax, no framework code, no mock setup.
- **Test data** — only for tests that touch something real and outside
  the test process: a live external API, a real database, a queue, a
  wallet, an account with credentials. One line confirming the test uses
  a disposable, valueless credential (or a stub) and never reaches a code
  path that can take an irreversible action — spending, sending,
  deleting, deploying, or writing to production. Name the specific
  path the project considers dangerous, as its `CLAUDE.md` defines it.
  Plain read-only calls are safe against real services and don't need
  this note. For anything touching shared in-process state (a
  module-level cache, map, or singleton), note that the test creates its
  own fresh instance rather than reusing the shared one.

Group sections in the same order as the implementation plan so the two
documents read side by side.

Close with a **coverage summary**: name every function/class from the
implementation plan that will have NO test written for it, and state why
(e.g. "pure layout, no logic to verify" or "trivial passthrough"). A gap
that isn't named is a gap the user can't approve or object to.

## How Approval Actually Happens

Same mechanism as `plain-language-plan-review` — don't just paste this
into a chat message and ask if it looks good. Re-enter **EnterPlanMode**
for this checkpoint (a fresh one, separate from the implementation-plan
approval), write the test plan above to the plan file, then call
**ExitPlanMode**. That's the real gate — it blocks further action until
you explicitly approve, rather than relying on my reading of your reply.

## Common Mistakes

- Skipping a scenario because it "obviously works." List it anyway — the
  point of this review is catching what's obvious to the AI but not yet
  verified by anyone.
- Writing in test-framework language (`expect().toBe()`, "mock the API
  call"). This is plain English only, exactly like the implementation
  plan review.
- Omitting a function because it seems minor. Same completeness rule as
  `plain-language-plan-review` — size is never a reason to omit,
  only genuine irrelevance is.
- Planning a test that runs against a real, privileged environment
  because "it's already set up and convenient." Convenience is never the
  reason — every test exercising a path that can take an irreversible
  action uses a disposable credential or a stubbed client, no
  exceptions.

## After Approval

Once the user approves the test plan, hand off to
**REQUIRED SUB-SKILL:** superpowers:test-driven-development to actually
write the tests (red) and implementation (green). The approved test plan
is the checklist TDD works through — nothing on it gets silently skipped,
and anything discovered mid-implementation that wasn't on the list gets
flagged back to the user rather than added quietly.
