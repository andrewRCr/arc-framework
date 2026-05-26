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
- **Next Task:** Task 4.1 — Concurrent-push reconcile (`git notes merge`) (line ~461)
- **Blockers:** [none]

- **Next Action:** Begin Task 4.1 impl — the deferred pre-impl audit + the cohort/downstream forward-compat
  cross-check are complete and folded into tasks/notes (see `notes-worktree-foundation.md` § Phase 4
  forward-compat cross-check). Land 4.1 in `lib/user-sync/` + `push-fetch.ts` via `runPairedPush`'s `pushNotes`
  seam; heed 4.1.b's cat_sort_uniq same-commit corruption gotcha (post-merge validity check, not git's signal).

---
