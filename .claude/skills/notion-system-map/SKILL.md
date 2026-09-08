---
name: notion-system-map
description: Use after any completed code change (feature, fix, or new file), or when asked to document/update what's in the system — only runs if NOTION_ENABLE=true is set
---

# Notion System Map

## Overview

Maintains a plain-English map in Notion of what's in the codebase,
written for the project's owner or a non-specialist maintainer to learn
it from — assume the reader has
basic coding knowledge only, not professional-developer fluency. Named
pages — one per product feature or per specific infrastructure concern —
each explaining how its files work together, then listing the files and
tests individually. A reader with no prior exposure to this codebase
should be able to follow not just what each file does, but how they fit
together — which file calls which, and why. This documents the
codebase's structure over time; it's distinct from
`plain-language-plan-review` / `completion-report`, which document one
change in progress.

**Incremental only — no backfill.** This only builds coverage as a
byproduct of future work. The existing codebase stays undocumented until
something happens to touch it. Don't treat "document everything" as a
mandate to sweep the whole repo — that's explicitly out of scope here.

## The Gate — Check This First, Every Time

**Before doing anything else in this skill**, check for
`NOTION_ENABLE=true` (exact value `true`) in the project's environment
configuration. Look where this project actually loads env vars from —
that may be `.env` at the repo root, `.env.local`, or a shell variable;
check the project's own env-loading module or `CLAUDE.md` rather than
assuming a filename.

- **Not present, or anything other than `true`:** stop. Do nothing —
  don't call any Notion tool, don't mention Notion, don't note that you
  skipped it. Behave as if this skill doesn't exist.
- **`true`:** proceed below.

Re-check the flag every time — don't cache the answer from earlier in the
session, and don't skip the check just because a later pipeline stage was
reached.

## When It Actually Fires

After any **completed** code change — a new file, or an existing file
whose purpose genuinely changed. Not on every edit mid-work, and not on a
trivial fix that doesn't change what a file does (a typo fix or a one-line
bug fix to an already-documented file usually needs no Notion update at
all, because the file's purpose hasn't changed). This applies whether or
not the change went through the full plan/test-plan pipeline — a small
fix that skipped that pipeline still triggers this, if it touched a file.

## Enumerate From the Diff, Not From Memory

Before writing or updating pages for a completed feature, get the actual
list of changed/created files from `git diff`/`git log` for that
feature's commits — the same discipline as the `git-commit-messages`
skill, and for the same reason: session memory of "what we built" can
miss a file, especially on a multi-task feature where earlier work
happened several messages ago or in a subagent. Writing pages from
memory risks silently leaving something out, which defeats the point —
completeness here matters as much as it does in a plan review.

## Deciding Where a Changed File Goes

For each touched file, in order, checking the MOST specific level first:

1. **Does it belong to an existing sub-feature page** (a child page under
   a bigger umbrella)? If so, update that page. No new page.
2. **If not, does it belong to an existing standalone page or umbrella
   page directly** (something shared across all of an umbrella's
   sub-features, or a standalone feature/infra page with no children)?
   If so, update that page.
3. **Is it a genuinely new, nameable thing** — a real product feature, a
   real infrastructure/cross-cutting concern, or a new sub-feature of an
   existing umbrella — that nothing existing covers? Only then, create a
   new page (see Big Features Made of Smaller Ones, below, for whether
   that new page is standalone or a child).
4. **Never a generic catch-all.** There is no "Shared Utilities" or
   "Misc" page. Every page, at any level, must pass this test: can you
   name, in one sentence, the specific real thing that unites its files?
   ("How the app connects to and authenticates against its database" passes;
   "stuff that didn't fit elsewhere" does not.) If a file seems homeless,
   that means either it needs its own new specific page, or it actually
   belongs to an existing page that wasn't checked carefully enough —
   never a reason to lower the bar and create a vague one.

## Big Features Made of Smaller Ones

Some features are genuinely made of several smaller, independently
nameable pieces — an analytics subsystem whose ingestion, scoring, and
reporting slices each stand on their own, sharing only a data shape
underneath them. Forcing that into one flat page loses the shape of how
it was actually built; forcing each slice directly under "Codebase Map"
loses the fact that they're all one bigger thing.

**Resolution: an umbrella page, with each sub-feature as its own child
page underneath it** — one extra level of nesting, not a new kind of
page:

```
Codebase Map
 └─ Analytics (umbrella)
     ├─ Event Ingestion
     ├─ Scoring
     └─ Reporting
```

- **When to split into an umbrella + children, instead of one page:**
  apply the same specificity test one level down — if a piece could pass
  "name the one specific thing that unites these files" *on its own*, it
  deserves its own child page. If the pieces are too small or tangled to
  stand alone, keep it as a single page instead.
- **The umbrella page itself** gets only an Overview (what the whole
  feature does, broadly) and a short list of its sub-features, one line
  each — not a "How It Connects" trail through every file (that lives on
  each child page) and not a re-listing of files already covered by a
  child. A file genuinely shared across ALL of the umbrella's
  sub-features (not just one) lives directly on the umbrella page's own
  Files section instead of being duplicated into every child.
- **Depth cap: two levels only** — umbrella, then sub-feature. Don't nest
  a sub-feature page's children further; if a sub-feature itself feels
  big enough to need splitting, that's a signal it should be promoted to
  its own umbrella instead.

## Structure in Notion

One parent page ("Codebase Map"), with every standalone feature or
infrastructure page as a child — pages only, unless the project
already uses a different Notion convention — check first and follow what
exists. Check whether the parent page
already exists before creating one. Some features nest one level deeper
than this, as their own umbrella with sub-feature children — see Big
Features Made of Smaller Ones, below.

Every standalone page and every sub-feature (child) page has exactly five
sections, in this order (an umbrella page itself is the one exception —
see below):

1. **Overview** — one or two plain-English sentences: what this does. No
   implementation detail.
2. **How It Connects** — a short narrated trail through the files, in the
   order things actually happen: what triggers it, what that calls next,
   and what that calls after that — ending wherever the trail stops being
   useful to follow (a database, an external API, a rendered screen).
   This is the section that turns a list of files into an explanation of
   how the feature works. If the feature calls into another feature's
   page, name that page rather than re-explaining it.
3. **What This Provides** — the actual door in: the specific function,
   hook, API route, or button someone (another part of the app, or the
   user) would use to invoke or build on this feature. Name it plainly —
   "other code that needs a user's remaining quota calls the
   `remainingQuota` function in the session module; that's the only
   supported way in" — not a restatement of the Overview. If the feature has no reuse
   surface (it's purely a rendered screen with nothing else to call into),
   say that plainly instead of forcing an entry that doesn't exist.
4. **Files** — one bullet per file: its path, then a plain-English
   sentence on what it does. Not what it's named, what it *does* —
   "filters the incoming list down to the entries this user is allowed to
   see," not "exports `filterVisible`."
5. **Tests** — one bullet per test file covering it: its path, then a
   plain-English sentence on what behavior it verifies — "confirms a
   request is refused once it would exceed the account's quota, even by
   one unit," not "tests `execute.test.ts`."

No code blocks, no function signatures, no line numbers — plain sentences
throughout, same register as the plan-review skills.

**Assume zero prior coding vocabulary.** The first time a technical term
is genuinely unavoidable on a page, explain it in a half-sentence right
there, in plain terms — "a Postgres function (a small program stored
inside the database itself, not in the app's code)," "a hook (a reusable
bit of logic a screen can plug into)." Don't assume the reader already
knows what an RPC, a schema, a hook, or a component is just because
they're common words to a developer.

## Keeping It Current

Don't wait to be asked — update proactively and mention in your response what was updated. If one change
touches files across multiple pages, update each page separately rather
than merging them into one entry.

## Common Mistakes

- Describing a file by its exports/API instead of what it accomplishes.
- Skipping the gate check because "it was on earlier in this session."
- Creating a second parent page without checking whether one exists.
- Creating a vague catch-all page instead of either a specific new page
  or attaching to an existing one.
- Touching Notion for a trivial fix that didn't change what a file does.
- Touching Notion while only exploring/reading code, not after a change.
- Treating this skill as a mandate to backfill the existing codebase.
- Writing pages from memory of the conversation instead of the actual
  `git diff`/`git log` for the feature — the exact failure this is meant
  to avoid.
- Letting "What This Provides" just restate the Overview instead of
  naming the actual function/hook/route/button to use.
