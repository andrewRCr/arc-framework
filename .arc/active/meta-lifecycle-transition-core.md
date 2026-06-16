# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Task 6.4 — in-place (`--here`) opt-out for `graduate` + `resume`, with all placement
  (spawn / in-place; create / attach) consolidated onto the `reconcile-worktree` leg (Option B)
- **Next Task:** `Task 6.5.a — Executor Branch-field encoding write (line ~581)`
- **Blockers:** [none]

- **Next Action:** Start Task 6.5 (executor owns the meta `Branch`-field encoding) — `test-first` on 6.5.a, then
  6.5.b/c. Re-point is now Task 6.6, park/resume 6.7; PPR folded into the cohort as the fast follow-up. See
  SESSION-NOTES for the boundary rationale + the deferred `Current Workflow` / `Design`-event-pointer design.

---
