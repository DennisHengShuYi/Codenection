---
name: plain-language-plan-review
description: Use when presenting an implementation plan to the user for approval, before any detailed execution plan is written
---

# Plain-Language Plan Review

## Overview

The plan a user reviews and approves is a different document from the plan an
implementer executes. This skill governs the review-facing one: plain English,
architecture and impact only. No code, no diffs, no exact signatures.

## Format

State the plan as prose organized by unit of work (feature, fix, or change).
For each unit, cover exactly these three things, in sentences:

- **What it does** — the behavior or outcome in plain language, as if
  explaining it to a colleague who hasn't seen the code.
- **New vs. reused** — name EVERY function, class, or file that gets
  *created*, and separately name EVERY existing function, class, or file that
  gets *used, called into, or modified* by the new work. Completeness is the
  point: the user is approving what the AI will do before any code is
  written, so nothing gets left out because it seemed minor. Names only — no
  parameters, no return types, no code.
- **System impact** — one of: "no change to existing behavior", "purely
  additive (nothing existing is touched)", or "changes existing behavior:
  `<one sentence on what changes and for whom>`".

Never shorten this section by omitting a function, class, or file to keep the
plan brief. If the full list is long, split it into sub-groups by feature
area or file so it stays readable — grouping is for organization, not for
dropping items.

Close the plan with a short summary line naming every existing behavior that
changes, so it's scannable without rereading each section.

## How Approval Actually Happens

Don't just paste the plan into a chat message and ask "does this look
good?" — that depends on me correctly reading your reply, and can be
wrong. Use Claude Code's real plan-mode gate instead:

1. **EnterPlanMode** — explore whatever's needed to understand the change.
2. Write the plain-language plan (following the Format above — prose
   only, no code) to the plan file the harness gives you.
3. **ExitPlanMode** — this presents the plan and blocks any further action
   until you explicitly approve or reject it in the UI. That approval is
   the real gate, not my judgment of your wording.

If the task is trivial enough that Plan Mode's own guidance says to skip
it (a one-line fix, fully specified instructions), this whole skill likely
doesn't apply either — see the Feature Development Workflow's own
skip clause.

## Common Mistakes

- **Trimming the "new vs. reused" list for brevity.** The user explicitly
  wants complete visibility into every function/class the AI will touch,
  not a curated highlight reel. If it's part of the change, it's named —
  every time, regardless of how small or how long the resulting list gets.
- **Calling something "just a small helper" to justify skipping it.** Size
  is not a reason to omit — only irrelevance is (e.g. don't list files the
  plan reads but never modifies or creates).

## Example

<Good>
"Add a `RetryPolicy` class that wraps outbound API calls with retry and
backoff. It's used by the existing `fetchInvoiceData` function, replacing its
current inline retry loop. This changes existing behavior: calls that used to
retry 3 times back-to-back will now back off exponentially between attempts."
</Good>

<Bad>
```typescript
class RetryPolicy {
  constructor(private maxRetries: number, private backoffMs: number) {}
  async execute<T>(fn: () => Promise<T>): Promise<T> { /* ... */ }
}
```
"Modify `fetchInvoiceData` in api/invoices.ts:42-58 to use RetryPolicy instead
of the inline while loop, per the diff above."
</Bad>

The Bad version is correct information delivered as an implementation
artifact. The Good version is the same decision delivered as a description.

## After Approval

Once the user approves the plain-language plan, this project follows a
fixed pipeline — do not skip stages or merge them:

1. **Real implementation plan** — **REQUIRED SUB-SKILL:**
   superpowers:writing-plans produces the detailed, code-level execution
   plan. Not shown to the user again unless asked.
2. **Test planning** — **REQUIRED SUB-SKILL:** plain-language-test-plan
   produces a second plain-English document, this time describing every
   test that will exist, using the same real Plan Mode gate, approved
   separately before any code is written.
3. **Implementation** — **REQUIRED SUB-SKILL:**
   superpowers:test-driven-development executes the approved test plan
   (red, then green) and the implementation plan together.
4. **Code check** — **REQUIRED SUB-SKILL:** code-review reads the actual
   diff for defects and missed reuse.
5. **Testing** — **REQUIRED SUB-SKILL:**
   superpowers:verification-before-completion gates any completion claim
   on freshly-run evidence.
6. **Completion report** — **REQUIRED SUB-SKILL:** completion-report
   produces a final plain-English account of everything actually done,
   checked against this plan and the test plan.

Each stage's own skill covers its details — this skill's job ends once
the plain-language plan is approved and stage 1 is handed off.
