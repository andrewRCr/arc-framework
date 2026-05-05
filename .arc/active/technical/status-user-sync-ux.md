# Status: User Sync UX Polish

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/user-sync-ux

- **Spec:** `prd-user-sync-ux.md`
- **Task List:** `tasks-user-sync-ux.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Task 2.R.3.c.2 — CI ordering / built artifact precondition (project-wide
  prebuild guard via shared `__tests__/helpers/cli-spawn.ts`; cascades close 2.R.3.c subprocess
  purity tests and 2.R.3 regression coverage)
- **Next Task:** Task 2.R.4.a — Disk-vs-note direction inference via `sourceCommit` ancestry (line ~500)
- **Blockers:** [none]

- **Next Action:** Begin Task 2.R.4.a — RED for first behavior: note descendant of `sourceCommit`
  + disk hash matches materialized → `direction: "behind"`, action recommends `arc user load`.
  File: `packages/arc-framework/src/commands/user/sync-status.ts` (`inspectDiskVsLocalSnapshot`
  + `determineUserStatusAction`).

---
