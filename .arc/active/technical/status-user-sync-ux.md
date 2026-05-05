# Status: User Sync UX Polish

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/user-sync-ux

- **Spec:** `prd-user-sync-ux.md`
- **Task List:** `tasks-user-sync-ux.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Task 2.R.4.a — Disk-vs-note direction inference via `sourceCommit` ancestry
  (added `"behind"` direction; folded in v1 `LocalSyncState` read-path retirement)
- **Next Task:** Task 2.R.4.b — Action-oriented status default with `--verbose` three-tier truth (line ~522)
- **Blockers:** [none]

- **Next Action:** Begin Task 2.R.4.b — collapse `arc user status` default output to a single
  direction-aware sentence consuming the 2.R.4.a signal, with three-tier ref/disk/working-files
  detail moved behind `--verbose` and preserved verbatim in `--json`. Files:
  `packages/arc-framework/src/commands/user/sync-status.ts` (`buildUserStatusResult`,
  `renderHeadlineExplanation`, `renderWorkingFilesLine`) and `format.ts` (status summary).

---
