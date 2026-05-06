# Status: User Sync UX Polish

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/user-sync-ux

- **Spec:** `prd-user-sync-ux.md`
- **Task List:** `tasks-user-sync-ux.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Task 2.R.6.a — Code-path audit + audit-surfaced fixes (parent cascade-closed;
  .a.1 surveyed 25 files across handlers, `commands/user/*`, `lib/git/*`, and `lib/sync-*` against
  the seven 2.R remediation invariants and populated the findings matrix in `notes-user-sync-ux.md`;
  .a.2 fixed stdout contamination + missing-on-error JSON envelope in `arc user status --json`
  via `emitStatusError` + `createSyncOutput(json)` threading + new `NOT_IN_ARC_PROJECT` error code;
  .a.3 hoisted `createSyncOutput` once in `handlePushDirection` and routed the `resolveSyncPushPolicy`
  warn callback through it for forward-compat once any caller gains `--json`)
- **Next Task:** Task 2.R.6.b — Test-surface audit + residual risk (line ~609)
- **Blockers:** [none]

- **Next Action:** Begin Task 2.R.6.b — verify unit/integration/e2e coverage maps to every Phase
  2.R remediation invariant with at least one real-git cross-clone path; produce a checklist
  confirming no undocumented sync regressions remain; record any genuinely intentional residuals
  in `notes-user-sync-ux.md` (the three already pre-populated there are starting points, not the
  full set).

---
