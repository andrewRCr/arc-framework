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
>   the commit's work serves along the work-unit chain, or the `standalone` anchor when no active WU exists.
>   Format must be grep-searchable across commit history.
> - **Related:** [commit-format](commit-format.md) — both govern the commit message structure

## commit-footer.override

[No override configured]

## commit-footer.default

`Context:` footer naming the artifact this commit's work serves. Place it in the message's final Git trailer block; if that
block contains more than one `Context:` trailer, the last occurrence governs.

**Chain naming.** The footer names the deepest spec-shaped artifact along the WU chain that the commit's work
serves. The artifacts themselves are ARC state, saved rather than committed:

`meta-{name}` (lifecycle) → `draft-{name}` / `spec-{name}` (Spec) → `tasks-{name}` (execution spec)

Walk down from `meta-*` to the most specific artifact this commit's work serves. Ceremony commits name the meta
file; planning commits name the plan/PRD; task-execution commits name the task list. When no active WU exists, the
chain collapses to the `standalone` anchor (see § Standalone anchor).

**Discreteness test (incidental in-WU vs. standalone off-WU).** Active WU? Yes → in-chain
file-pointer with `(incidental during X)`. No → `standalone (...)`. Single binary check.

### Task-list references — `tasks-[name].md`

Used when the commit carries a task's work.

- `Context: tasks-[name].md (Task X.Y)` — single task
- `Context: tasks-[name].md (Tasks X.Y-X.Z)` — range
- `Context: tasks-[name].md (Tasks X.Y, A.B)` — non-contiguous
- `Context: tasks-[name].md (incidental during <context>)` — incidental fix folded in
- `Context: tasks-[name].md (code review)` — review-driven changes to task-listed work

### Draft-doc / spec references — `draft-[name].md` or `spec-[name].md`

Used during planning when a commit carries tracked files a spec-shaped artifact's iteration
produces, such as an accepted ADR or moved research; the artifact's own text is saved, not
committed. `draft-*` covers pre-PRD planning; `spec-*` covers iteration on the formalized spec
(e.g., requirement amendments or scope clarification surfaced during pre-implementation audit).
Both take the same parentheticals.

- `Context: draft-[name].md (planning)` — plan iteration
- `Context: draft-[name].md (code review)` — review-driven changes to the plan
- `Context: spec-[name].md (planning)` — PRD iteration
- `Context: spec-[name].md (code review)` — review-driven changes to the PRD

### Meta-file references — `meta-[name].md`

Used for a WU lifecycle ceremony's commit, which carries only the tracked files the ceremony
changes; the meta and the WU's other records are saved, not committed.

- `Context: meta-[name].md (prepublication)` — Candidate preparation before the first public push, such as the
  review copy's commit (not finding-driven fixes — see `(code review)` on `tasks-`/`draft-`/`spec-`)
- `Context: meta-[name].md (integration)` — public integration ceremony (cleanup, reconcile, reference fixes; not
  finding-driven fixes)
- `Context: meta-[name].md (incidental during <context>)` — incidental fix folded into a
  ceremony commit

### Standalone anchor — `standalone`

Used when no active WU exists. The anchor itself declares the off-WU semantic; the parenthetical
describes the kind of work.

- `Context: standalone (maintenance)` — emergent maintenance
- `Context: standalone (documentation)` — emergent documentation
- `Context: standalone (refactor)` — emergent refactor
- `Context: standalone (code review)` — review-driven changes to off-WU work

### Integration anchor — `integration`

Used for a **single-parent integration-ceremony commit with no active WU chain to name** — a squash-merge
result or a post-merge cleanup performed outside an attended ceremony, where the two-parent merge provenance
(the `MERGE_HEAD` exemption) doesn't apply. The anchor marks the commit as integration-ceremony
work; the parenthetical describes the action.

- `Context: integration (squash-merge cleanup)`

The parenthetical is freeform — describe the integration-ceremony action.

**Distinct from both neighbours.** `meta-[name].md (integration)` names integration prep **within** an active WU
chain (the WU is still active); the generic `standalone (...)` anchor covers off-WU work that is **not**
an integration ceremony. Reach for `integration (...)` only when the commit finalizes a merge with no WU chain to
point at.

**Emission.** A completion path that lands a merge no attended ceremony owns — finalizing it from base context —
emits this anchor on the single-parent commits it produces (cleanup, branch reap). When an active WU chain still
applies, the in-chain marker (`meta-[name].md (integration)`) is named instead.

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
