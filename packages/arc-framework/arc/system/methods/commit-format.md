---
name: commit-format
description: Commit message format — structure, types, scope, body conventions
related:
  - commit-context-format
override-active: false
---

# Method: commit-format

> - **Workflow:** [prepare-commits.md][prepare-commits]
> - **When:** Agent writes a commit message
>
> - **Contract:** Commits follow a consistent, communicative format that enables automated tooling and readable
>   history.
> - **Related:** [commit-context-format](commit-context-format.md) — format changes may require context footer
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

**Types:** `feat` `fix` `docs` `content` `style` `refactor` `test` `chore` `perf` `build` `ci` `config` `revert`

**Scope:** Lowercase functional area (e.g., `auth`, `api`, `tests`, `config`, `arc`, `deps`).

**Subject line:** Describe the change, not the task. Don't include task references, phase numbers, or other
traceability metadata — the `Context:` footer handles that (see
[commit-context-format](commit-context-format.md)).

**Body:** Wrap at ~72 chars per line (renders cleanly in `git log`). Focus on WHY and IMPACT,
not what changed. Hard limits: 100 lines, 100 chars per line — exceed either and the commit
probably wants splitting or its prose moved to a doc.

**Phases vs. tasks:** Bare integers for phases (`Phase 1`, `Phase 2`); dotted form for tasks
(`Task 1.2`, `Task 3.1.a`). Never write `Phase X.Y` — that's a task identifier; the hook
blocks it. Preserves grep-ability: `git log --grep "Task 3.1"` should find the right commits.

**Enforcement:** Git hooks validate format when `commit.format` is `conventional` or `custom`
in [`arc-config.yml`][arc-config]. See `system/githooks/README.md` for setup.

---

[prepare-commits]: ../workflows/arc/supplemental/prepare-commits.md
[arc-config]: ../arc-config.yml
