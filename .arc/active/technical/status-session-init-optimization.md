# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 5.0.b — Config schema + types for init_pull channels
  (line ~3527)
- **Last Completed:** Task 5.0.a — `runWorktreeSyncStatus` probe at
  `lib/git/worktree-sync.ts` plus 10-behavior unit suite at
  `__tests__/unit/git/worktree-sync.test.ts`. Result shape
  `{state, ahead, behind, failureReason?}` over 9-state enum
  (`skipped | clean | remote-ahead | local-ahead | diverged |
  no-upstream | detached-head | no-remote | remote-unavailable`).
  `failureReason: "timeout" | "error"` distinguishes fetch failure
  modes inside `remote-unavailable` — added during implementation
  to satisfy "distinguishing detail" cleanly. `GitExec` extended
  with optional `GitExecOptions { signal?: AbortSignal }`;
  `gitExec` runtime forwards to `execFileAsync`. Backward-compatible
  (TS function-type variance). `DEFAULT_FETCH_TIMEOUT_MS = 3000`.
  Probe sequence: detached-head → upstream → origin → bounded fetch
  → ahead/behind count → classify. Test-first batched in 4 rounds
  (rationale recorded on the task entry). Tier 1 gates clean
  (lint:ts, typecheck src+test, 840/840 unit, md lint).
- **Blockers:** none
- **Next Action:** Begin Task 5.0.b — config schema + types for
  init_pull channels. Flat dotted keys
  `session.init_pull.worktree` / `session.init_pull.notes`,
  values `manual | prompt | always` (`always` rejected for worktree
  at parse). Defaults `prompt`. Touch points: `DEFAULTS` in
  `lib/config/status-reader.ts`, `ConfigSettings` in
  `commands/config/types.ts`, `ConfigSessionInitSettings` +
  `SESSION_INIT_KEYS` in `commands/config/status.ts`, plus
  `validate-config.sh` enum entries (with opportunistic
  `session.remote_sync` backfill). Two-copy `arc-config.yml`
  edit (keys + inline comments). Test-first per task spec at
  line ~3527.
