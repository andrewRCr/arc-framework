# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 5.0.e — Session-init workflow rewrite — Step
  2/3/7/8 (line ~3646)
- **Last Completed:** Task 5.0.d — `runUserStatus` orchestrates the
  worktree probe in parallel with the existing notes/disk probes
  when `session.remote_sync` is enabled and `--offline` is not set;
  qualifier appended to `UserStatusResult.detailLines` and surfaced
  as a peer `worktree` field on the JSON result. Shared pure helper
  `formatWorktreeQualifierLine` exported from
  `commands/user/sync-status.ts` and re-exported through
  `commands/user.ts`. `arc sync` reads the same config gate, runs
  `runWorktreeSyncStatus` alongside `inspectUserSyncState` via
  `Promise.all`, and emits the qualifier as `p.log.info` before
  action dispatch — single source of truth for vocabulary across
  both surfaces. Offline branch emits the skip note only when remote
  sync is wired (distinguishes opt-out from feature off);
  `remote-unavailable` carries through to a softer "comparison
  unavailable" qualifier rather than silencing. No new headline
  values; qualifier is purely additive detail. Test-first batched
  in a single round (9 behaviors — orchestration concerns over a
  single function plus its handler-side parity, per process-task-
  loop batching judgment). Tier 1 gates clean (lint:ts, typecheck
  src+test, 876/876 unit, full `npm test` 46/46, `npm run build`,
  live `npx arc user status` / `--offline` / `--json` smoke test
  confirmed shape and rendering).
- **Blockers:** none
- **Next Action:** Begin Task 5.0.e — rewrite session-init.md
  (both copies — package source + `.arc/`) so the workflow consumes
  the new `worktree` envelope slot. Step 2 envelope table documents
  the new field; Step 3 widens to handle both channels with combined
  prompt logic, worktree-first ordering, dirty-tree porcelain
  guard, and divergence non-blocking handling; Step 7 orientation
  format adds a top-level `Reconcile required:` section template
  and a one-line `local-ahead` informational treatment; Step 8
  trust hierarchy gains a diverged-worktree mismatch example. No
  auto-stash, no `--autostash`. Two-copy sync per package-project
  discipline. Test spec at line ~3646.
