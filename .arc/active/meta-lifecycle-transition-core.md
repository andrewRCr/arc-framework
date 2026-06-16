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
- **Next Task:** `Task 6.5.a — init-work-unit Path A → call the graduate transition (line ~573)`
- **Blockers:** [none]

- **Next Action:** Start Task 6.5.a (re-point existing ceremonies to the executor). Phase 6 also gained Task 6.6
  (park/resume ceremony recovery) — sequenced after 6.5; pull 6.6.a (the spawn-resume `add -b <existing>` bug)
  forward if preferred. See SESSION-NOTES for the Option B rationale + the 6.6 scope decision.

---
