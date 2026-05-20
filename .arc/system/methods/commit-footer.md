---
name: commit-footer
description: Context footer naming the deepest spec-shaped artifact in the WU chain, or `standalone` off-WU
related:
  - commit-format
override-active: false
---

# Method: commit-footer

> - **Workflow:** [prepare-commits.md][prepare-commits]
> - **When:** Agent writes a commit message
>
> - **Contract:** Every commit includes a context footer naming the deepest spec-shaped artifact
>   under edit along the work-unit chain, or the `standalone` anchor when no active WU exists.
>   Format must be grep-searchable across commit history.
> - **Related:** [commit-format](commit-format.md) — both govern the commit message structure

## commit-footer.override

[No override configured]

## commit-footer.default

`Context:` footer naming the artifact this commit edits.

**Chain naming.** The footer names the deepest spec-shaped artifact under edit along the WU chain:

`meta-{name}` (lifecycle / maintenance) → `plan-{name}` / `prd-{name}` (Spec) → `tasks-{name}`
(execution spec) → `atomic-{name}` (atomic-companion scope)

Walk down from `meta-*` to the most specific artifact this commit edits. Ceremony and maintenance
commits name the meta file; planning iteration names the plan/PRD; task-execution commits name the
task list; atomic-companion completion names the atomic file. When no active WU exists, the chain
collapses to the `standalone` anchor (see § Standalone anchor).

**Discreteness test (incidental in-WU vs. standalone off-WU).** Active WU? Yes → in-chain
file-pointer with `(incidental during X)`. No → `standalone (...)`. Single binary check.

### Task-list references — `tasks-[name].md`

Used when the commit operates on a task spec or on the task list itself.

- `Context: tasks-[name].md (Task X.Y)` — single task
- `Context: tasks-[name].md (Tasks X.Y-X.Z)` — range
- `Context: tasks-[name].md (Tasks X.Y, A.B)` — non-contiguous
- `Context: tasks-[name].md (Task X.Y; planning)` — task + extra task list work
- `Context: tasks-[name].md (incidental during <context>)` — incidental fix folded in
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

### Meta-file references — `meta-[name].md`

Used for WU lifecycle ceremonies (which edit the meta file) and for off-ceremony meta edits.

- `Context: meta-[name].md (handoff)` — meta-file rotation at session boundary (dedicated
  `chore(arc):` commit per [DEV-RULES.ARC][dev-rules-arc] § Commit Discipline)
- `Context: meta-[name].md (activation)` — backlog → active transition
- `Context: meta-[name].md (integration)` — integration prep (completion doc, cleanup, reference
  fixes; not review-driven fixes — see `(code review)` on `tasks-`/`plan-`)
- `Context: meta-[name].md (archival)` — active → archive transition
- `Context: meta-[name].md (deactivation)` — active → backlog rotation
- `Context: meta-[name].md (maintenance)` — off-ceremony meta edits (review-driven or otherwise)
- `Context: meta-[name].md (incidental during <context>)` — incidental fix folded into a
  ceremony or maintenance commit

### Atomic companion references — `atomic-[name].md`

- `Context: atomic-[name].md` — work-unit-scoped atomic task

Use `atomic-*.md` only for commits that complete work tracked in the companion file. Incidental fixes
discovered *during* an atomic task but not themselves tracked there use the task list incidental
pattern: `tasks-[name].md (incidental during <context>)`.

### Standalone anchor — `standalone`

Used when no active WU exists. The anchor itself declares the off-WU semantic; the parenthetical
describes the kind of work.

- `Context: standalone (maintenance)` — emergent maintenance
- `Context: standalone (planning)` — queue-shaping (ROADMAP / BACKLOG-INBOX edits)
- `Context: standalone (documentation)` — emergent documentation
- `Context: standalone (refactor)` — emergent refactor

**Off-WU `(planning)` vs. file-pointer `(planning)`.** Off-WU `(planning)` is queue-shaping work
that organizes future work without iterating a specific spec (ROADMAP, BACKLOG-INBOX edits).
File-pointer `(planning)` — e.g., `tasks-[name].md (planning)` or `plan-[name].md (planning)` — is
spec iteration on an active artifact.

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
