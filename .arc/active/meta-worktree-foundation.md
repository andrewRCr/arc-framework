# Metadata: Worktree Foundation

- **State:** Active
- **Owner:** andrew
- **Branch:** feat/worktree-foundation

- **Origin:** [internal]
- **Design:** `spec-worktree-foundation.md`

- **Depends On:** work-organization-reform
- **Cohort:** agile-parallelism

- **Task List:** tasks-worktree-foundation.md
- **Last Completed:** Task 2.1 — Worktree-identity detection: new `worktree-identity.ts` lib + a dedicated
  `worktreeIdentity` probe slot folded onto the worktree envelope value, plus the orientation surface.
- **Next Task:** Task 2.2 — `branch-gone` probe state (split from `remote-unavailable`) (line ~143)
- **Blockers:** [none]

- **Next Action:** Begin Task 2.2 per `3_process-task-loop.md`. Land 2.2a (branch-gone fetch classification)
  and 2.2b (exhaustive-switch updates) together in one green build — `inferWorktree` and state tables are exhaustive.

---
