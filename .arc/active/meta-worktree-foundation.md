# Metadata: Worktree Foundation

- **State:** Active
- **Owner:** andrew
- **Branch:** feat/worktree-foundation

- **Origin:** [internal]
- **Design:** `spec-worktree-foundation.md`

- **Depends On:** work-organization-reform
- **Cohort:** agile-parallelism

- **Task List:** tasks-worktree-foundation.md
- **Last Completed:** Task 3.2 — Per-WU subdir load: note resolution + materialization scoped to the current WU
  (3.1's path classifier consumed via `wuNameOfPath`; WU-name derived at the handlers, threaded through
  load/pull/sync). Task 3.1 (path-driven sync-class classifier) also shipped this session.
- **Next Task:** Task 3.3 — Cross-WU file merge (per-file entry list-union) (line ~372)
- **Blockers:** [none]

- **Next Action:** Begin Task 3.3 (`lib/user-sync/parser.ts`, `…/merge.ts`, `…/notes-ref.ts`) — per-file entry
  list-union across the N most-recent notes, deduped by entry identity; per `3_process-task-loop.md`. Phase 3
  design is settled (`b638826e`) — follow the task text, no re-audit. Cross-WU load currently rides the single
  resolved note (3.2); 3.3 swaps it to the ref-wide N-note merge.

---
