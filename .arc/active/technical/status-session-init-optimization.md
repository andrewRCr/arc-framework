# Status: Session-Init Optimization

> **About this file:** Per-WU state pointer — committed alongside task list updates
> in the same atomic operation. Lightweight factual state so anyone on this branch
> can see where work stands at a glance.
>
> **Companion:** `user/{identity}/SESSION-NOTES.md` (gitignored) carries personal
> session context. Together they implement P5 (Context Preservation). See
> `session-handoff.md` for the update protocol.

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** Task 3.R.d — `session.remote_sync` config addition (line ~1250)
- **Last Completed:** Tasks 3.R.b-3.R.c — added `arc user status` with online-by-default
  three-way sync reporting, offline and remote-identity inspection modes, freshness and
  backup detail surfacing, and handler/CLI wiring; then replaced single-shot pre-load
  backups with timestamped snapshots retained newest-three while preserving legacy
  `.pre-load-backup.json` visibility during transition. Updated `cli.ts`,
  `commands/user.ts`, `handlers/user.ts`, `__tests__/unit/user-handlers.test.ts`,
  new `__tests__/unit/user-status.test.ts`, and `__tests__/integration/user.test.ts`.
  Verification: `lint:ts`, `typecheck`, `typecheck:test`, targeted user/status vitest
  suites, and task-list markdown lint all clean.
- **Blockers:** [none]
- **Next Action:** Begin Task 3.R.d — add `session.remote_sync: enabled | disabled`
  to both `arc-config.yml` copies with inline documentation only; no behavior change yet.
  Keep the key scoped to session-init remote probing so 3.R.e can wire runtime behavior
  against a stable config surface.
