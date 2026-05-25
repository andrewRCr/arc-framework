# Metadata: Worktree Foundation

- **State:** Active
- **Owner:** andrew
- **Branch:** feat/worktree-foundation

- **Origin:** [internal]
- **Design:** `spec-worktree-foundation.md`

- **Depends On:** work-organization-reform
- **Cohort:** agile-parallelism

- **Task List:** tasks-worktree-foundation.md
- **Last Completed:** Task 2.6 — Dual-axis Step 7 trust refactor (single trust hierarchy → truth-of-work-state +
  which-work-am-I-picking-up axes; notes out of the roster axis). Task 2.5 (branch-gone recovery relocated to a
  Step-2 gating action ahead of sync/load — Option C) also landed this session.
- **Next Task:** Task 2.7 — Stale-worktree sweep at main-worktree session-init (line ~265)
- **Blockers:** [none]

- **Next Action:** Begin Task 2.7 per `3_process-task-loop.md` — main-worktree stale-worktree sweep: cross-ref
  `git worktree list` against `completed/` (reuse `parseWorktreeList`, normalize the WU-name match key);
  marker-gated surfacing + workflow doc, test-first. First Phase-2 task touching TS.

---
