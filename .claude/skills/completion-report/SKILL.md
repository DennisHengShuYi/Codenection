---
name: completion-report
description: Use after code check and testing pass, to report back everything that was actually done on a feature or fix
---

# Completion Report

## Overview

This closes the loop opened by `plain-language-plan-review` and
`plain-language-test-plan`. Once implementation, code check
(`code-review`), and testing (`superpowers:verification-before-completion`)
are all done, report back in plain English exactly what happened —
checked against what was approved, not just what was intended.
**Completeness rule applies here too:** nothing gets left out to make the
report shorter or the outcome look cleaner.

Unlike the plan and test-plan stages, this is a **report, not a gate** —
it doesn't block on Plan Mode approval, because there's no action left to
approve. It still can't be written from memory or assumption: every claim
in it needs to trace back to something actually run or actually seen in
this session, per `superpowers:verification-before-completion`.

## Format

Three parts, in order:

1. **Against the implementation plan** — walk the same units of work from
   the approved plain-language plan. For each: state what was actually
   built. If it matches the plan, say so briefly. If it deviated (built
   differently, dropped, or something unplanned got added along the way),
   say so explicitly and why — don't let a silent deviation slide by
   because the end result "works anyway."
2. **Against the test plan** — walk every test named in the approved test
   plan. For each: was it written, and what was its actual, freshly-run
   result? Use real evidence (command output, pass/fail counts) — not
   "should pass" or a memory of an earlier run. Include failing or
   skipped tests exactly as plainly as passing ones.
3. **Deviations summary** — one place listing everything that differs
   from either approved plan: scope changes, anything skipped, anything
   added. If there are none, say that plainly too.

Plain English throughout — no code blocks, diffs, or exact signatures,
same as the plan and test-plan documents this is closing out.

## Common Mistakes

- Reporting only the happy outcome and quietly dropping a test that
  failed or was never written. The report exists specifically to surface
  that, not to hide it.
- Writing "everything works as planned" without walking each item — a
  summary claim isn't a substitute for the item-by-item check.
- Reusing an earlier verification run's output instead of a freshly-run
  one for this report — see `superpowers:verification-before-completion`.
