---
name: commit-context-format
description: Context footer format linking each commit to its task or work context
related:
  - commit-format
override-active: false
---

# Method: commit-context-format

> - **Workflow:** [prepare-commits.md][prepare-commits]
> - **When:** Agent writes a commit message
>
> - **Contract:** Every commit includes a context footer naming the most specific spec-shaped artifact under
>   edit. Format must be grep-searchable across commit history.
> - **Related:** [commit-format](commit-format.md) — both govern the commit message structure

## commit-context-format.override

[No override configured]

## commit-context-format.default

`Context:` footer naming the artifact this commit edits.

**Specificity rule.** Name the most specific spec-shaped artifact under edit, falling back through the chain:
task list → plan doc → status file → category. Task work names the task list (the spec); ceremony commits
name the status file (the artifact actually being edited at lifecycle boundaries); plan-iteration commits
name the plan doc.

### Task-list references — `tasks-[name].md`

Used when the commit operates on a task spec or on the task list itself.

- `Context: tasks-[name].md (Task X.Y)` — single task
- `Context: tasks-[name].md (Tasks X.Y-X.Z)` — range
- `Context: tasks-[name].md (Tasks X.Y, A.B)` — non-contiguous
- `Context: tasks-[name].md (Task X.Y; planning)` — task + extra task list work
- `Context: tasks-[name].md (incidental - discovered during <context>)` — incidental fix folded in
- `Context: tasks-[name].md (planning)` — task list metadata only
- `Context: tasks-[name].md (maintenance)` — task list maintenance only
- `Context: tasks-[name].md (code review)` — review-driven changes to task-listed work

### Plan-doc / PRD references — `plan-[name].md` or `prd-[name].md`

Used during planning sessions when iterating a spec-shaped artifact. `plan-*` covers
pre-PRD planning artifacts; `prd-*` covers post-PRD-generation iteration on the formalized
spec (e.g., requirement amendments or scope clarification surfaced during pre-implementation
audit). Both take the same parentheticals.

- `Context: plan-[name].md (planning)` — plan iteration
- `Context: plan-[name].md (code review)` — review-driven changes to the plan
- `Context: prd-[name].md (planning)` — PRD iteration
- `Context: prd-[name].md (code review)` — review-driven changes to the PRD

### Status-file references — `status-[name].md`

Used for WU lifecycle ceremonies (which edit the status file) and for freeform planning before a plan doc
exists.

- `Context: status-[name].md (handoff)` — status-file rotation at session boundary (dedicated
  `chore(status):` commit per [DEV-RULES.ARC][dev-rules-arc] § Commit Discipline)
- `Context: status-[name].md (activation)` — backlog → active transition
- `Context: status-[name].md (integration)` — integration prep (completion doc, cleanup, reference fixes;
  not review-driven fixes — see `(code review)` on `tasks-`/`plan-`)
- `Context: status-[name].md (archival)` — active → archive transition
- `Context: status-[name].md (planning)` — freeform planning before a plan doc exists
- `Context: status-[name].md (incidental - discovered during <context>)` — incidental fix folded into a
  ceremony or freeform-planning commit

### Atomic companion references — `atomic-[name].md`

- `Context: atomic-[name].md` — work-unit-scoped atomic task

Use `atomic-*.md` only for commits that complete work tracked in the companion file. Incidental fixes
discovered *during* an atomic task but not themselves tracked there use the task list incidental pattern:
`tasks-[name].md (incidental - discovered during <context>)`.

### No work unit

- `Context: [category] (no associated task list)` — emergent work
- `Context: [category] (atomic / no associated task list)` — standalone small one-off work

**Categories:** `planning`, `documentation`, `maintenance`, `refactor`, `content`.

### Contributor

- `Context: contribution (fix typo in README)` — freeform description
- `Context: contribution (implement feature per issue #42)` — issue reference
- `Context: contribution (add dark mode support)` — feature description

Contributors (`arc.role = contributor`) use the `contribution` context with a freeform parenthetical
describing the change. The parenthetical is not structured — describe what the contribution addresses. This
format is accepted from any role but is the expected convention for contributor commits.

**Enforcement:** Git hooks validate the context footer when `commit.context_footer` is `required` or `custom`
in [`arc-config.yml`][arc-config].

---

[prepare-commits]: ../workflows/arc/supplemental/prepare-commits.md
[arc-config]: ../arc-config.yml
[dev-rules-arc]: ../../reference/constitution/DEV-RULES.ARC.md
