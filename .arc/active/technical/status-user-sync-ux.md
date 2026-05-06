# Status: User Sync UX Polish

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/user-sync-ux

- **Spec:** `prd-user-sync-ux.md`
- **Task List:** `tasks-user-sync-ux.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Task 2.R.6.d — Unify spinner-routing helper (one canonical
  `runWithSpinner` consuming `output: SyncOutput`; deleted `runRoutedSpinner` twin in
  `push-recovery.ts`; 8 call sites threaded; F2 expansion migrated inline `p.spinner()` in
  `handleUserLoad`/`handleUserPull` to `output.spinner()` directly; `SyncOutput` hoisted per
  handler entry; non-spinner clack consumers in those handlers stay raw, deferred until a
  command actually needs `--json`)
- **Next Task:** Task 2.R.6.e — Load-side verification symmetry (line ~675)
- **Blockers:** [none]

- **Next Action:** Begin Task 2.R.6.e — add a postcondition check to `runUserLoad` symmetric
  to 2.R.1.a's save-side verification: re-read materialized user-dir contents and compare
  readback hash against the manifest hash from `deserialize` before `writeLocalSyncState`
  advances; on mismatch, throw `UserLoadVerificationError` and leave sync-state unchanged.
  Test-first per the task's behavior list (missing files → throw; content mismatch → throw;
  match → succeed with `verifiedAt`); existing happy-path real-git integration test in
  `integration/user.test.ts` continues to pass.

---
