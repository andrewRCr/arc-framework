# Metadata: Worktree Foundation

- **State:** Active
- **Owner:** andrew
- **Branch:** feat/worktree-foundation

- **Origin:** [internal]
- **Design:** `spec-worktree-foundation.md`

- **Depends On:** work-organization-reform
- **Cohort:** agile-parallelism

- **Task List:** tasks-worktree-foundation.md
- **Last Completed:** Task 3.3 — Cross-WU file merge (per-file entry list-union); all three subtasks shipped —
  3.3.a parser + list-union/dedupe (`lib/user-sync/{parser,merge,types}.ts`), 3.3.b ref-wide N-most-recent-note
  reader (`notes-ref.ts`), 3.3.c wired into `runUserLoad` (cross-WU merges across the note window; per-WU subdir
  stays on the single resolved note).
- **Next Task:** Task 3.4 — Tombstones for cross-WU deletions (line ~416)
- **Blockers:** [none]

- **Next Action:** Begin Task 3.4 (`lib/user-sync/merge.ts`) — `arc user save` writes a timestamped
  `## Removed: {name}` tombstone when a cross-WU entry is present-before / absent-now (reuse 3.3.b's N-note merge
  for the prior state); the merge honors the latest tombstone with a fixed-TTL filter-at-merge GC. Test-first per
  `3_process-task-loop.md`; Phase 3 design settled (`b638826e`), no re-audit.

---
