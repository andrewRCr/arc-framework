# Status: User Sync UX Polish

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/user-sync-ux

- **Spec:** `prd-user-sync-ux.md`
- **Task List:** `tasks-user-sync-ux.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Task 2.R.2.d.3 — stdout purity under `--json`
- **Next Task:** Task 2.R.2.d.4 — Error-path envelope coverage (line ~433)
- **Blockers:** [none]

- **Next Action:** Begin Task 2.R.2.d.4 — convert the `resolveUserIdentity` and
  `requireArcProjectRoot` early returns in `handleSync` from silent exit-0 to a
  `{ cell: "none", reason: "identity-absent" | "no-arc-project" }` envelope with
  `process.exitCode > 0`; add contract tests for both paths.

---
