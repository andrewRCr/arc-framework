---
name: commit-context-format
description: Context footer format linking each commit to its task or work context
related:
  - commit-format
has-override: false
---

# Method: commit-context-format

> - **Workflow:** [prepare-commits.md][prepare-commits]
> - **When:** Agent writes a commit message
>
> - **Contract:** Every commit includes a context footer linking it to its task or work context. Format must be
>   grep-searchable across commit history.
> - **Related:** [commit-format](commit-format.md) — both govern the commit message structure

## commit-context-format.override

[No override configured]

## commit-context-format.default

`Context:` footer with task list reference or category.

**With task list:**

- `Context: tasks-[filename].md (Task X.Y)` — single task
- `Context: tasks-[filename].md (Tasks X.Y-X.Z)` — range
- `Context: tasks-[filename].md (Tasks X.Y, A.B)` — non-contiguous
- `Context: tasks-[filename].md (Tasks X.Y; planning)` — task + extra task list work
- `Context: tasks-[filename].md (incidental - discovered during <context>)` — incidental fix
- `Context: tasks-[filename].md (planning)` — task list metadata only
- `Context: tasks-[filename].md (activation)` — backlog to active transition
- `Context: tasks-[filename].md (integration)` — integration prep (completion doc, cleanup,
  reference fixes; not review-driven fixes — see `(code review)`)
- `Context: tasks-[filename].md (code review)` — commits responding to code review findings
  (local pre-merge or PR-stage)
- `Context: tasks-[filename].md (archival)` — active to archive transition

**With atomic companion file:**

- `Context: atomic-[filename].md` — work-unit-scoped atomic task

Use `atomic-*.md` only for commits that complete work tracked in the companion file. Incidental
fixes discovered *during* an atomic task but not themselves tracked there use the task list
incidental pattern: `tasks-[filename].md (incidental - discovered during <context>)`.

**Without task list:**

- `Context: [category] (no associated task list)` — emergent work
- `Context: [category] (atomic / no associated task list)` — standalone small one-off work

**Categories:** `planning`, `documentation`, `maintenance`, `refactor`.

**With contributor role:**

- `Context: contribution (fix typo in README)` — freeform description
- `Context: contribution (implement feature per issue #42)` — issue reference
- `Context: contribution (add dark mode support)` — feature description

Contributors (`arc.role = contributor`) use the `contribution` context with a freeform
parenthetical describing the change. The parenthetical is not structured — describe what
the contribution addresses. This format is accepted from any role but is the expected
convention for contributor commits.

**Enforcement:** Git hooks validate context footer when `commit.context_footer` is `required` or `custom`
in [`arc-config.yml`][arc-config].

---

[prepare-commits]: ../workflows/arc/supplemental/prepare-commits.md
[arc-config]: ../arc-config.yml
