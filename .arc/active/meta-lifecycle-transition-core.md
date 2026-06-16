# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Phase 6.6 complete — all lifecycle ceremonies re-pointed to the executor verbs. This session
  closed 6.6.g (deactivate Case A-delete → `arc abandon`) and 6.6.h (cohort-aware `promote`/`demote` + the
  `graduate-work-unit` re-point that dropped its inline cohort-nested `git mv`).
- **Next Task:** `Task 6.7.a — reconcile-worktree spawn-path re-attach (line ~752)`
- **Blockers:** [none]

- **Next Action:** Start Phase 6.7 (park/resume ceremony workflows) at Task 6.7.a — mirror the in-place
  `createBranch` flag onto the fresh-worktree spawn variant so resume re-attaches an existing branch (`git worktree
  add <path> <branch>`, no `-b`) instead of force-creating; test-first. Then 6.7.b (park@Active cross-branch
  run-context), 6.7.c/d (park/resume ceremonies — author to the re-point convention), 6.7.e (round-trip coverage).

---
