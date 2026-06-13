---
name: commit-footer
description: Context footer naming the deepest spec-shaped artifact in the WU chain, or the `standalone` / `integration` off-WU anchors
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

`meta-{name}` (lifecycle / maintenance) → `draft-{name}` / `spec-{name}` (Spec) → `tasks-{name}`
(execution spec)

Walk down from `meta-*` to the most specific artifact this commit edits. Ceremony and maintenance
commits name the meta file; planning iteration names the plan/PRD; task-execution commits name the
task list. When no active WU exists, the chain collapses to the `standalone` anchor (see
§ Standalone anchor).

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

### Draft-doc / spec references — `draft-[name].md` or `spec-[name].md`

Used during planning sessions when iterating a spec-shaped artifact. `draft-*` covers
pre-PRD planning artifacts; `spec-*` covers post-PRD-generation iteration on the formalized
spec (e.g., requirement amendments or scope clarification surfaced during pre-implementation
audit). Both take the same parentheticals.

- `Context: draft-[name].md (planning)` — plan iteration
- `Context: draft-[name].md (code review)` — review-driven changes to the plan
- `Context: spec-[name].md (planning)` — PRD iteration
- `Context: spec-[name].md (code review)` — review-driven changes to the PRD

### Meta-file references — `meta-[name].md`

Used for WU lifecycle ceremonies (which edit the meta file) and for off-ceremony meta edits.

- `Context: meta-[name].md (handoff)` — meta-file rotation at session boundary (dedicated
  `chore(arc):` commit per [DEV-RULES.ARC][dev-rules-arc] § Commit Discipline)
- `Context: meta-[name].md (graduation)` — backlog `provisional → planned` readiness-ladder promotion
- `Context: meta-[name].md (activation)` — backlog → active transition
- `Context: meta-[name].md (integration)` — integration prep (completion doc, cleanup, reference
  fixes; not review-driven fixes — see `(code review)` on `tasks-`/`plan-`)
- `Context: meta-[name].md (archival)` — active → archive transition
- `Context: meta-[name].md (deactivation)` — active → backlog rotation
- `Context: meta-[name].md (maintenance)` — off-ceremony meta edits (review-driven or otherwise)
- `Context: meta-[name].md (incidental during <context>)` — incidental fix folded into a
  ceremony or maintenance commit

### Standalone anchor — `standalone`

Used when no active WU exists. The anchor itself declares the off-WU semantic; the parenthetical
describes the kind of work.

- `Context: standalone (maintenance)` — emergent maintenance
- `Context: standalone (planning)` — queue-shaping (ROADMAP / ATOMIC-INBOX edits)
- `Context: standalone (documentation)` — emergent documentation
- `Context: standalone (refactor)` — emergent refactor

**Off-WU `(planning)` vs. file-pointer `(planning)`.** Off-WU `(planning)` is queue-shaping work
that organizes future work without iterating a specific spec (ROADMAP, ATOMIC-INBOX edits).
File-pointer `(planning)` — e.g., `tasks-[name].md (planning)` or `draft-[name].md (planning)` — is
spec iteration on an active artifact.

### Integration anchor — `integration`

Used for a **single-parent integration-ceremony commit with no active WU chain to name** — a squash-merge
result or a post-merge cleanup / archival move performed outside an attended ceremony, where the two-parent
merge provenance (the `MERGE_HEAD` exemption) doesn't apply. The anchor marks the commit as integration-ceremony
work; the parenthetical describes the action.

- `Context: integration (squash-merge cleanup)`
- `Context: integration (post-merge archival move)`

The parenthetical is freeform — describe the integration-ceremony action.

**Distinct from both neighbours.** `meta-[name].md (integration)` names integration prep **within** an active WU
chain (the meta file is still under edit); the generic `standalone (...)` anchor covers off-WU work that is **not**
an integration ceremony. Reach for `integration (...)` only when the commit finalizes a merge with no WU chain to
point at.

**Emission.** A completion path that lands a merge no attended ceremony owns — finalizing it from base context, or
on the unattended auto-merge lane — emits this anchor on the single-parent commits it produces (cleanup, branch
reap, archival move). When an active WU chain still applies, the in-chain marker (`meta-[name].md (integration)`)
is named instead.

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
[dev-rules-arc]: ../../system/rules/DEV-RULES.ARC.md
