# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 5.0.f — Integration and E2E test coverage (line ~3693)
- **Last Completed:** Tasks 5.0.e + 5.0.g shipped as one cohesive
  commit — dual-channel pull surface delivered end-to-end to its
  consumers. 5.0.e: `session-init.md` (both copies) consumes the
  worktree envelope slot; Step 2 envelope table documents the new
  `worktree` field, Step 3 renamed to "Conditional Sync Pulls" with
  channel-keyed bullets + dirty-tree precheck + combined-prompt
  logic (worktree pulls first, notes envelope re-evaluated after),
  Step 7 conditional `Reconcile required:` / `Local-ahead:` template
  inserts above `Active work state:`, Step 8 Tier 1 diverged-worktree
  example. Streamlining pass cut initial +50 net lines to +39 with
  no operational loss. 5.0.g: ADR-012 amendment (2026-04-25)
  distinguishes worktree from notes channel and rationalizes the
  `always`-mode rejection on worktree; `arc-config.yml` (both copies)
  carries one-line cross-references to session-init.md on each
  channel block; `arc user status` CLI help describes the worktree-
  drift qualifier and `--offline` parity; release-notes-style
  writeup routed to `plan-docs-content-sweep.md` § Content
  Contributions #7 (no in-repo release notes). Tier 2 gates clean
  (markdown lint 223 files; lint:ts; typecheck src+test; unit
  876/876; full `npm test` 46/46; `npm run build`; CLI help smoke
  test).
- **Blockers:** none
- **Next Action:** Begin Task 5.0.f — integration and E2E test
  coverage for the dual-channel pull surface. ~22 scenarios across
  temp-dir git fixtures (envelope shape verification, mode handling,
  dirty-tree cases, no-upstream/detached-head/no-remote/remote-
  unavailable degraded states, sync-direction reporting). Discovery
  risk if fixture construction surfaces gaps in 5.0.a–d behavior;
  recommended as synchronous work rather than deferred review. Task
  spec at line ~3693.
