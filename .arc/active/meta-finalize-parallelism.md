# Metadata: finalize-parallelism

| **State** | **Owner** | **Branch**                  | **Class** | **Priority** |
| --------- | --------- | --------------------------- | --------- | ------------ |
| `Active`  | `andrew`  | `feat/finalize-parallelism` | `Heavy`   | `P1`         |

- **Cohort:** `agile-parallelism`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-finalize-parallelism.md`
- **Task List:** `tasks-finalize-parallelism.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 6.3 — wave-4 cross-machine resume verified (spawn materialize + notes convergence +
  live notes-lag detector); Phase 6 closes all four burn-in waves. Evidence in `notes-finalize-parallelism.md`
  § Wave-4 induction evidence.
- **Next Task:** Task 7.1 — [BLOCKING] Move identity-global user-surface migration out of the path resolver
  (line ~878)
- **Blockers:** [none]

- **Next Action:** Begin Task 7.1 [BLOCKING] — relocate the migration write out of `resolveUserSurfaceResolver`
  so read-only command paths can't throw on a divergent flat file. Phase 7 seams are populated + audited (7.1–7.6
  ready; 7.3 is a disposition call, not straight impl).

- **PR URL:** [none]
- **Completed:** [none]

---
