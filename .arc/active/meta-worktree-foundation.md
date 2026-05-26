# Metadata: Worktree Foundation

- **State:** Active
- **Owner:** andrew
- **Branch:** feat/worktree-foundation

- **Origin:** [internal]
- **Design:** `spec-worktree-foundation.md`

- **Depends On:** work-organization-reform
- **Cohort:** agile-parallelism

- **Task List:** tasks-worktree-foundation.md
- **Last Completed:** Task 4.1 — Concurrent-push reconcile (`git notes merge`): 4.1.a lossless auto-reconcile
  (retired `pushWithInteractiveRecovery`, wired `pushNotesWithReconcile` into all four notes-push sites), 4.1.b
  non-trivial-conflict surfacing (post-merge validity scan + pre-merge-tip rollback + `conflict` outcome).
- **Next Task:** Task 4.2 — Retired-subdir reconciliation (line ~493)
- **Blockers:** [none]

- **Next Action:** Begin Task 4.2 — reconcile retired-WU subdirs. Consume the shipped predicate
  `readShippedWorkUnits` / `isShippedWorkUnit` (`lib/work-unit/completed-index.ts`; bare-slug check, don't
  rebuild); wire reconcile = shipped-check + `removeStaleUserWuSubdir` + `.internal/` backup. See
  `notes-worktree-foundation.md` § Phases 3 & 4 + § Phase 4 forward-compat cross-check.

---
