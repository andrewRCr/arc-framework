# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Task 5.3 — Planning-entry write-context gate: `classifyPlanningEntry` (two-layer, mode-shaped
  committability) over the branch-vs-base core, the `arc plan check` CLI surface, and `draft-design` wiring
- **Next Task:** `Task 5.4 — Wire the executor binder's reconcile-status-user to the real local render (line ~365)`
- **Blockers:** [none]

- **Next Action:** Start Task 5.4 — extract the `arc status --user` local render into a shared helper, then wire the
  binder's `reconcile-status-user` to it (replaces 5.1's interim advisory). New Phase 5.R (verb command surface)
  now precedes Phase 6.

---
