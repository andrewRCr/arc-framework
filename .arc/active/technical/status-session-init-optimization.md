# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 5.0.a — Worktree sync state inspection (probe)
  (line ~3500)
- **Last Completed:** Task 5.0 pre-implementation audit and spec
  refinements. Pinned probe location at `lib/git/worktree-sync.ts`
  (forward-compat with plan-user-sync-ux notes-spine unification —
  worktree stays a parallel channel, not part of the spine). Flat
  dotted config keys `session.init_pull.worktree` /
  `session.init_pull.notes` (parser-compatible with both
  `lib/config/index.ts` and `arc-lib.sh`; matches every existing key).
  5.0.b touch points enumerated (`DEFAULTS`, `ConfigSettings`,
  `ConfigSessionInitSettings`, `SESSION_INIT_KEYS`) + shell-side
  `validate-config.sh` enum coverage added to behavior list (with
  opportunistic `session.remote_sync` backfill). 5.0.g ADR scope
  corrected — ADR-012 lives in `.arc/` only; package source has no
  ADR copies. Migration-awareness note in 5.0.g inline-comment
  guidance: `session.init_pull.notes` may migrate when the gate-model
  frame (plan-session-operational-flow Phase 6) consolidates
  session-bootstrap config; keep comment terse so a future rename is
  a one-line edit. Three fix-before-starting items resolved before
  kickoff.
- **Blockers:** none
- **Next Action:** Begin Task 5.0.a — worktree sync state inspection
  probe at `lib/git/worktree-sync.ts`. Pure-read probe returning
  `clean | remote-ahead | local-ahead | diverged` plus degraded
  states (`no-upstream | detached-head | no-remote | remote-unavailable
  | skipped`); `ahead`/`behind` counts; 3s `AbortController` timeout;
  respects `session.remote_sync: disabled` short-circuit. Test-first,
  9 behaviors per task spec at line ~3515.
