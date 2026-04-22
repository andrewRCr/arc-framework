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
- **Next Task:** Task 3.R.k.c — `arc config status` probe (line ~1790)
- **Last Completed:** Planning-phase update: inserted 3.R.k.c (`arc config status` probe) and
  3.R.k.g (session-init ordering review + workflow reorder); renumbered prior c/d/e to d/e/f.
  Composite's `config` slot renamed to `identity` (git-config-arc-scoped identity/role) so the
  `config` slot can host the arc-config probe result. Rationale added to notes; parent 3.R.k
  goal + design-decision bullets updated. Prior task-level completion: 3.R.k.b — `arc extensions
  status` probe + shared lib + `arc user status --json` retrofit (committed `2cd3b9c` + atomic
  follow-on `8c94688`).
- **Blockers:** none
- **Next Action:** Begin 3.R.k.c — `arc config status` probe. Shared parser in `src/lib/config/`
  (consume/extend existing `readPmMode` / `readSessionRemoteSyncEnabled`), command module in
  `src/commands/config/`, handler + CLI wiring. Full mode (all agent-consumable settings minus
  `hooks.*`), `--session-init` (init-gating subset: `session.remote_sync`, `branch.protection`,
  `pm.mode`, `commit.format`, `commit.context_footer`), `--json` (typed discriminated union on
  `mode`). Replaces Batch 1's whole-file arc-config.yml read.
