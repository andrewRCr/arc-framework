# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 5.0.f — Integration test coverage (line ~3693)
- **Last Completed:** Pre-implementation audit of 5.0.f surfaced
  significant overlap between the original 22-scenario list and
  existing unit coverage (worktree-sync classifier, composite
  envelope wiring, user-status qualifier emission, handleSync
  qualifier branches all already exhaustively unit-tested), plus
  scope ambiguity ("Integration AND E2E" with no qualified e2e
  scenario) and a wording bug ("both channels skipped" in the
  remote_sync-disabled case ignores the per-channel vocabulary
  asymmetry — `worktree: skipped`, `user: disabled`). Task block
  reshaped: title trimmed to "Integration test coverage", scenario
  list cut from 22 → 6 (4 composite-envelope + 2 `runUserStatus`
  real-exec), explicit `**Pre-existing unit coverage**` block added
  cross-referencing the four unit files that already cover the
  state matrix, `arc sync` integration explicitly scoped out (Clack
  `p.log.info` only assertable via unit-tier mocks), `addBareRemote`
  fixture gotcha documented (helper leaves local in sync with bare;
  drift requires direct ref manipulation), explicit acceptance
  block added. 5.0.e + 5.0.g remain shipped at `908f3ce` per prior
  handoff.
- **Blockers:** none
- **Next Action:** Begin Task 5.0.f — implement the 6 reshaped
  integration scenarios (4 in `__tests__/integration/status.test.ts`
  replacing the worktree-probe stub at line 185; 2 in
  `__tests__/integration/user.test.ts` extending the bare-remote
  pattern). Tier 2 gates expected clean. Task spec at line ~3693.
