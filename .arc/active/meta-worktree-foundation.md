# Metadata: Worktree Foundation

- **State:** Active
- **Owner:** andrew
- **Branch:** feat/worktree-foundation

- **Origin:** [internal]
- **Design:** `spec-worktree-foundation.md`

- **Depends On:** work-organization-reform
- **Cohort:** agile-parallelism

- **Task List:** tasks-worktree-foundation.md
- **Last Completed:** Task 1.3 — Worktree-ownership marker primitive: write/read lib (`worktree-marker.ts`),
  managed-gitignore registration (init/reconfigure/update/join), and the single cleanup-gating fn
  `decideWorktreeCleanup` + real `isBranchMerged` (`worktree-cleanup.ts`). Phase 1 complete.
- **Next Task:** Task 2.1 — Worktree-identity detection in the probe (line ~122)
- **Blockers:** [none]

- **Next Action:** Begin Phase 2, Task 2.1 per `3_process-task-loop.md`. Phase 2 note: land 2.2a (branch-gone
  fetch classification) + 2.2b (exhaustive-switch updates) together in one green build.

---
