---
name: code-review
description: Use after writing or modifying code, before committing or claiming a task is done
---

# Code Review

## Overview

Review the actual diff for real defects and missed reuse — not a
verification pass (that's `superpowers:verification-before-completion`,
which checks you *ran* the tests/build; this skill checks whether the
*code itself* is right). Run both before calling anything done.

## What to Review

Run `git diff` (or `git diff --staged`) and read every changed line.
Check for:

- **Correctness bugs** — wrong logic, off-by-one, unhandled null/undefined,
  race conditions, wrong variable used, incorrect condition. Only flag
  things that will actually misbehave, not "could theoretically be
  clearer."
- **Reuse / duplication** — does this change reimplement something that
  already exists elsewhere in the codebase (a hook, a utility, a shared
  component)? Point to the existing one by file path.
- **Simplification** — logic that's more complex than the problem needs
  (unnecessary abstraction, dead branches, redundant state).
- **The project's own rules** — read the project's `CLAUDE.md` /
  `AGENTS.md` (root and `.claude/`) before reviewing, and check the diff
  against whatever it actually says. Every project states its own
  invariants; this skill's job is to hold the diff to them rather than to
  a fixed list. Things worth looking for in most projects:
  - **Documented invariants and architectural decisions** (ADRs, "never
    do X" rules, trust boundaries). Flag any change that weakens one,
    even if the change works.
  - **Trust boundaries** — untrusted input (an LLM response, a client
    request, a third-party API payload) flowing into a place that treats
    it as trusted, without validation in between.
  - **Server-side enforcement** — a limit, quota, permission, or budget
    check that the diff now takes on the client's word instead of
    verifying on the server.
  - **Source of truth** — new caching or duplication of state the project
    has decided must be read live from its authoritative source.
  - **Irreversible or outward-facing actions** — pushes, deploys,
    payments, deletions, live writes, sends. Flag if the diff or the
    conversation implies one happened without the explicit confirmation
    the project requires.
  - **Scratch artifacts** — temporary or test-only files left behind, with
    anything non-obvious they revealed not written down anywhere durable.
- **Security basics** — hardcoded secrets, unvalidated input crossing a
  trust boundary, obvious injection risk.

## What NOT to Flag

- Pre-existing issues outside the lines actually changed.
- Anything a linter, type checker, or test run would already catch —
  assume those run separately; don't manually re-derive them.
- Stylistic nitpicks a senior engineer wouldn't bother raising.
- Changes that are clearly intentional and match what was asked for.
- Real issues on lines the diff didn't touch.

## Output

For each real finding: cite `file:line`, state the concrete failure
scenario (what input/state breaks it), and say what to do about it. If
there's nothing worth flagging, say so plainly — don't invent nitpicks to
seem thorough.

## When to Run

After any non-trivial code change, before:
- Committing
- Telling the user a task is complete
- Moving to the next task

Pairs with `superpowers:verification-before-completion` — that skill
gates the *claim* ("tests pass") on having run the command; this skill
gates the *code* on having actually been read for defects. Do both, not
either/or.
