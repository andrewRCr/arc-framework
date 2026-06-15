# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Task 5.1 — `start` full lifecycle-state dispatch: the dispatch core (`resolveStartDispatch`)
  plus the first production executor binder (`buildExecutorContext`, in `lib/work-unit/executor-context.ts`);
  create-new/cold-start recomposed on the bundle legs with the coarse `spawnWorktree` retired;
  `reconcile-status-user` ships an interim advisory (real local render carved out as the new Task 5.4)
- **Next Task:** `Task 5.3 — Planning-entry write-context gate in arc-plan (line ~337)`
- **Blockers:** [none]

- **Next Action:** Begin Task 5.3 — but first settle `spec-lifecycle-transition-core.md` §11's route structure
  (keep 3 routes vs collapse to 2; see `SESSION-NOTES`), reshaped by today's adopt-edge retirement, before 5.3.b
  implements against it. Then implement 5.3.a/b/c grounded against `lib/git/write-context.ts`.

---
