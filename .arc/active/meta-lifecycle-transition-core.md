# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Phase 6.7 underway — 6.7.a (resume's fresh-worktree spawn re-attaches an existing preserved
  branch via a bare `git worktree add`, `createBranch` flag) and 6.7.b (park@Active cross-branch run-context settled
  **handler-enforced**: `arc park` requires a base-branch context for the Active arm; the pointer-record renders
  fresh on the tracked branch and `park@Active`/`resume`/`start@parked` drop the `relocate-artifacts` leg — the
  artifacts ride the preserved branch; branch/tracked-home awareness stays in the projection layer).
- **Next Task:** `Task 6.7.c — park-work-unit.md ceremony (thin v1) (line ~766)`
- **Blockers:** [none]

- **Next Action:** Author Task 6.7.c — the `park-work-unit.md` thin-v1 ceremony: judgment (`--reason` /
  commitment), the handler-enforced base run-context (6.7.b), and teardown — reusing `decomposition-machinery`'s
  single-source `active/ → backlog/` and teardown blocks (don't re-author); call `arc park` (the executor/verb owns
  relocate-vs-fresh-render, branch-preserve, pointer-record). Markdown + wiring (not test-first). Then 6.7.d
  (`resume-work-unit.md`) and 6.7.e (park→resume round-trip integration coverage, both placement modes).

---
