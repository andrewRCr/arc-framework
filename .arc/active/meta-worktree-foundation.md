# Metadata: Worktree Foundation

- **State:** Active
- **Owner:** andrew
- **Branch:** feat/worktree-foundation

- **Origin:** [internal]
- **Design:** `spec-worktree-foundation.md`

- **Depends On:** work-organization-reform
- **Cohort:** agile-parallelism

- **Task List:** tasks-worktree-foundation.md
- **Last Completed:** Task 3.4 — Tombstones for cross-WU deletions (Phase 3 complete): 3.4.a save-side write
  (`appendRemovalTombstones`, wired into `runUserSave`), 3.4.b merge honors them via recency resolution +
  carry-forward + fixed-TTL GC (`lib/user-sync/merge.ts`).
- **Next Task:** Task 4.1 — Concurrent-push reconcile (`git notes merge`) (line ~454)
- **Blockers:** [none]

- **Next Action:** Begin Task 4.1 (`paired-push.ts` / `push-fetch.ts`) — at the notes-push leg of
  `runPairedPush`, reconcile a non-fast-forward via fetch + `git notes merge` (cat_sort_uniq), surfacing only
  non-trivial conflicts. Test-first per `3_process-task-loop.md`; Phase 4 design settled (see Phase 4 preamble).

---
