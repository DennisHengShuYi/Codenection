---
name: git-commit-messages
description: Use when writing a git commit message or a pull request title/description
---

# Git Commit & PR Messages

## Overview

**A commit message or PR description describes the diff, not the
conversation.** The recurring failure this skill exists to stop: a
commit or PR bundles more than what happened in the current chat session
(earlier commits, changes staged outside the conversation, prior
sessions' work), but the message only narrates "what we just did" —
silently dropping everything else that's actually part of that commit or
PR.

**Core principle:** if you didn't read the actual diff for THIS commit or
THIS PR's full range in this message, you don't know what it contains —
session memory is not a substitute.

## Commit Messages

Before writing the message:

1. Run `git status` and `git diff --staged` (or `git diff` for what will
   be staged) and read the **full** result.
2. Base the message on that diff — not on recollection of the
   conversation. Staged changes can include things the user staged
   directly, leftovers from earlier in the session, or files added by an
   earlier `git add` you're not actively thinking about right now.
3. Every distinct change in the diff needs to be represented in the
   message (or correctly folded into one summary that actually covers
   it) — nothing in the diff goes undescribed because it wasn't the part
   you were just focused on.

## Pull Request Descriptions

PRs are the case this fails most often, because a PR's range is usually
bigger than one session:

1. Run `git log <base-branch>..HEAD` — **every** commit on the branch,
   not just the latest one.
2. Run `git diff <base-branch>...HEAD` — the full cumulative diff since
   the branch diverged.
3. The description must summarize the **entire branch**, including
   commits made before this session — by the user directly, or in an
   earlier Claude session. A PR opened after three sessions of work needs
   a description covering all three, not just the most recent one.
4. Cross-check: does every commit subject in the `git log` output map to
   something mentioned in the description? A commit with no trace in the
   description is a sign the description was written from session memory
   instead of the log.

## Common Mistakes

- Writing "added X" when the staged diff also contains Y and Z from
  earlier work — because the message came from remembering the most
  recent thing discussed, not from reading the diff.
- For PRs: describing only the latest round of changes and omitting
  commits already on the branch from before this session started.
- Assuming what's staged matches what this session touched — always
  verify with `git status`/`git diff`, since the working tree can change
  outside the conversation too.
- Skipping the fresh `git log`/`git diff` read because "I remember what
  this branch does" — memory drifts across a long session; the command
  output doesn't.

## Checklist

- [ ] Read the actual diff (commit: `git diff --staged`; PR: `git diff
      <base>...HEAD`) fresh, in this message — not from memory.
- [ ] For a PR, also read `git log <base>..HEAD` for the full commit list.
- [ ] Every distinct change in that diff/log is represented in the
      message — nothing left out because it predates this session.
- [ ] The message describes what changed and why, not a session
      transcript ("fixed the thing we discussed").
