# Metadata: async-merge-lifecycle

| **State**  | **Owner** | **Branch**                   | **Class** | **Priority** |
| ---------- | --------- | ---------------------------- | --------- | ------------ |
| `Active`   | `andrew`  | `feat/async-merge-lifecycle` | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** `concurrent-work-doctrine`, `merge-safety-mechanism`, `notes-merge-coherence`

- **Origin:** [internal]
- **Design:** `spec-async-merge-lifecycle.md`
- **Task List:** `tasks-async-merge-lifecycle.md`

- **Last Completed:** Task 2.3 — orientation routes in `session-init.md`; closes Phase 2 (the WU
  completion-sweep surface is now end-to-end: network-free presence tier, `gh`-gated sharpening, config-gated
  staleness, advisory orientation across the roster-resolved arms).
- **Next Task:** Task 3.1 — Re-entry guard + re-runnable tail steps (line ~147)
- **Blockers:** [none]

- **Next Action:** Begin Task 3.1 — add the `Integrating` re-entry guard to `integrate-work-unit.md` Step 1
  (skip the transition + already-run pre-PR/PR-open steps; resolve the resume point from PR + worktree state) and
  make the merge → `arc user close` → teardown tail individually re-runnable. Both copies. Run via
  `process-task-loop.md`.

---
