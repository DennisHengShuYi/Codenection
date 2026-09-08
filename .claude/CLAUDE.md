# Project Rules

- Never run `git push` or push any changes to a remote. Always wait for explicit confirmation before any push.
- Never take an irreversible or outward-facing action without explicit confirmation first — deploying, publishing, sending a message or email, deleting data, spending money, or writing to a production system. List this project's specific dangerous commands here by name so there is no ambiguity about which ones they are.
- Always clean up files created solely for testing purposes during a session.
- Testing must never run against production data, a real credential, or any path that can take one of the irreversible actions above. Use read-only commands or a dry-run/stubbed mode instead. Any manual verification step follows the same rule.
- Every behaviour change ships with its tests updated in the same change — see "Tests are part of the change" below. A pull request that changes what the code does but leaves the test files untouched is incomplete, not finished-and-tested.
- Commit messages and PR descriptions must always be derived from the actual diff/commit range (`git diff --staged` for a commit; `git log <base>..HEAD` + `git diff <base>...HEAD` for a PR) — never written from session memory alone. See the `git-commit-messages` skill.
- Respect the architecture decisions recorded in this project's ADRs or design docs. If a change would violate one, stop and flag it instead of implementing it — even if the change would work.
- Untrusted input never becomes trusted by passing through a layer. Model output, client requests, and third-party API payloads get validated at the boundary; nothing downstream may treat them as already-checked. Where this project has a specific version of that rule (e.g. "a model may select an existing record but may never originate an identifier, a price, or a limit"), state it explicitly here.
- Limits, quotas, permissions and budgets are enforced server-side, never taken on the client's word.
- After ANY completed code change — including trivial fixes that skip the Feature Development Workflow below — check the `notion-system-map` skill. Its own gate (`NOTION_ENABLE=true` in this project's environment config) decides whether it actually does anything; this rule only ensures the check itself isn't skipped just because a change was small.


## Tests are part of the change

The CI check on every pull request is only worth what the tests behind it cover. A green
build on stale tests proves the code still does what it used to do — not that it does what
it now claims to do. So **whenever behaviour changes or a feature is added, the test files
are updated in the same change**, never in a follow-up.

What "updated" means, concretely — all four, every time they apply:

- **New behaviour gets new tests.** Every new function, route, component, or branch added
  in a change has a test written for it, following `test-driven-development`: the test
  comes first and is watched failing, so it is proven capable of catching the bug it
  guards against.
- **Changed behaviour gets its existing tests rewritten.** If a change alters what a
  function returns, when it throws, or what a route responds with, the tests asserting the
  old behaviour are updated to assert the new one — deliberately, as part of the change.
- **Removed behaviour gets its tests removed.** Deleting code without deleting its tests
  leaves either a broken build or a test covering something that no longer exists.
- **Bug fixes get a regression test first.** Reproduce the bug in a failing test, then fix
  it. A fix with no test is a fix that can silently come back.

Rules that keep the gate honest:

- **Never make a failing test pass by weakening it.** Deleting an assertion, loosening a
  matcher, marking a test `.skip`, or adding it to an ignore list to get CI green is
  falsifying the check, not passing it. Fix the code. The only exception is a test that was
  genuinely asserting the wrong thing — and that gets said out loud in the pull request,
  not done quietly.
- **Never disable, weaken, or bypass a CI step to land a change.** If the check is wrong,
  fix the check in its own change and say why.
- **Coverage thresholds only ever go up.** Lowering a threshold to accommodate untested new
  code defeats the threshold.
- **The tests must actually be committed.** A test that exists only in the working tree is
  a test CI never runs. Confirm it is in the diff, per `verification-before-completion`.
- **`--passWithNoTests` is temporary scaffolding.** It exists so the pull request gate is
  green on an empty repository. Remove it from the `test` and `test:coverage` scripts as
  soon as the first real source file lands — after that it lets an empty or accidentally
  unmatched suite report success, which is exactly the failure this section is about.

Before opening or updating a pull request, check: does the diff change behaviour? If yes,
does the same diff touch a test file? If the answer is yes then no, the change is not ready.

## Feature Development Workflow

For any new feature or non-trivial change, follow this pipeline in order — do not skip stages, merge them, or jump ahead:

1. **Plain-language plan** — present the plan in plain English (no code details) via the `plain-language-plan-review` skill. Gate approval using the real EnterPlanMode/ExitPlanMode tools, not just asking in chat.
2. **Real implementation plan** — once approved, produce the detailed code-level plan via `superpowers:writing-plans`.
3. **Test planning** — before writing any code, present a plain-language test plan via `plain-language-test-plan`. Separate EnterPlanMode/ExitPlanMode approval gate.
4. **Implementation** — build via `test-driven-development`, working through the approved test plan (red, then green).
5. **Code check** — review the actual diff via `code-review`. Part of that read is confirming the diff updates the tests for whatever behaviour it changes — see "Tests are part of the change" above.
6. **Testing** — verify before claiming anything is done, via `verification-before-completion`.
7. **Completion report** — report everything actually done, checked against stages 1 and 3, via `completion-report`.
8. **Notion system map** (conditional) — via `notion-system-map`, only if `NOTION_ENABLE=true` is set. This also fires independently of this pipeline — see the Project Rules above.

Run `security-check` alongside this pipeline: its static layer after any completed milestone, and its deep-audit and dynamic layers when the change touches a high-risk surface — anything holding a credential or secret, or able to take an irreversible action. The skill's own table says which layer applies to which kind of change.

Only skip this pipeline for trivial one-line fixes, or when the user explicitly says to skip it for the current task.
