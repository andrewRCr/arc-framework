---
name: commit-format
description: Commit message format — structure, types, scope, body conventions
related:
  - commit-footer
override-active: false
---

# Method: commit-format

> - **Workflow:** [prepare-commits.md][prepare-commits]
> - **When:** Agent writes a commit message
>
> - **Contract:** Commits follow a consistent, communicative format that enables automated tooling and readable
>   history.
> - **Related:** [commit-footer](commit-footer.md) — format changes may require context footer
>   adaptation

## commit-format.override

[No override configured]

## commit-format.default

Conventional commit format.

```text
<type>(scope): Brief description (max 72 chars total, imperative mood)

- Key change or rationale (1-2 lines per bullet)
- Impact if significant
```

### Message submission

Submit multiline messages as file-backed input so the shell cannot interpolate or reshape the content. Use a quoted
heredoc with `-F -` for either routed command, choosing a delimiter that does not occur as a complete line in the
message. The examples use `ARC_COMMIT_MESSAGE_9F3D`; verify it is absent or replace it before running them:

```sh
arc release commit -F - <<'ARC_COMMIT_MESSAGE_9F3D'
<type>(scope): Brief description

- Key change or rationale

Context: tasks-example.md (Task 1.2)
ARC_COMMIT_MESSAGE_9F3D
```

```sh
git commit -F - <<'ARC_COMMIT_MESSAGE_9F3D'
<type>(scope): Brief description

- Key change or rationale

Context: tasks-example.md (Task 1.2)
ARC_COMMIT_MESSAGE_9F3D
```

When the resident harness matcher cannot verify shell redirection, write the complete message to a prepared file and
pass it as direct argv: `arc release commit -F <message-file>` for wrapper routes or
`git commit -F <message-file>` for raw routes. Repeated `-m` options remain valid for intentionally separate
paragraphs: Git inserts one blank line between each option's value; they are not line-fragment continuations.

The release wrapper preflights deterministic message input before Git. If Git later returns non-zero, the wrapper
atomically replaces its worktree-local latest-retry file and prints a shell-quoted `arc release commit -F <path>`
command. A successful wrapper invocation consuming that exact file removes it. Preflight, latest-retry replacement,
and successful-consumption cleanup are wrapper-only behavior; raw `git commit` does not provide them.

**Types:** `feat` `fix` `chore` `docs` `refactor` `test` `perf` `revert`

**Type selection:** Type is chosen by intent, not file extension.

- `feat` — new capability (workflow, method, strategy, template, convention codification — even when
  delivered entirely in `.md`)
- `fix` — correcting drift, stale references, or out-of-date language in methodology surface
- `refactor` — restructuring methodology surface without behavior/convention change
- `docs` — external-facing prose only (`README.md`, docs-site content, onboarding guides)

Rule of thumb: "What changed in system behavior or capability? Yes → `feat` / `fix` / `refactor`;
No → `docs`"

**Three-layer convention.** Each commit-message layer carries orthogonal information.

- **Subject scope** — LOCUS of change. Lowercase functional-area or codified-surface name in parentheses.
  Prefer narrow scopes when the work is bounded to one surface: `(workflow)`, `(method)`, `(strategy)`,
  `(hook)`, `(skill)`, `(template)`, `(rules)`, `(meta)`. Reserve `(arc)` for cross-cutting framework
  concerns AND ARC lifecycle ceremony invocations — it is not a default-when-uncertain catch-all.
  Project-defined scopes (`auth`, `api`, `deps`, etc.) follow the same locus principle.

- **Subject body** — SPECIFIC work. Describe the change itself, not the task that motivated it — task
  references, phase numbers, and other traceability metadata route through the `Context:` footer (see
  [commit-footer](commit-footer.md)). For ceremony commits, lead with the action verb:
  `handoff — <position>` / `activate <wu-name>` / `integrate <wu-name>` / `archive <wu-name>` /
  `deactivate <wu-name>`.

- **Footer parenthetical** — LIFECYCLE ACTION. `(handoff)`, `(activation)`, `(integration)`,
  `(archival)`, `(deactivation)`, `(maintenance)`, `(incidental during ...)`. Machine-parse SoT; see
  [commit-footer](commit-footer.md) for the full set and chain semantics.

**Body:** Wrap at ~72 chars per line (renders cleanly in `git log`). Focus on WHY and IMPACT,
not what changed. Hard limits: 100 lines, 100 chars per line — exceed either and the commit
probably wants splitting or its prose moved to a doc.

**Phases vs. tasks:** Bare integers for phases (`Phase 1`, `Phase 2`); dotted form for tasks
(`Task 1.2`, `Task 3.1.a`). Never write `Phase X.Y` — that's a task identifier; the hook
blocks it. Preserves grep-ability: `git log --grep "Task 3.1"` should find the right commits.

**Enforcement:** Git hooks validate format when `commit.format` is `conventional` or `custom`
in [`arc-config.yml`][arc-config]. See `system/.internal/githooks/README.md` for setup.

---

[prepare-commits]: ../workflows/arc/supplemental/prepare-commits.md
[arc-config]: ../arc-config.yml
