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
- **Next Task:** `Task 5.2 — start --from <draft> adopt edge (line ~326)`
- **Blockers:** [none]

- **Next Action:** Begin Task 5.2 — `start --from <draft>` adopt edge: a pre-authored draft with no branch is
  adopted into a WU (cut `plan/<name>`, relocate the draft into `active/`), reusing the existing `--from`
  resolution, per `tasks-lifecycle-transition-core.md`.

---
