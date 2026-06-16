# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Task 6.5.a — executor projects the meta `Branch` field on every branch-affecting edge
  (`applyBranchField` / `setMetaBranch`, sourced from the branch-affecting leg; park@Active a deliberate no-write)
- **Next Task:** `Task 6.5.b — Soft-field disposition audit (line ~588)`
- **Blockers:** [none]

- **Next Action:** Continue Task 6.5 — 6.5.b (audit each edge's `nextTask` / `nextAction` disposition for stale
  guidance), then 6.5.c (extend encoding-consistency to assert the `Branch` _field_ via `branchFieldWritten` /
  `establishedBranch` — the table-walk hook, not a transition runner). Phase-6 remainder realigned to the shipped
  surface this session (6.6.a/d, new 6.6.e `graduate-work-unit`→`promote`, 6.7.b). See SESSION-NOTES.

---
