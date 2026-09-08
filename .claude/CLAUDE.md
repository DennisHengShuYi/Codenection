# Project Rules

- Never run `git push` or push any changes to a remote. Always wait for explicit confirmation before any push.
- Never take an irreversible or outward-facing action without explicit confirmation first — deploying, publishing, sending a message or email, deleting data, spending money, or writing to a production system. List this project's specific dangerous commands here by name so there is no ambiguity about which ones they are.
- Always clean up files created solely for testing purposes during a session.
- Testing must never run against production data, a real credential, or any path that can take one of the irreversible actions above. Use read-only commands or a dry-run/stubbed mode instead. Any manual verification step follows the same rule.
- Commit messages and PR descriptions must always be derived from the actual diff/commit range (`git diff --staged` for a commit; `git log <base>..HEAD` + `git diff <base>...HEAD` for a PR) — never written from session memory alone. See the `git-commit-messages` skill.
- Respect the architecture decisions recorded in this project's ADRs or design docs. If a change would violate one, stop and flag it instead of implementing it — even if the change would work.
- Untrusted input never becomes trusted by passing through a layer. Model output, client requests, and third-party API payloads get validated at the boundary; nothing downstream may treat them as already-checked. Where this project has a specific version of that rule (e.g. "a model may select an existing record but may never originate an identifier, a price, or a limit"), state it explicitly here.
- Limits, quotas, permissions and budgets are enforced server-side, never taken on the client's word.
- After ANY completed code change — including trivial fixes that skip the Feature Development Workflow below — check the `notion-system-map` skill. Its own gate (`NOTION_ENABLE=true` in this project's environment config) decides whether it actually does anything; this rule only ensures the check itself isn't skipped just because a change was small.


## Feature Development Workflow

For any new feature or non-trivial change, follow this pipeline in order — do not skip stages, merge them, or jump ahead:

1. **Plain-language plan** — present the plan in plain English (no code details) via the `plain-language-plan-review` skill. Gate approval using the real EnterPlanMode/ExitPlanMode tools, not just asking in chat.
2. **Real implementation plan** — once approved, produce the detailed code-level plan via `superpowers:writing-plans`.
3. **Test planning** — before writing any code, present a plain-language test plan via `plain-language-test-plan`. Separate EnterPlanMode/ExitPlanMode approval gate.
4. **Implementation** — build via `test-driven-development`, working through the approved test plan (red, then green).
5. **Code check** — review the actual diff via `code-review`.
6. **Testing** — verify before claiming anything is done, via `verification-before-completion`.
7. **Completion report** — report everything actually done, checked against stages 1 and 3, via `completion-report`.
8. **Notion system map** (conditional) — via `notion-system-map`, only if `NOTION_ENABLE=true` is set. This also fires independently of this pipeline — see the Project Rules above.

Run `security-check` alongside this pipeline: its static layer after any completed milestone, and its deep-audit and dynamic layers when the change touches a high-risk surface — anything holding a credential or secret, or able to take an irreversible action. The skill's own table says which layer applies to which kind of change.

Only skip this pipeline for trivial one-line fixes, or when the user explicitly says to skip it for the current task.
